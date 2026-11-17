import { Injectable } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  room: string;
  text: string;
  from: string;
  fromSub: string;
  at: string;
}

export type NewChatMessage = Omit<ChatMessage, 'id' | 'at'>;

export const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** How many messages `recent()` returns (and the memory store keeps) per room. */
export const MAX_PER_ROOM = 100;

/**
 * Where chat history lives. The gateway and controller only depend on this class;
 * app.module picks the implementation: Postgres when DATABASE_URL is set,
 * otherwise memory.
 */
export abstract class ChatStore {
  abstract add(input: NewChatMessage): Promise<ChatMessage>;
  /** The latest MAX_PER_ROOM messages of a room, oldest first. */
  abstract recent(room: string): Promise<ChatMessage[]>;
}

/**
 * Keeps the most recent messages per room in memory. History is lost on restart
 * and is not shared between replicas, so use it for local development only.
 */
@Injectable()
export class MemoryChatStore extends ChatStore {
  private readonly rooms = new Map<string, ChatMessage[]>();
  private seq = 0;

  async add(input: NewChatMessage): Promise<ChatMessage> {
    const message: ChatMessage = {
      ...input,
      id: `${Date.now()}-${++this.seq}`,
      at: new Date().toISOString(),
    };
    const list = this.rooms.get(input.room) ?? [];
    list.push(message);
    if (list.length > MAX_PER_ROOM) {
      list.splice(0, list.length - MAX_PER_ROOM);
    }
    this.rooms.set(input.room, list);
    return message;
  }

  async recent(room: string): Promise<ChatMessage[]> {
    return [...(this.rooms.get(room) ?? [])];
  }
}
