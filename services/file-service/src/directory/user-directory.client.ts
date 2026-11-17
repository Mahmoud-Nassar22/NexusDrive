import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export interface FileOwner {
  sub: string;
  username: string;
}

export interface Visibility {
  membership?: {
    departmentId: string;
    departmentName: string;
    role: 'head' | 'lead' | 'worker';
    leadUsername?: string;
  };
  /** The caller first, then everyone whose files they may see. */
  owners: FileOwner[];
}

/**
 * Asks user-service which users' files the caller may see (department rules
 * live there). Calls are made with the caller's own token, so user-service
 * checks it again and this service needs no credentials of its own.
 */
@Injectable()
export class UserDirectoryClient {
  private readonly url: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = `${config.get('USER_SERVICE_URL', { infer: true }).replace(/\/$/, '')}/api/users/me/visibility`;
  }

  async visibility(token: string): Promise<Visibility> {
    const res = await fetch(this.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      throw new Error(`user-service returned ${res.status}`);
    }
    return (await res.json()) as Visibility;
  }
}
