import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Database } from '../database/database.service';
import type { KeycloakAdminClient } from '../keycloak/keycloak-admin.client';
import { DepartmentsService, type DepartmentRole } from './departments.service';

const DEPT = '33333333-3333-4333-8333-333333333333';
const membershipRow = (role: DepartmentRole) => ({
  user_id: 'me',
  department_id: DEPT,
  department_name: 'Engineering',
  role,
  lead_id: null,
  lead_username: null,
});

/** db.query answers by matching a substring of the SQL. */
function setup(answers: Array<[string, unknown[]]>) {
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>(async (sql) => {
    const hit = answers.find(([needle]) => sql.includes(needle));
    return hit ? hit[1] : [];
  });
  const db = { query, transaction: jest.fn((fn) => fn(query)) } as unknown as Database;
  const keycloak = {
    request: jest.fn().mockResolvedValue({ username: 'bob' }),
  } as unknown as KeycloakAdminClient;
  return { query, service: new DepartmentsService(db, keycloak) };
}

const me = { sub: 'me', username: 'me', roles: ['user'] };

describe('DepartmentsService.visibility', () => {
  it('a user outside any department sees only their own files', async () => {
    const { service } = setup([]);
    expect((await service.visibility(me)).owners).toEqual([{ sub: 'me', username: 'me' }]);
  });

  it('a worker sees only their own files', async () => {
    const { service, query } = setup([['FROM department_members m', [membershipRow('worker')]]]);
    const v = await service.visibility(me);
    expect(v.owners).toEqual([{ sub: 'me', username: 'me' }]);
    expect(v.membership?.role).toBe('worker');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('a team leader sees their team', async () => {
    const { service, query } = setup([
      ['FROM department_members m', [membershipRow('lead')]],
      ['WHERE lead_id = $2', [{ user_id: 'w1', username: 'worker1' }]],
    ]);
    const v = await service.visibility(me);
    expect(v.owners.map((o) => o.sub)).toEqual(['me', 'w1']);
    expect(query.mock.calls[1][1]).toEqual([DEPT, 'me']);
  });

  it('a head sees the whole department', async () => {
    const { service } = setup([
      ['FROM department_members m', [membershipRow('head')]],
      [
        'WHERE department_id = $1 AND user_id <> $2',
        [
          { user_id: 'l1', username: 'lead1' },
          { user_id: 'w1', username: 'worker1' },
        ],
      ],
    ]);
    expect((await service.visibility(me)).owners.map((o) => o.sub)).toEqual(['me', 'l1', 'w1']);
  });
});

describe('DepartmentsService.setMember', () => {
  const dept = [
    'FROM departments d',
    [{ id: DEPT, name: 'Eng', created_at: new Date(), member_count: 0, head_id: null }],
  ] as [string, unknown[]];
  const USER = '44444444-4444-4444-8444-444444444444';
  const LEAD = '55555555-5555-4555-8555-555555555555';

  it('only workers can have a team leader', async () => {
    const { service } = setup([dept]);
    await expect(service.setMember(DEPT, USER, 'lead', LEAD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a team leader who is not a lead in this department', async () => {
    const { service } = setup([dept]);
    await expect(service.setMember(DEPT, USER, 'worker', LEAD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows only one head', async () => {
    const { service } = setup([dept, ["role = 'head' AND user_id <> $2", [{ username: 'carol' }]]]);
    await expect(service.setMember(DEPT, USER, 'head')).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears the team of someone who stops being a team leader', async () => {
    const { service, query } = setup([dept, ['FOR UPDATE', [{ department_id: DEPT }]]]);
    await service.setMember(DEPT, USER, 'worker');
    const sqls = query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((s) => s.includes('SET lead_id = NULL WHERE lead_id = $1'))).toBe(true);
    expect(sqls.some((s) => s.includes('ON CONFLICT (user_id) DO UPDATE'))).toBe(true);
  });
});
