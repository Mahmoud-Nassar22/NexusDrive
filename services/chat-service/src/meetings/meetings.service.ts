import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import { AccessToken } from 'livekit-server-sdk';
import type { Env } from '../config/env';

export interface MeetingJoinInfo {
  room: string;
  serverUrl: string;
  token: string;
}

/**
 * Issues short-lived LiveKit tokens. The media itself (audio/video) flows
 * between the browser and the LiveKit server over WebRTC, not through this service.
 */
@Injectable()
export class MeetingsService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async createJoinToken(user: AuthUser, room: string): Promise<MeetingJoinInfo> {
    const token = new AccessToken(
      this.config.get('LIVEKIT_API_KEY', { infer: true }),
      this.config.get('LIVEKIT_API_SECRET', { infer: true }),
      { identity: user.sub, name: user.username, ttl: '1h' },
    );
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return {
      room,
      serverUrl: this.config.get('LIVEKIT_URL', { infer: true }),
      token: await token.toJwt(),
    };
  }
}
