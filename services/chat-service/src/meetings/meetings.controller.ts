import { BadRequestException, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '@nexusdrive/common';
import { ROOM_PATTERN } from '../chat/chat.store';
import { MeetingsService } from './meetings.service';

/** Mounted under /api/chat (global prefix). */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** POST /api/chat/meetings/:room/token -> { serverUrl, token } for livekit-client */
  @Post(':room/token')
  createToken(@CurrentUser() user: AuthUser, @Param('room') room: string) {
    if (!ROOM_PATTERN.test(room)) {
      throw new BadRequestException('invalid room name');
    }
    return this.meetings.createJoinToken(user, room);
  }
}
