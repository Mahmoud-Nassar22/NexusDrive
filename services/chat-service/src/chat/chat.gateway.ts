import { HttpException, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { TokenVerifier, type AuthUser } from '@nexusdrive/common';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, Socket } from 'socket.io';
import { RoomsService } from '../rooms/rooms.service';
import { ChatStore, ROOM_PATTERN, type ChatMessage, type ChatRoom } from './chat.store';
import { RedisPubSub } from './redis-pubsub';

type AuthedSocket = Socket & { data: { user?: AuthUser; token?: string } };

export type JoinAck =
  { ok: true; room: ChatRoom; history: ChatMessage[] } | { ok: false; error: string };

/**
 * socket.io endpoint at /api/chat/socket.io (under the Ingress path for this service).
 * Clients connect with `auth: { token }` (a Keycloak access token).
 *
 * Joining a room checks the caller's access (department and role, via user-service).
 * Tokens are short-lived while sockets are not, so `join` may carry a fresh token.
 *
 * With REDIS_URL set, rooms are shared across replicas through the Redis adapter.
 * Clients should use the websocket transport only, so no sticky sessions are needed.
 */
@WebSocketGateway({ path: '/api/chat/socket.io' })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly verifier: TokenVerifier,
    private readonly store: ChatStore,
    private readonly rooms: RoomsService,
    private readonly redis: RedisPubSub,
  ) {}

  afterInit(server: Server) {
    if (this.redis.clients) {
      server.adapter(createAdapter(this.redis.clients.pub, this.redis.clients.sub));
      this.logger.log('socket.io Redis adapter enabled');
    }
  }

  async handleConnection(client: AuthedSocket) {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('missing token');
      client.data.user = await this.verifier.verify(token);
      client.data.token = token;
    } catch (err) {
      this.logger.warn(`rejected socket ${client.id}: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  /** Answers through the ack: `{ ok: true, room, history }` or `{ ok: false, error }`. */
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { room?: string; token?: string },
  ): Promise<JoinAck> {
    try {
      const id = this.validRoom(body?.room);
      const token = await this.freshToken(client, body?.token);
      const room = await this.rooms.assertCanJoin(token, id);
      await client.join(id);
      return { ok: true, room, history: await this.store.recent(id) };
    } catch (err) {
      const message =
        err instanceof HttpException || err instanceof WsException
          ? err.message
          : 'could not join the room';
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { room?: string }) {
    await client.leave(this.validRoom(body?.room));
    return { ok: true };
  }

  @SubscribeMessage('message')
  async message(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { room?: string; text?: string },
  ): Promise<ChatMessage> {
    const room = this.validRoom(body?.room);
    const user = client.data.user;
    if (!user) throw new WsException('unauthenticated');
    // Access was checked when the socket joined the room.
    if (!client.rooms.has(room)) throw new WsException('join the room first');

    const text = (body?.text ?? '').trim().slice(0, 4000);
    if (!text) throw new WsException('empty message');

    const msg = await this.store.add({ room, text, from: user.username, fromSub: user.sub });
    this.server.to(room).emit('message', msg);
    return msg;
  }

  /** A token sent with the event, if valid and for the same user; else the connect-time token. */
  private async freshToken(client: AuthedSocket, token?: string): Promise<string> {
    if (!token) return client.data.token ?? '';
    const user = await this.verifier.verify(token).catch(() => {
      throw new WsException('invalid token');
    });
    if (user.sub !== client.data.user?.sub) throw new WsException('token belongs to another user');
    client.data.token = token;
    return token;
  }

  private validRoom(room: unknown): string {
    if (typeof room !== 'string' || !ROOM_PATTERN.test(room)) {
      throw new WsException('invalid room');
    }
    return room;
  }
}
