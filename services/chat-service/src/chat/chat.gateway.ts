import { Logger } from '@nestjs/common';
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
import { ChatStore, ROOM_PATTERN, type ChatMessage } from './chat.store';
import { RedisPubSub } from './redis-pubsub';

type AuthedSocket = Socket & { data: { user?: AuthUser } };

/**
 * socket.io endpoint at /api/chat/socket.io (under the Ingress path for this service).
 * Clients connect with `auth: { token }` (a Keycloak access token).
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
    } catch (err) {
      this.logger.warn(`rejected socket ${client.id}: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { room?: string }) {
    const room = this.validRoom(body?.room);
    await client.join(room);
    return { room, history: await this.store.recent(room) };
  }

  @SubscribeMessage('message')
  async message(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { room?: string; text?: string },
  ): Promise<ChatMessage> {
    const room = this.validRoom(body?.room);
    const user = client.data.user;
    if (!user) throw new WsException('unauthenticated');
    if (!client.rooms.has(room)) throw new WsException('join the room first');

    const text = (body?.text ?? '').trim().slice(0, 4000);
    if (!text) throw new WsException('empty message');

    const msg = await this.store.add({ room, text, from: user.username, fromSub: user.sub });
    this.server.to(room).emit('message', msg);
    return msg;
  }

  private validRoom(room: unknown): string {
    if (typeof room !== 'string' || !ROOM_PATTERN.test(room)) {
      throw new WsException('invalid room name');
    }
    return room;
  }
}
