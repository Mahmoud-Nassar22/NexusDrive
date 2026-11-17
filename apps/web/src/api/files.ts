import { apiFetch } from './client';

export interface FileEntry {
  name: string;
  size: number;
  lastModified?: string;
}

interface UploadTarget {
  name: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

const enc = encodeURIComponent;

export async function listFiles(): Promise<FileEntry[]> {
  const { files } = await apiFetch<{ files: FileEntry[] }>('/api/files');
  return files;
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

export async function getDownloadUrl(name: string): Promise<string> {
  const { url } = await apiFetch<{ url: string }>(`/api/files/${enc(name)}/download-url`);
  return url;
}

export function deleteFile(name: string): Promise<void> {
  return apiFetch<void>(`/api/files/${enc(name)}`, { method: 'DELETE' });
}
