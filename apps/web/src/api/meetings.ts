import { apiFetch } from './client';

export interface Meeting {
  room: string;
  title: string;
  createdBy?: string;
  participants: number;
  startedAt: string;
}

export interface JoinInfo {
  meeting: Meeting;
  serverUrl: string;
  token: string;
}

export async function listMeetings(): Promise<Meeting[]> {
  const { meetings } = await apiFetch<{ meetings: Meeting[] }>('/api/chat/meetings');
  return meetings;
}

export function startMeeting(title: string): Promise<JoinInfo> {
  return apiFetch<JoinInfo>('/api/chat/meetings', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function joinMeeting(room: string): Promise<JoinInfo> {
  return apiFetch<JoinInfo>(`/api/chat/meetings/${encodeURIComponent(room)}/token`, {
    method: 'POST',
  });
}

/** "just now", "5 min ago", "2 h ago" */
export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
