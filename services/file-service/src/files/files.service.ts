import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import type { Env } from '../config/env';
import { StorageService } from '../storage/storage.service';
import type { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { sanitizeFilename, userPrefix } from './filename';

export interface FileEntry {
  name: string;
  size: number;
  lastModified?: string;
}

/**
 * File operations scoped to the calling user. The browser transfers file bytes
 * directly to/from S3 with presigned URLs, so large files never pass through this pod.
 *
 * TODO: store file metadata (owner, sharing, folders, quotas) in Postgres.
 */
@Injectable()
export class FilesService {
  private readonly maxUploadBytes: number;
  private readonly ttl: number;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.maxUploadBytes = config.get('MAX_UPLOAD_BYTES', { infer: true });
    this.ttl = config.get('PRESIGN_TTL_SECONDS', { infer: true });
  }

  async list(user: AuthUser): Promise<FileEntry[]> {
    const prefix = userPrefix(user.sub);
    const objects = await this.storage.list(prefix);
    return objects.map((o) => ({
      name: o.key.slice(prefix.length),
      size: o.size,
      lastModified: o.lastModified?.toISOString(),
    }));
  }

  async createUploadUrl(user: AuthUser, dto: CreateUploadUrlDto) {
    if (dto.size !== undefined && dto.size > this.maxUploadBytes) {
      throw new PayloadTooLargeException(`max upload size is ${this.maxUploadBytes} bytes`);
    }
    const name = this.safeName(dto.filename);
    const contentType = dto.contentType || 'application/octet-stream';
    const url = await this.storage.presignUpload(this.key(user, name), contentType);
    return {
      name,
      url,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: this.ttl,
    };
  }

  async createDownloadUrl(user: AuthUser, filename: string) {
    const name = this.safeName(filename);
    const url = await this.storage.presignDownload(this.key(user, name), name);
    return { name, url, expiresIn: this.ttl };
  }

  async delete(user: AuthUser, filename: string): Promise<void> {
    await this.storage.delete(this.key(user, this.safeName(filename)));
  }

  private key(user: AuthUser, name: string): string {
    return `${userPrefix(user.sub)}${name}`;
  }

  private safeName(filename: string): string {
    const name = sanitizeFilename(filename);
    if (!name) {
      throw new BadRequestException('invalid filename');
    }
    return name;
  }
}
