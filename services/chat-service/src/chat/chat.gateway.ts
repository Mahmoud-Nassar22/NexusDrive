import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { TokenVerifier, type AuthUser } from '@nexusdrive/common';
import type { Server, Socket } from 'socket.io';
import { ChatStore, ROOM_PATTERN, type ChatMessage } from './chat.store';

type AuthedSocket = Socket & { data: { user?: AuthUser } };

/**
 * socket.io endpoint at /api/chat/socket.io (under the Ingress path for this service).
 * Clients connect with `auth: { token }` (a Keycloak access token).
 *
 * TODO: with more than one replica, add @socket.io/redis-adapter (REDIS_URL)
 * so a message reaches users connected to other pods.
 */
@WebSocketGateway({ path: '/api/chat/socket.io' })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly verifier: TokenVerifier,
    private readonly store: ChatStore,
  ) {}

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
    return { room, history: this.store.recent(room) };
  }

  @SubscribeMessage('message')
  message(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { room?: string; text?: string },
  ): ChatMessage {
    const room = this.validRoom(body?.room);
    const user = client.data.user;
    if (!user) throw new WsException('unauthenticated');
    if (!client.rooms.has(room)) throw new WsException('join the room first');

    const text = (body?.text ?? '').trim().slice(0, 4000);
    if (!text) throw new WsException('empty message');

    const msg = this.store.add({ room, text, from: user.username, fromSub: user.sub });
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
