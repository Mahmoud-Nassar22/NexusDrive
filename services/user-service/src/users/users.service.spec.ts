import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@nexusdrive/common';
import type { DepartmentsService } from '../departments/departments.service';
import type { KeycloakAdminClient } from '../keycloak/keycloak-admin.client';
import { UsersService } from './users.service';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const actor: AuthUser = { sub: ALICE, username: 'alice', roles: ['user', 'admin'] };

function setup(responses: Record<string, unknown>) {
  const request = jest.fn(async (method: string, path: string) => {
    const key = `${method} ${path.split('?')[0]}`;
    if (!(key in responses)) throw new Error(`unexpected ${key}`);
    return responses[key];
  });
  const departments = {
    membership: jest.fn().mockResolvedValue(undefined),
    memberships: jest.fn().mockResolvedValue(new Map()),
  } as unknown as DepartmentsService;
  const service = new UsersService({ request } as unknown as KeycloakAdminClient, departments);
  return { request, service };
}

describe('UsersService', () => {
  it('lists users and marks admins', async () => {
    const { service, request } = setup({
      'GET /users': [
        { id: ALICE, username: 'alice', enabled: true, createdTimestamp: 0 },
        { id: BOB, username: 'bob', enabled: false },
      ],
      'GET /roles/admin/users': [{ id: ALICE, username: 'alice', enabled: true }],
    });

    const users = await service.list('al');

    expect(request.mock.calls[0][1]).toContain('search=al');
    expect(users).toEqual([
      expect.objectContaining({ id: ALICE, isAdmin: true, createdAt: '1970-01-01T00:00:00.000Z' }),
      expect.objectContaining({ id: BOB, isAdmin: false, enabled: false }),
    ]);
  });

  it('grants the admin role through realm role mappings', async () => {
    const { service, request } = setup({
      'GET /roles/admin': { id: 'role-id', name: 'admin' },
      [`POST /users/${BOB}/role-mappings/realm`]: undefined,
      [`GET /users/${BOB}`]: { id: BOB, username: 'bob', enabled: true },
      [`GET /users/${BOB}/role-mappings/realm`]: [{ id: 'role-id', name: 'admin' }],
    });

    const user = await service.setAdmin(actor, BOB, true);

    expect(request).toHaveBeenCalledWith('POST', `/users/${BOB}/role-mappings/realm`, [
      { id: 'role-id', name: 'admin' },
    ]);
    expect(user.isAdmin).toBe(true);
  });

  it('disables an account', async () => {
    const { service, request } = setup({
      [`PUT /users/${BOB}`]: undefined,
      [`GET /users/${BOB}`]: { id: BOB, username: 'bob', enabled: false },
      [`GET /users/${BOB}/role-mappings/realm`]: [],
    });

    const user = await service.setEnabled(actor, BOB, false);

    expect(request).toHaveBeenCalledWith('PUT', `/users/${BOB}`, { enabled: false });
    expect(user.enabled).toBe(false);
  });

  it('stops admins from locking themselves out', async () => {
    const { service, request } = setup({});
    await expect(service.setAdmin(actor, ALICE, false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setEnabled(actor, ALICE, false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
