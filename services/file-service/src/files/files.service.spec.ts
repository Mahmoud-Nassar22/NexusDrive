import {
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import type { Env } from '../config/env';
import type { UserDirectoryClient } from '../directory/user-directory.client';
import type { StorageService } from '../storage/storage.service';
import { sanitizeFilename } from './filename';
import { FilesService } from './files.service';

const alice: AuthUser = { sub: 'uid-alice', username: 'alice', roles: ['user'] };
const TOKEN = 'token';

function setup(owners = [{ sub: 'uid-alice', username: 'alice' }]) {
  const storage = {
    list: jest.fn(async (prefix: string) =>
      prefix === 'users/uid-alice/'
        ? [{ key: 'users/uid-alice/report.pdf', size: 42, lastModified: new Date('2026-01-01') }]
        : [{ key: `${prefix}notes.txt`, size: 7, lastModified: new Date('2026-02-01') }],
    ),
    presignUpload: jest.fn().mockResolvedValue('https://s3/upload'),
    presignDownload: jest.fn().mockResolvedValue('https://s3/download'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const directory = { visibility: jest.fn().mockResolvedValue({ owners }) };
  const values: Partial<Env> = { MAX_UPLOAD_BYTES: 1000, PRESIGN_TTL_SECONDS: 60 };
  const config = { get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>;
  const service = new FilesService(
    storage as unknown as StorageService,
    directory as unknown as UserDirectoryClient,
    config,
  );
  return { storage, directory, service };
}

describe('sanitizeFilename', () => {
  it('strips directories and traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\notes.txt')).toBe('notes.txt');
  });

  it('removes leading dots and rejects empty names', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('..')).toBeNull();
    expect(sanitizeFilename('   ')).toBeNull();
  });
});

describe('FilesService', () => {
  it('lists own files without the key prefix', async () => {
    const { service, storage } = setup();
    const { files, limited } = await service.list(alice, TOKEN);
    expect(storage.list).toHaveBeenCalledWith('users/uid-alice/');
    expect(limited).toBe(false);
    expect(files).toEqual([
      {
        name: 'report.pdf',
        size: 42,
        lastModified: '2026-01-01T00:00:00.000Z',
        owner: { sub: 'uid-alice', username: 'alice' },
        mine: true,
      },
    ]);
  });

  it('also lists the files of people the caller may see, newest first', async () => {
    const { service } = setup([
      { sub: 'uid-alice', username: 'alice' },
      { sub: 'uid-bob', username: 'bob' },
    ]);
    const { files } = await service.list(alice, TOKEN);
    expect(files.map((f) => [f.owner.username, f.name, f.mine])).toEqual([
      ['bob', 'notes.txt', false],
      ['alice', 'report.pdf', true],
    ]);
  });

  it('falls back to own files when user-service is down', async () => {
    const { service, directory } = setup();
    directory.visibility.mockRejectedValue(new Error('ECONNREFUSED'));
    const { files, limited } = await service.list(alice, TOKEN);
    expect(limited).toBe(true);
    expect(files.map((f) => f.name)).toEqual(['report.pdf']);
  });

  it('presigns uploads under the caller’s prefix', async () => {
    const { service, storage } = setup();
    const res = await service.createUploadUrl(alice, { filename: '../evil.txt', size: 10 });
    expect(storage.presignUpload).toHaveBeenCalledWith(
      'users/uid-alice/evil.txt',
      'application/octet-stream',
    );
    expect(res).toMatchObject({ name: 'evil.txt', url: 'https://s3/upload', method: 'PUT' });
  });

  it('rejects uploads over the size limit', async () => {
    const { service } = setup();
    await expect(
      service.createUploadUrl(alice, { filename: 'big.bin', size: 5000 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects invalid filenames', async () => {
    const { service } = setup();
    await expect(service.createDownloadUrl(alice, TOKEN, '..')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('downloads a visible colleague’s file from their prefix', async () => {
    const { service, storage } = setup([
      { sub: 'uid-alice', username: 'alice' },
      { sub: 'uid-bob', username: 'bob' },
    ]);
    await service.createDownloadUrl(alice, TOKEN, 'notes.txt', 'uid-bob');
    expect(storage.presignDownload).toHaveBeenCalledWith('users/uid-bob/notes.txt', 'notes.txt');
  });

  it('refuses files of people the caller may not see', async () => {
    const { service, storage } = setup();
    await expect(
      service.createDownloadUrl(alice, TOKEN, 'notes.txt', 'uid-mallory'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });

  it('fails closed when permissions cannot be checked', async () => {
    const { service, directory } = setup();
    directory.visibility.mockRejectedValue(new Error('timeout'));
    await expect(
      service.createDownloadUrl(alice, TOKEN, 'notes.txt', 'uid-bob'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
