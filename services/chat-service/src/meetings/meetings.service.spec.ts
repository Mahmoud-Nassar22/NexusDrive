import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { livekitApiUrl, MeetingsService, type RoomsApi } from './meetings.service';

function decodePayload(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

const bob = { sub: 'uid-bob', username: 'bob', roles: ['user'] };
const room = (name: string, metadata = '', creationTime = 1_800_000_000n) => ({
  name,
  metadata,
  numParticipants: 2,
  creationTime,
});

function setup() {
  const values: Partial<Env> = {
    LIVEKIT_URL: 'ws://livekit.test:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'a-test-secret-that-is-long-enough-for-hs256',
  };
  const config = { get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>;
  const rooms = { createRoom: jest.fn(), listRooms: jest.fn() };
  return { rooms, service: new MeetingsService(config, rooms as unknown as RoomsApi) };
}

describe('livekitApiUrl', () => {
  it('derives the HTTP API URL from the public WebSocket URL', () => {
    expect(livekitApiUrl('ws://localhost:7880')).toBe('http://localhost:7880');
    expect(livekitApiUrl('wss://meet.example.com')).toBe('https://meet.example.com');
    expect(livekitApiUrl('wss://meet.example.com', 'http://livekit:7880')).toBe(
      'http://livekit:7880',
    );
  });
});

describe('MeetingsService', () => {
  it('starts a meeting with a title and a token bound to the user and room', async () => {
    const { service, rooms } = setup();
    rooms.createRoom.mockImplementation(async (opts) => room(opts.name, opts.metadata));

    const info = await service.create(bob, 'Weekly sync');

    const opts = rooms.createRoom.mock.calls[0][0];
    expect(opts.name).toMatch(/^m-[0-9a-f]{12}$/);
    expect(JSON.parse(opts.metadata)).toEqual({ title: 'Weekly sync', createdBy: 'bob' });
    expect(info.meeting).toMatchObject({ title: 'Weekly sync', createdBy: 'bob' });
    expect(info.serverUrl).toBe('ws://livekit.test:7880');
    const payload = decodePayload(info.token);
    expect(payload.sub).toBe('uid-bob');
    expect(payload.video).toMatchObject({ room: opts.name, roomJoin: true });
  });

  it('lists running meetings, newest first, tolerating foreign metadata', async () => {
    const { service, rooms } = setup();
    rooms.listRooms.mockResolvedValue([
      room('old', '{"title":"Old"}', 1_700_000_000n),
      room('legacy-room', 'not json', 1_800_000_000n),
    ]);

    const meetings = await service.list();

    expect(meetings.map((m) => m.title)).toEqual(['legacy-room', 'Old']);
    expect(meetings[1]).toMatchObject({ participants: 2, startedAt: '2023-11-14T22:13:20.000Z' });
  });

  it('joins only meetings that are running', async () => {
    const { service, rooms } = setup();
    rooms.listRooms.mockResolvedValue([]);
    await expect(service.join(bob, 'm-gone')).rejects.toBeInstanceOf(NotFoundException);
    expect(rooms.listRooms).toHaveBeenCalledWith(['m-gone']);
  });

  it('reports LiveKit outages as 503', async () => {
    const { service, rooms } = setup();
    rooms.listRooms.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.list()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
