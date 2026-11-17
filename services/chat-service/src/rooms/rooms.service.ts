import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '@nexusdrive/common';
import { randomBytes } from 'node:crypto';
import { ChatStore, DEFAULT_ROOM, type ChatRoom } from '../chat/chat.store';
import {
  UserDirectoryClient,
  type DepartmentRole,
  type Membership,
} from '../directory/user-directory.client';

const RANK: Record<DepartmentRole, number> = { worker: 0, lead: 1, head: 2 };
const isAdmin = (user: AuthUser) => user.roles.includes('admin');

/**
 * Who may join a room:
 * - company-wide, everyone: any signed-in user;
 * - company-wide, leads/heads: anyone holding at least that role in some department;
 * - department room: members of that department with at least `minRole`.
 * Platform admins manage rooms but get no extra access to conversations.
 */
export function canJoin(room: ChatRoom, membership?: Membership): boolean {
  if (!room.departmentId) {
    return (
      room.minRole === 'worker' || (!!membership && RANK[membership.role] >= RANK[room.minRole])
    );
  }
  return (
    !!membership &&
    membership.departmentId === room.departmentId &&
    RANK[membership.role] >= RANK[room.minRole]
  );
}

/** Admins manage every room; a department head manages their department's rooms. */
export function canManage(room: ChatRoom, user: AuthUser, membership?: Membership): boolean {
  if (isAdmin(user)) return true;
  return (
    !!room.departmentId &&
    membership?.role === 'head' &&
    membership.departmentId === room.departmentId
  );
}

export interface RoomView extends ChatRoom {
  canJoin: boolean;
  canManage: boolean;
}

export interface RoomListing {
  rooms: RoomView[];
  /** Where the caller may create rooms: anywhere (admin), their department (head), or nowhere. */
  canCreate: { anywhere: boolean; department?: { id: string; name: string } };
}

export interface CreateRoomInput {
  title: string;
  departmentId?: string;
  minRole: DepartmentRole;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly store: ChatStore,
    private readonly directory: UserDirectoryClient,
  ) {}

  async list(user: AuthUser, token: string): Promise<RoomListing> {
    const [rooms, membership] = await Promise.all([this.store.listRooms(), this.membership(token)]);
    return {
      rooms: rooms.map((room) => {
        const joinable = canJoin(room, membership);
        return {
          ...room,
          // Don't preview conversations the caller can't read.
          lastMessage: joinable ? room.lastMessage : undefined,
          canJoin: joinable,
          canManage: canManage(room, user, membership),
        };
      }),
      canCreate: {
        anywhere: isAdmin(user),
        department:
          membership?.role === 'head'
            ? { id: membership.departmentId, name: membership.departmentName }
            : undefined,
      },
    };
  }

  async create(user: AuthUser, token: string, input: CreateRoomInput): Promise<ChatRoom> {
    let departmentName: string | undefined;
    if (isAdmin(user)) {
      if (input.departmentId) {
        departmentName = await this.directory
          .departmentName(token, input.departmentId)
          .catch((err: unknown) => {
            if (err instanceof NotFoundException)
              throw new BadRequestException('unknown department');
            throw err;
          });
      }
    } else {
      const membership = await this.membership(token);
      if (membership?.role !== 'head') {
        throw new ForbiddenException('only admins and department heads can create rooms');
      }
      if (input.departmentId !== membership.departmentId) {
        throw new ForbiddenException('department heads create rooms for their own department');
      }
      departmentName = membership.departmentName;
    }

    return this.store.createRoom({
      id: `r-${randomBytes(6).toString('hex')}`,
      title: input.title,
      departmentId: input.departmentId,
      departmentName,
      minRole: input.minRole,
      createdBy: user.username,
    });
  }

  async remove(user: AuthUser, token: string, id: string): Promise<void> {
    const room = await this.requireRoom(id);
    if (room.id === DEFAULT_ROOM) {
      throw new BadRequestException('the General room cannot be deleted');
    }
    if (!canManage(room, user, await this.membership(token))) {
      throw new ForbiddenException('you cannot delete this room');
    }
    await this.store.deleteRoom(id);
  }

  /** Throws unless the caller may join (and read) the room. */
  async assertCanJoin(token: string, id: string): Promise<ChatRoom> {
    const room = await this.requireRoom(id);
    if (!canJoin(room, await this.membership(token))) {
      throw new ForbiddenException('you do not have access to this room');
    }
    return room;
  }

  private async requireRoom(id: string): Promise<ChatRoom> {
    const room = await this.store.getRoom(id);
    if (!room) throw new NotFoundException('room not found');
    return room;
  }

  /**
   * If user-service is unreachable, treat the caller as having no department:
   * company-wide rooms keep working and restricted rooms stay closed.
   */
  private async membership(token: string): Promise<Membership | undefined> {
    try {
      return await this.directory.membership(token);
    } catch (err) {
      this.logger.warn(`membership lookup failed: ${(err as Error).message}`);
      return undefined;
    }
  }
}
