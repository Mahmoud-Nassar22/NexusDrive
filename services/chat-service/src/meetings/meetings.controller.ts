import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '@nexusdrive/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ROOM_PATTERN } from '../chat/chat.store';
import { MeetingsService } from './meetings.service';

export class CreateMeetingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}

/** Mounted under /api/chat (global prefix). */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** GET /api/chat/meetings: meetings running right now */
  @Get()
  async list() {
    return { meetings: await this.meetings.list() };
  }

  /** POST /api/chat/meetings { title } -> starts a meeting and returns a join token */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user, dto.title);
  }

  /** POST /api/chat/meetings/:room/token -> { meeting, serverUrl, token } for livekit-client */
  @Post(':room/token')
  join(@CurrentUser() user: AuthUser, @Param('room') room: string) {
    if (!ROOM_PATTERN.test(room)) {
      throw new BadRequestException('invalid meeting id');
    }
    return this.meetings.join(user, room);
  }
}
