import { apiFetch } from './client';

export type DepartmentRole = 'head' | 'lead' | 'worker';

export const ROLE_LABEL: Record<DepartmentRole, string> = {
  head: 'Department head',
  lead: 'Team leader',
  worker: 'Worker',
};

export interface Membership {
  departmentId: string;
  departmentName: string;
  role: DepartmentRole;
  leadId?: string;
  leadUsername?: string;
}

export interface Me {
  sub: string;
  username: string;
  email?: string;
  roles: string[];
  department?: Membership;
}

export const getMe = () => apiFetch<Me>('/api/users/me');

/** One line explaining whose files someone sees, by their department role. */
export function visibilityText(m?: Membership): string {
  if (!m) return 'You are not in a department yet, so you see only your own files.';
  switch (m.role) {
    case 'head':
      return `You are the head of ${m.departmentName}: you see every member's files.`;
    case 'lead':
      return `You lead a team in ${m.departmentName}: you see your own and your team's files.`;
    case 'worker':
      return `You are in ${m.departmentName}${m.leadUsername ? ` (team of ${m.leadUsername})` : ''}: you see your own files.`;
  }
}
