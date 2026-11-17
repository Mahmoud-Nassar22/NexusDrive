import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MeetingsService } from './meetings.service';

function decodePayload(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

describe('MeetingsService', () => {
  const values: Partial<Env> = {
    LIVEKIT_URL: 'ws://livekit.test:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'a-test-secret-that-is-long-enough-for-hs256',
  };
  const config = { get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>;
  const service = new MeetingsService(config);

  it('issues a token bound to the user and the room', async () => {
    const info = await service.createJoinToken(
      { sub: 'uid-bob', username: 'bob', roles: ['user'] },
      'team-standup',
    );

    expect(info.serverUrl).toBe('ws://livekit.test:7880');
    const payload = decodePayload(info.token);
    expect(payload.sub).toBe('uid-bob');
    expect(payload.iss).toBe('devkey');
    expect(payload.video).toMatchObject({ room: 'team-standup', roomJoin: true });
  });
});
