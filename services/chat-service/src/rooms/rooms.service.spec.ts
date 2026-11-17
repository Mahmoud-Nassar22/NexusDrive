import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@nexusdrive/common';
import type { ChatRoom, ChatStore } from '../chat/chat.store';
import type { Membership, UserDirectoryClient } from '../directory/user-directory.client';
import { canJoin, canManage, RoomsService } from './rooms.service';

const ENG = '11111111-1111-4111-8111-111111111111';
const OPS = '22222222-2222-4222-8222-222222222222';

const room = (over: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'r-1',
  title: 'Room',
  minRole: 'worker',
  createdBy: 'demo',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const member = (role: Membership['role'], departmentId = ENG): Membership => ({
  departmentId,
  departmentName: departmentId === ENG ? 'Engineering' : 'Ops',
  role,
});
const user = (roles: string[] = ['user']): AuthUser => ({ sub: 'u', username: 'u', roles });

describe('canJoin', () => {
  it('company-wide rooms for everyone admit anyone, even without a department', () => {
    expect(canJoin(room())).toBe(true);
  });

  it('company-wide leadership rooms admit leads and heads of any department', () => {
    const leaders = room({ minRole: 'lead' });
    expect(canJoin(leaders, member('lead', OPS))).toBe(true);
    expect(canJoin(leaders, member('head'))).toBe(true);
    expect(canJoin(leaders, member('worker'))).toBe(false);
    expect(canJoin(leaders)).toBe(false);
  });

  it('department rooms admit only that department, from the minimum role up', () => {
    const engLeads = room({ departmentId: ENG, minRole: 'lead' });
    expect(canJoin(engLeads, member('head'))).toBe(true);
    expect(canJoin(engLeads, member('lead'))).toBe(true);
    expect(canJoin(engLeads, member('worker'))).toBe(false);
    expect(canJoin(engLeads, member('head', OPS))).toBe(false);
    expect(canJoin(room({ departmentId: ENG }), member('worker'))).toBe(true);
  });
});

describe('canManage', () => {
  it('admins manage everything; heads only their own department’s rooms', () => {
    expect(canManage(room(), user(['admin']))).toBe(true);
    expect(canManage(room({ departmentId: ENG }), user(), member('head'))).toBe(true);
    expect(canManage(room({ departmentId: OPS }), user(), member('head'))).toBe(false);
    expect(canManage(room(), user(), member('head'))).toBe(false);
    expect(canManage(room({ departmentId: ENG }), user(), member('lead'))).toBe(false);
  });
});

describe('RoomsService', () => {
  function setup(membership?: Membership, rooms: ChatRoom[] = []) {
    const store = {
      listRooms: jest.fn().mockResolvedValue(rooms),
      getRoom: jest.fn(async (id: string) => rooms.find((r) => r.id === id)),
      createRoom: jest.fn(async (r) => ({ ...r, createdAt: 'now' })),
      deleteRoom: jest.fn().mockResolvedValue(true),
    };
    const directory = {
      membership: jest.fn().mockResolvedValue(membership),
      departmentName: jest.fn().mockResolvedValue('Ops'),
    };
    const service = new RoomsService(
      store as unknown as ChatStore,
      directory as unknown as UserDirectoryClient,
    );
    return { store, directory, service };
  }

  it('hides the last message of rooms the caller cannot join', async () => {
    const secret = room({
      id: 'r-2',
      departmentId: OPS,
      lastMessage: { from: 'x', text: 'secret', at: 'now' },
    });
    const { service } = setup(member('worker'), [secret]);
    const { rooms } = await service.list(user(), 't');
    expect(rooms[0]).toMatchObject({ canJoin: false, lastMessage: undefined });
  });

  it('lets a head create rooms only in their own department', async () => {
    const { service, store } = setup(member('head'));
    await service.create(user(), 't', { title: 'Eng leads', departmentId: ENG, minRole: 'lead' });
    expect(store.createRoom.mock.calls[0][0]).toMatchObject({
      departmentId: ENG,
      departmentName: 'Engineering',
      minRole: 'lead',
    });
    await expect(
      service.create(user(), 't', { title: 'x', departmentId: OPS, minRole: 'worker' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(user(), 't', { title: 'x', minRole: 'worker' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let workers or leads create rooms', async () => {
    const { service } = setup(member('lead'));
    await expect(
      service.create(user(), 't', { title: 'x', departmentId: ENG, minRole: 'worker' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets admins create rooms for any department, looking up its name', async () => {
    const { service, store, directory } = setup();
    await service.create(user(['admin']), 't', {
      title: 'Ops',
      departmentId: OPS,
      minRole: 'worker',
    });
    expect(directory.departmentName).toHaveBeenCalledWith('t', OPS);
    expect(store.createRoom.mock.calls[0][0]).toMatchObject({ departmentName: 'Ops' });
  });

  it('rejects an unknown department', async () => {
    const { service, directory } = setup();
    directory.departmentName.mockRejectedValue(new NotFoundException());
    await expect(
      service.create(user(['admin']), 't', { title: 'x', departmentId: OPS, minRole: 'worker' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('protects the General room and checks who may delete', async () => {
    const general = room({ id: 'general' });
    const ops = room({ id: 'r-ops', departmentId: OPS });
    const { service, store } = setup(member('head'), [general, ops]);
    await expect(service.remove(user(['admin']), 't', 'general')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove(user(), 't', 'r-ops')).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.deleteRoom).not.toHaveBeenCalled();
  });

  it('fails closed for department rooms when user-service is down', async () => {
    const { service, directory } = setup(undefined, [room({ id: 'r-eng', departmentId: ENG })]);
    directory.membership.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.assertCanJoin('t', 'r-eng')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
