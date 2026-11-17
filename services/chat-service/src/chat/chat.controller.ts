import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@nexusdrive/common';
import { ChatStore, ROOM_PATTERN } from './chat.store';

/** Mounted under /api/chat (global prefix). */
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly store: ChatStore) {}

  /** GET /api/chat/rooms/:room/messages */
  @Get(':room/messages')
  async messages(@Param('room') room: string) {
    if (!ROOM_PATTERN.test(room)) {
      throw new BadRequestException('invalid room name');
    }
    return { room, messages: await this.store.recent(room) };
  }
}
