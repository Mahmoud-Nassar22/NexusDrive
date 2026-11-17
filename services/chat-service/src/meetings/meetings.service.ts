import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import { AccessToken, type RoomServiceClient } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env';

/** The parts of LiveKit's room API we use (injected so tests can fake it). */
export type RoomsApi = Pick<RoomServiceClient, 'createRoom' | 'listRooms'>;
export const LIVEKIT_ROOMS = Symbol('LIVEKIT_ROOMS');

/** LIVEKIT_API_URL, or the public LIVEKIT_URL with ws(s):// turned into http(s)://. */
export function livekitApiUrl(publicUrl: string, apiUrl?: string): string {
  return apiUrl || publicUrl.replace(/^ws(s?):\/\//, 'http$1://');
}

export interface Meeting {
  room: string;
  title: string;
  createdBy?: string;
  participants: number;
  startedAt: string;
}

export interface MeetingJoinInfo {
  meeting: Meeting;
  serverUrl: string;
  token: string;
}

/** A meeting with nobody in it closes after this long. */
const EMPTY_TIMEOUT_SECONDS = 300;
/** After the last person leaves, the meeting closes after this long. */
const DEPARTURE_TIMEOUT_SECONDS = 30;

/**
 * Meetings are LiveKit rooms. The list of active meetings comes straight from
 * LiveKit, so there is nothing to keep in sync. This service only creates rooms
 * and issues short-lived join tokens; audio and video flow between the browser
 * and LiveKit over WebRTC.
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(LIVEKIT_ROOMS) private readonly rooms: RoomsApi,
  ) {}

  async list(): Promise<Meeting[]> {
    const rooms = await this.livekit(() => this.rooms.listRooms());
    return rooms
      .map((r) => this.toMeeting(r))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async create(user: AuthUser, title: string): Promise<MeetingJoinInfo> {
    const room = `m-${randomBytes(6).toString('hex')}`;
    const created = await this.livekit(() =>
      this.rooms.createRoom({
        name: room,
        emptyTimeout: EMPTY_TIMEOUT_SECONDS,
        departureTimeout: DEPARTURE_TIMEOUT_SECONDS,
        metadata: JSON.stringify({ title, createdBy: user.username }),
      }),
    );
    return this.joinInfo(user, this.toMeeting(created));
  }

  /** Joins a meeting that is currently running. */
  async join(user: AuthUser, room: string): Promise<MeetingJoinInfo> {
    const [found] = await this.livekit(() => this.rooms.listRooms([room]));
    if (!found) {
      throw new NotFoundException('this meeting has ended');
    }
    return this.joinInfo(user, this.toMeeting(found));
  }

  private async joinInfo(user: AuthUser, meeting: Meeting): Promise<MeetingJoinInfo> {
    const token = new AccessToken(
      this.config.get('LIVEKIT_API_KEY', { infer: true }),
      this.config.get('LIVEKIT_API_SECRET', { infer: true }),
      { identity: user.sub, name: user.username, ttl: '1h' },
    );
    token.addGrant({
      room: meeting.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return {
      meeting,
      serverUrl: this.config.get('LIVEKIT_URL', { infer: true }),
      token: await token.toJwt(),
    };
  }

  private toMeeting(room: {
    name: string;
    metadata: string;
    numParticipants: number;
    creationTime: bigint;
  }): Meeting {
    let meta: { title?: string; createdBy?: string } = {};
    try {
      meta = room.metadata ? JSON.parse(room.metadata) : {};
    } catch {
      // Rooms created outside this service may have other metadata.
    }
    return {
      room: room.name,
      title: meta.title || room.name,
      createdBy: meta.createdBy,
      participants: room.numParticipants,
      startedAt: new Date(Number(room.creationTime) * 1000).toISOString(),
    };
  }

  /** LiveKit being down should give a clear 503, not a generic 500. */
  private async livekit<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      this.logger.warn(`LiveKit API call failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('the meeting server is not reachable');
    }
  }
}
