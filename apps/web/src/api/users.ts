import { apiFetch } from './client';
import type { Membership } from './me';

export interface UserSummary {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdAt?: string;
  isAdmin: boolean;
  department?: Membership;
}

const enc = encodeURIComponent;

export async function listUsers(search = ''): Promise<UserSummary[]> {
  const query = search ? `?search=${enc(search)}` : '';
  const { users } = await apiFetch<{ users: UserSummary[] }>(`/api/users${query}`);
  return users;
}

export function setAdmin(id: string, admin: boolean): Promise<UserSummary> {
  return apiFetch<UserSummary>(`/api/users/${enc(id)}/admin`, {
    method: 'PUT',
    body: JSON.stringify({ admin }),
  });
}

export function setEnabled(id: string, enabled: boolean): Promise<UserSummary> {
  return apiFetch<UserSummary>(`/api/users/${enc(id)}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}
