import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadinessRegistry } from '@nexusdrive/common';
import type { Env } from '../config/env';

export interface StoredObject {
  key: string;
  size: number;
  lastModified?: Date;
}

/**
 * Thin wrapper around S3. Credentials come from the default AWS chain:
 * IRSA / Pod Identity in EKS, env vars locally (MinIO).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly readiness: ReadinessRegistry,
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.ttl = config.get('PRESIGN_TTL_SECONDS', { infer: true });
    this.s3 = new S3Client({
      region: config.get('AWS_REGION', { infer: true }),
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    });
  }

  onModuleInit() {
    this.readiness.register('s3', () =>
      this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })),
    );
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) {
        objects.push({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified });
      }
      token = page.NextContinuationToken;
    } while (token);
    return objects;
  }

  presignUpload(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: this.ttl },
    );
  }

  presignDownload(key: string, downloadName: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${downloadName}"`,
      }),
      { expiresIn: this.ttl },
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
