import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@nexusdrive/common';
import type { Env } from '../config/env';
import {
  UserDirectoryClient,
  type FileOwner,
  type Visibility,
} from '../directory/user-directory.client';
import { StorageService } from '../storage/storage.service';
import type { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { sanitizeFilename, userPrefix } from './filename';

export interface FileEntry {
  name: string;
  size: number;
  lastModified?: string;
  owner: FileOwner;
  /** True for the caller's own files (they can edit and delete these). */
  mine: boolean;
}

export interface FileListing {
  files: FileEntry[];
  membership?: Visibility['membership'];
  /** True when user-service was unreachable and only the caller's own files are listed. */
  limited: boolean;
}

/**
 * File operations for the calling user. The browser transfers file bytes
 * directly to/from S3 with presigned URLs, so large files never pass through this pod.
 *
 * Everyone uploads into their own folder (users/<sub>/). Reading is wider:
 * department heads and team leaders also see their people's files (rules in
 * user-service). Only the owner can overwrite or delete a file.
 *
 * TODO: store file metadata (folders, sharing, quotas) in Postgres.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxUploadBytes: number;
  private readonly ttl: number;

  constructor(
    private readonly storage: StorageService,
    private readonly directory: UserDirectoryClient,
    config: ConfigService<Env, true>,
  ) {
    this.maxUploadBytes = config.get('MAX_UPLOAD_BYTES', { infer: true });
    this.ttl = config.get('PRESIGN_TTL_SECONDS', { infer: true });
  }

  async list(user: AuthUser, token: string): Promise<FileListing> {
    const self: FileOwner = { sub: user.sub, username: user.username };
    let visibility: Visibility = { owners: [self] };
    let limited = false;
    try {
      visibility = await this.directory.visibility(token);
    } catch (err) {
      // Degrade to "own files only" rather than failing the whole page.
      this.logger.warn(`visibility lookup failed: ${(err as Error).message}`);
      limited = true;
    }

    const perOwner = await Promise.all(
      visibility.owners.map(async (owner) => {
        const prefix = userPrefix(owner.sub);
        const objects = await this.storage.list(prefix);
        return objects.map((o): FileEntry => ({
          name: o.key.slice(prefix.length),
          size: o.size,
          lastModified: o.lastModified?.toISOString(),
          owner,
          mine: owner.sub === user.sub,
        }));
      }),
    );
    const files = perOwner
      .flat()
      .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
    return { files, membership: visibility.membership, limited };
  }

  async createUploadUrl(user: AuthUser, dto: CreateUploadUrlDto) {
    if (dto.size !== undefined && dto.size > this.maxUploadBytes) {
      throw new PayloadTooLargeException(`max upload size is ${this.maxUploadBytes} bytes`);
    }
    const name = this.safeName(dto.filename);
    const contentType = dto.contentType || 'application/octet-stream';
    const url = await this.storage.presignUpload(this.key(user.sub, name), contentType);
    return {
      name,
      url,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: this.ttl,
    };
  }

  /** Own files, or (with `ownerSub`) a file of someone the caller may see. */
  async createDownloadUrl(user: AuthUser, token: string, filename: string, ownerSub?: string) {
    const name = this.safeName(filename);
    const owner = ownerSub || user.sub;
    if (owner !== user.sub) {
      await this.assertVisible(token, owner);
    }
    const url = await this.storage.presignDownload(this.key(owner, name), name);
    return { name, url, expiresIn: this.ttl };
  }

  async delete(user: AuthUser, filename: string): Promise<void> {
    await this.storage.delete(this.key(user.sub, this.safeName(filename)));
  }

  private async assertVisible(token: string, ownerSub: string): Promise<void> {
    let visibility: Visibility;
    try {
      visibility = await this.directory.visibility(token);
    } catch (err) {
      this.logger.warn(`visibility lookup failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('cannot check file permissions right now');
    }
    if (!visibility.owners.some((o) => o.sub === ownerSub)) {
      throw new ForbiddenException('you cannot access this user’s files');
    }
  }

  private key(ownerSub: string, name: string): string {
    return `${userPrefix(ownerSub)}${name}`;
  }

  private safeName(filename: string): string {
    const name = sanitizeFilename(filename);
    if (!name) {
      throw new BadRequestException('invalid filename');
    }
    return name;
  }
}
