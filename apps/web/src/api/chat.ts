import { apiFetch } from './client';
import type { DepartmentRole } from './me';

export interface ChatMessage {
  id: string;
  room: string;
  text: string;
  from: string;
  at: string;
}

export interface ChatRoom {
  id: string;
  title: string;
  departmentId?: string;
  departmentName?: string;
  minRole: DepartmentRole;
  createdBy: string;
  createdAt: string;
  lastMessage?: { from: string; text: string; at: string };
  canJoin: boolean;
  canManage: boolean;
}

export interface RoomListing {
  rooms: ChatRoom[];
  canCreate: { anywhere: boolean; department?: { id: string; name: string } };
}

export const listRooms = () => apiFetch<RoomListing>('/api/chat/rooms');

export const createRoom = (input: {
  title: string;
  departmentId?: string;
  minRole: DepartmentRole;
}) => apiFetch<ChatRoom>('/api/chat/rooms', { method: 'POST', body: JSON.stringify(input) });

export const deleteRoom = (id: string) =>
  apiFetch<void>(`/api/chat/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Who can join, in words: "Everyone", "Engineering", "Engineering · leads & head", … */
export function audienceLabel(room: Pick<ChatRoom, 'departmentId' | 'departmentName' | 'minRole'>) {
  if (!room.departmentId) {
    return { worker: 'Everyone', lead: 'All team leaders & heads', head: 'All department heads' }[
      room.minRole
    ];
  }
  const dept = room.departmentName ?? 'Department';
  return { worker: dept, lead: `${dept} · leads & head`, head: `${dept} · head only` }[
    room.minRole
  ];
}
