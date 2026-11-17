import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BearerToken, CurrentUser, JwtAuthGuard, type AuthUser } from '@nexusdrive/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ChatStore, ROOM_PATTERN } from '../chat/chat.store';
import type { DepartmentRole } from '../directory/user-directory.client';
import { RoomsService } from './rooms.service';

export class CreateRoomDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  /** Omit for a company-wide room. */
  @IsOptional()
  @IsUUID('all')
  departmentId?: string;

  /** Lowest department role allowed in: worker (everyone), lead, or head. */
  @IsIn(['worker', 'lead', 'head'])
  minRole: DepartmentRole = 'worker';
}

function validRoom(id: string): string {
  if (!ROOM_PATTERN.test(id)) throw new BadRequestException('invalid room id');
  return id;
}

/** Mounted under /api/chat (global prefix). */
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly store: ChatStore,
  ) {}

  /** GET /api/chat/rooms: every room, marked with whether the caller may join or manage it */
  @Get()
  list(@CurrentUser() user: AuthUser, @BearerToken() token: string) {
    return this.rooms.list(user, token);
  }

  /** POST /api/chat/rooms { title, departmentId?, minRole }: admins anywhere, heads in their department */
  @Post()
  create(@CurrentUser() user: AuthUser, @BearerToken() token: string, @Body() dto: CreateRoomDto) {
    return this.rooms.create(user, token, dto);
  }

  /** DELETE /api/chat/rooms/:id (room and its history) */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @BearerToken() token: string,
    @Param('id') id: string,
  ) {
    await this.rooms.remove(user, token, validRoom(id));
  }

  /** GET /api/chat/rooms/:id/messages: recent history, if the caller may join */
  @Get(':id/messages')
  async messages(@BearerToken() token: string, @Param('id') id: string) {
    await this.rooms.assertCanJoin(token, validRoom(id));
    return { room: id, messages: await this.store.recent(id) };
  }
}
