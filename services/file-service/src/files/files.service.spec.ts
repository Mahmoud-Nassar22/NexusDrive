import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import type { Env } from '../config/env';
import type { StorageService } from '../storage/storage.service';
import { sanitizeFilename } from './filename';
import { FilesService } from './files.service';

const alice: AuthUser = { sub: 'uid-alice', username: 'alice', roles: ['user'] };

function setup() {
  const storage = {
    list: jest
      .fn()
      .mockResolvedValue([
        {
          key: 'users/uid-alice/report.pdf',
          size: 42,
          lastModified: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
    presignUpload: jest.fn().mockResolvedValue('https://s3/upload'),
    presignDownload: jest.fn().mockResolvedValue('https://s3/download'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const values: Partial<Env> = { MAX_UPLOAD_BYTES: 1000, PRESIGN_TTL_SECONDS: 60 };
  const config = { get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>;
  return { storage, service: new FilesService(storage as unknown as StorageService, config) };
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
  it('lists only the caller’s files, without the key prefix', async () => {
    const { service, storage } = setup();
    const files = await service.list(alice);
    expect(storage.list).toHaveBeenCalledWith('users/uid-alice/');
    expect(files).toEqual([
      { name: 'report.pdf', size: 42, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
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
    await expect(service.createDownloadUrl(alice, '..')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
