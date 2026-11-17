import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export type DepartmentRole = 'head' | 'lead' | 'worker';

export interface Membership {
  departmentId: string;
  departmentName: string;
  role: DepartmentRole;
}

/**
 * Asks user-service about the caller's place in the company. Calls carry the
 * caller's own token, so user-service checks it again and this service needs
 * no credentials of its own.
 */
@Injectable()
export class UserDirectoryClient {
  private readonly base: string;

  constructor(config: ConfigService<Env, true>) {
    this.base = `${config.get('USER_SERVICE_URL', { infer: true }).replace(/\/$/, '')}/api/users`;
  }

  /** The caller's department membership, or undefined if they have none. */
  async membership(token: string): Promise<Membership | undefined> {
    const me = await this.get<{ department?: Membership }>('/me', token);
    return me.department;
  }

  /** A department's name (admins only on the user-service side). */
  async departmentName(token: string, departmentId: string): Promise<string> {
    const dept = await this.get<{ name: string }>(
      `/departments/${encodeURIComponent(departmentId)}`,
      token,
    );
    return dept.name;
  }

  private async get<T>(path: string, token: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 404) throw new NotFoundException();
    if (!res.ok) throw new Error(`user-service returned ${res.status}`);
    return (await res.json()) as T;
  }
}
