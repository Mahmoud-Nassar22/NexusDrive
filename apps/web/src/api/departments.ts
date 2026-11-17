import { apiFetch } from './client';
import type { DepartmentRole } from './me';

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

export type DepartmentDetail = Department & { members: DepartmentMember[] };

const base = '/api/users/departments';
const enc = encodeURIComponent;

export async function listDepartments(): Promise<Department[]> {
  const { departments } = await apiFetch<{ departments: Department[] }>(base);
  return departments;
}

export const getDepartment = (id: string) => apiFetch<DepartmentDetail>(`${base}/${enc(id)}`);

export const createDepartment = (name: string) =>
  apiFetch<DepartmentDetail>(base, { method: 'POST', body: JSON.stringify({ name }) });

export const renameDepartment = (id: string, name: string) =>
  apiFetch<DepartmentDetail>(`${base}/${enc(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

export const deleteDepartment = (id: string) =>
  apiFetch<void>(`${base}/${enc(id)}`, { method: 'DELETE' });

export const setMember = (
  id: string,
  userId: string,
  role: DepartmentRole,
  leadId?: string | null,
) =>
  apiFetch<DepartmentDetail>(`${base}/${enc(id)}/members/${enc(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ role, leadId: role === 'worker' ? (leadId ?? null) : null }),
  });

export const removeMember = (id: string, userId: string) =>
  apiFetch<DepartmentDetail>(`${base}/${enc(id)}/members/${enc(userId)}`, { method: 'DELETE' });
