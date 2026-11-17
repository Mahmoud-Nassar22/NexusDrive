import { apiFetch } from './client';
import type { Membership } from './me';

export interface FileEntry {
  name: string;
  size: number;
  lastModified?: string;
  owner: { sub: string; username: string };
  /** The caller's own file (editable and deletable). */
  mine: boolean;
}

export interface FileListing {
  files: FileEntry[];
  membership?: Membership;
  /** The permissions service was unreachable; only own files are listed. */
  limited: boolean;
}

interface UploadTarget {
  name: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

const enc = encodeURIComponent;

export function listFiles(): Promise<FileListing> {
  return apiFetch<FileListing>('/api/files');
}

/** Asks file-service for a presigned URL, then sends the bytes straight to S3. */
export async function uploadFile(
  file: Blob,
  filename: string,
  contentType = file.type || 'application/octet-stream',
): Promise<void> {
  const target = await apiFetch<UploadTarget>('/api/files/upload-url', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType, size: file.size }),
  });
  const res = await fetch(target.url, {
    method: target.method,
    headers: target.headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`upload failed (${res.status})`);
  }
}

/** Own file by default; pass `ownerSub` for a colleague's file you may see. */
export async function getDownloadUrl(name: string, ownerSub?: string): Promise<string> {
  const query = ownerSub ? `?owner=${enc(ownerSub)}` : '';
  const { url } = await apiFetch<{ url: string }>(`/api/files/${enc(name)}/download-url${query}`);
  return url;
}

export function deleteFile(name: string): Promise<void> {
  return apiFetch<void>(`/api/files/${enc(name)}`, { method: 'DELETE' });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
