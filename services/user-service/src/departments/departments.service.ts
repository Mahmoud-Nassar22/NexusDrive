import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '@nexusdrive/common';
import { Database, type Query } from '../database/database.service';
import { KeycloakAdminClient } from '../keycloak/keycloak-admin.client';

export const DEPARTMENT_ROLES = ['head', 'lead', 'worker'] as const;
export type DepartmentRole = (typeof DEPARTMENT_ROLES)[number];

export interface Department {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  head?: { userId: string; username: string };
}

export interface DepartmentMember {
  userId: string;
  username: string;
  role: DepartmentRole;
  leadId?: string;
  leadUsername?: string;
}

export interface Membership {
  departmentId: string;
  departmentName: string;
  role: DepartmentRole;
  leadId?: string;
  leadUsername?: string;
}

export interface FileOwner {
  sub: string;
  username: string;
}

/** Whose files a user may see. The user themself is always first. */
export interface Visibility {
  membership?: Membership;
  owners: FileOwner[];
}

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown) =>
  (err as { code?: string } | null)?.code === UNIQUE_VIOLATION;

const DEPARTMENT_SQL = `
  SELECT d.id, d.name, d.created_at,
         count(m.user_id)::int AS member_count,
         max(h.user_id) AS head_id, max(h.username) AS head_username
  FROM departments d
  LEFT JOIN department_members m ON m.department_id = d.id
  LEFT JOIN department_members h ON h.department_id = d.id AND h.role = 'head'`;

interface DepartmentRow {
  id: string;
  name: string;
  created_at: Date;
  member_count: number;
  head_id: string | null;
  head_username: string | null;
}

const toDepartment = (r: DepartmentRow): Department => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at.toISOString(),
  memberCount: r.member_count,
  head: r.head_id ? { userId: r.head_id, username: r.head_username ?? '' } : undefined,
});

interface MembershipRow {
  user_id: string;
  department_id: string;
  department_name: string;
  role: DepartmentRole;
  lead_id: string | null;
  lead_username: string | null;
}

const MEMBERSHIP_SQL = `
  SELECT m.user_id, m.department_id, d.name AS department_name, m.role,
         m.lead_id, l.username AS lead_username
  FROM department_members m
  JOIN departments d ON d.id = m.department_id
  LEFT JOIN department_members l ON l.user_id = m.lead_id`;

const toMembership = (r: MembershipRow): Membership => ({
  departmentId: r.department_id,
  departmentName: r.department_name,
  role: r.role,
  leadId: r.lead_id ?? undefined,
  leadUsername: r.lead_username ?? undefined,
});

/**
 * Company structure: departments, each with one head, team leaders and workers.
 * Workers may belong to a team leader's team.
 *
 * File visibility narrows from the top down:
 *   head   → every member's files in the department
 *   lead   → their own files and their team's (workers who report to them)
 *   worker → only their own files
 * Platform admins manage the structure but get no extra file access.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly db: Database,
    private readonly keycloak: KeycloakAdminClient,
  ) {}

  async list(): Promise<Department[]> {
    const rows = await this.db.query<DepartmentRow>(
      `${DEPARTMENT_SQL} GROUP BY d.id ORDER BY d.name`,
    );
    return rows.map(toDepartment);
  }

  async get(id: string): Promise<Department & { members: DepartmentMember[] }> {
    const [dept] = await this.db.query<DepartmentRow>(
      `${DEPARTMENT_SQL} WHERE d.id = $1 GROUP BY d.id`,
      [id],
    );
    if (!dept) throw new NotFoundException('department not found');

    const members = await this.db.query<{
      user_id: string;
      username: string;
      role: DepartmentRole;
      lead_id: string | null;
      lead_username: string | null;
    }>(
      `SELECT m.user_id, m.username, m.role, m.lead_id, l.username AS lead_username
       FROM department_members m
       LEFT JOIN department_members l ON l.user_id = m.lead_id
       WHERE m.department_id = $1
       ORDER BY CASE m.role WHEN 'head' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END, m.username`,
      [id],
    );
    return {
      ...toDepartment(dept),
      members: members.map((m) => ({
        userId: m.user_id,
        username: m.username,
        role: m.role,
        leadId: m.lead_id ?? undefined,
        leadUsername: m.lead_username ?? undefined,
      })),
    };
  }

  async create(name: string): Promise<Department> {
    try {
      const [row] = await this.db.query<{ id: string }>(
        'INSERT INTO departments (name) VALUES ($1) RETURNING id',
        [name],
      );
      return this.get(row.id);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(`department "${name}" already exists`);
      throw err;
    }
  }

  async rename(id: string, name: string): Promise<Department> {
    try {
      const rows = await this.db.query(
        'UPDATE departments SET name = $2 WHERE id = $1 RETURNING id',
        [id, name],
      );
      if (rows.length === 0) throw new NotFoundException('department not found');
      return this.get(id);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(`department "${name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const rows = await this.db.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) throw new NotFoundException('department not found');
  }

  /**
   * Adds a user to a department or changes their role there. A user is in at
   * most one department, so this moves them if they were somewhere else.
   */
  async setMember(
    departmentId: string,
    userId: string,
    role: DepartmentRole,
    leadId?: string | null,
  ): Promise<Department & { members: DepartmentMember[] }> {
    if (leadId && role !== 'worker') {
      throw new BadRequestException('only workers report to a team leader');
    }
    if (leadId === userId) {
      throw new BadRequestException('a user cannot be their own team leader');
    }
    await this.get(departmentId); // 404 if missing
    const user = await this.keycloak.request<{ username: string }>('GET', `/users/${userId}`);

    try {
      await this.db.transaction(async (query) => {
        const [previous] = await query<{ department_id: string }>(
          'SELECT department_id FROM department_members WHERE user_id = $1 FOR UPDATE',
          [userId],
        );
        if (leadId) await this.assertLead(query, departmentId, leadId);
        if (role === 'head') await this.assertNoOtherHead(query, departmentId, userId);

        // Someone who stops being a team leader here no longer has a team.
        if (previous && (role !== 'lead' || previous.department_id !== departmentId)) {
          await query('UPDATE department_members SET lead_id = NULL WHERE lead_id = $1', [userId]);
        }
        await query(
          `INSERT INTO department_members (user_id, username, department_id, role, lead_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE
             SET username = EXCLUDED.username, department_id = EXCLUDED.department_id,
                 role = EXCLUDED.role, lead_id = EXCLUDED.lead_id, updated_at = now()`,
          [userId, user.username, departmentId, role, leadId ?? null],
        );
      });
    } catch (err) {
      // Two admins making two different heads at the same moment.
      if (isUniqueViolation(err)) throw new ConflictException('this department already has a head');
      throw err;
    }
    return this.get(departmentId);
  }

  async removeMember(departmentId: string, userId: string) {
    // Their workers' lead_id is cleared by ON DELETE SET NULL.
    const rows = await this.db.query(
      'DELETE FROM department_members WHERE department_id = $1 AND user_id = $2 RETURNING user_id',
      [departmentId, userId],
    );
    if (rows.length === 0) throw new NotFoundException('user is not in this department');
    return this.get(departmentId);
  }

  async membership(userId: string): Promise<Membership | undefined> {
    const [row] = await this.db.query<MembershipRow>(`${MEMBERSHIP_SQL} WHERE m.user_id = $1`, [
      userId,
    ]);
    return row ? toMembership(row) : undefined;
  }

  async memberships(userIds: string[]): Promise<Map<string, Membership>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db.query<MembershipRow>(`${MEMBERSHIP_SQL} WHERE m.user_id = ANY($1)`, [
      userIds,
    ]);
    return new Map(rows.map((r) => [r.user_id, toMembership(r)]));
  }

  async visibility(user: AuthUser): Promise<Visibility> {
    const self: FileOwner = { sub: user.sub, username: user.username };
    const membership = await this.membership(user.sub);
    if (!membership || membership.role === 'worker') {
      return { membership, owners: [self] };
    }

    const others = await this.db.query<{ user_id: string; username: string }>(
      membership.role === 'head'
        ? 'SELECT user_id, username FROM department_members WHERE department_id = $1 AND user_id <> $2'
        : 'SELECT user_id, username FROM department_members WHERE lead_id = $2 AND department_id = $1',
      [membership.departmentId, user.sub],
    );
    return {
      membership,
      owners: [self, ...others.map((o) => ({ sub: o.user_id, username: o.username }))],
    };
  }

  private async assertLead(query: Query, departmentId: string, leadId: string) {
    const rows = await query(
      `SELECT 1 FROM department_members WHERE user_id = $1 AND department_id = $2 AND role = 'lead'`,
      [leadId, departmentId],
    );
    if (rows.length === 0) {
      throw new BadRequestException(
        'the chosen team leader is not a team leader in this department',
      );
    }
  }

  private async assertNoOtherHead(query: Query, departmentId: string, userId: string) {
    const [head] = await query<{ username: string }>(
      `SELECT username FROM department_members
       WHERE department_id = $1 AND role = 'head' AND user_id <> $2`,
      [departmentId, userId],
    );
    if (head) {
      throw new ConflictException(
        `${head.username} is already the head of this department; change their role first`,
      );
    }
  }
}
