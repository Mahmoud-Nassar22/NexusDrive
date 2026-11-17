import { Injectable } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  room: string;
  text: string;
  from: string;
  fromSub: string;
  at: string;
}

export const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PER_ROOM = 100;

/**
 * Keeps the most recent messages per room in memory.
 *
 * TODO: replace with Postgres (message history survives restarts and is shared
 * between replicas). Keep this method signature so the gateway doesn't change.
 */
@Injectable()
export class ChatStore {
  private readonly rooms = new Map<string, ChatMessage[]>();
  private seq = 0;

  add(input: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
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

  recent(room: string): ChatMessage[] {
    return [...(this.rooms.get(room) ?? [])];
  }
}
