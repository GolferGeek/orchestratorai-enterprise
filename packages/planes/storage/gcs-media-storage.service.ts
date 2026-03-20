import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { randomUUID } from 'crypto';
import type { MediaStorageProvider } from './media-storage-provider.interface';
import type {
  MediaStorageMetadata,
  StoredMediaResult,
} from './media-storage.types';

// Lazy-loaded GCS client to allow the module to load even when
// @google-cloud/storage is not installed at import time.
interface GcsFile {
  save(
    data: Buffer,
    options: { metadata: { contentType: string } },
  ): Promise<void>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<void>;
  getSignedUrl(options: { action: string; expires: number }): Promise<[string]>;
  download(): Promise<[Buffer]>;
}
interface GcsBucketItem {
  name: string;
  metadata?: {
    size?: string | number;
    [key: string]: unknown;
  };
}
interface GcsBucket {
  file(path: string): GcsFile;
  getFiles(options?: { prefix?: string }): Promise<[GcsBucketItem[]]>;
  create(options?: { location?: string }): Promise<void>;
}
interface GcsBucketMeta {
  name: string;
}
interface GcsStorage {
  bucket(name: string): GcsBucket;
  getBuckets(): Promise<[GcsBucketMeta[]]>;
  createBucket(name: string, options?: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class GcsMediaStorageService implements MediaStorageProvider {
  private readonly logger = new Logger(GcsMediaStorageService.name);
  private readonly storage: GcsStorage;
  private readonly mediaBucket: string;
  private readonly legalBucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(private readonly db: DatabaseService) {
    const projectId = this.requireEnv('GCS_PROJECT_ID');
    this.mediaBucket = this.requireEnv('GCS_BUCKET_MEDIA');
    this.legalBucket = this.requireEnv('GCS_BUCKET_LEGAL');
    this.signedUrlTtlSeconds = process.env.GCS_SIGNED_URL_TTL_SECONDS
      ? this.requirePositiveInteger(
          'GCS_SIGNED_URL_TTL_SECONDS',
          process.env.GCS_SIGNED_URL_TTL_SECONDS,
        )
      : 900;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require('@google-cloud/storage') as {
      Storage: new (opts: { projectId: string }) => GcsStorage;
    };
    this.storage = new Storage({ projectId });
  }

  async storeGeneratedMedia(
    data: Buffer,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult> {
    const assetId = randomUUID();
    const extension = this.getExtensionFromMime(metadata.mime);
    const filename = `${assetId}.${extension}`;
    const storagePath = this.buildStoragePath(context, filename);

    this.logger.log(
      `[GCS-STORAGE] Storing media: ${storagePath} (${data.length} bytes)`,
    );

    const bucket = this.storage.bucket(this.mediaBucket);
    const file = bucket.file(storagePath);
    await file.save(data, {
      metadata: {
        contentType: metadata.mime,
      },
    });

    const publicUrl = await this.buildSignedUrl(this.mediaBucket, storagePath);

    const insertResult = await this.db
      .from(null, 'assets')
      .insert({
        id: assetId,
        storage: 'gcs',
        bucket: this.mediaBucket,
        object_key: storagePath,
        mime: metadata.mime,
        size: data.length,
        width: metadata.width || null,
        height: metadata.height || null,
        user_id: context.userId,
        conversation_id: context.conversationId,
        metadata: {
          prompt: metadata.prompt,
          revisedPrompt: metadata.revisedPrompt,
          provider: metadata.provider,
          model: metadata.model,
          conversationId: context.conversationId,
          orgSlug: context.orgSlug,
          durationSeconds: metadata.durationSeconds,
          parentAssetId: metadata.parentAssetId,
        },
      })
      .select()
      .single();

    const assetError = insertResult.error;
    if (assetError) {
      await file.delete({ ignoreNotFound: true });
      throw new Error(`Failed to create asset record: ${assetError.message}`);
    }

    const assetRecord = insertResult.data as { id: string } | null;
    if (!assetRecord) {
      await file.delete({ ignoreNotFound: true });
      throw new Error('Failed to create asset record: no data returned');
    }

    return {
      assetId: assetRecord.id,
      url: publicUrl,
      storagePath,
      mimeType: metadata.mime,
      sizeBytes: data.length,
    };
  }

  async downloadAndStore(
    url: string,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return this.storeGeneratedMedia(
      Buffer.from(arrayBuffer),
      context,
      metadata,
    );
  }

  async getAsset(
    assetId: string,
    context: ExecutionContext,
  ): Promise<{
    id: string;
    url: string;
    mime: string;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
  } | null> {
    const queryResult = await this.db
      .from(null, 'assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (queryResult.error || !queryResult.data) {
      return null;
    }

    const record = queryResult.data as {
      id: string;
      conversation_id: string | null;
      bucket: string;
      object_key: string;
      mime: string;
      width?: number;
      height?: number;
      metadata?: Record<string, unknown>;
    };

    if (
      record.conversation_id &&
      record.conversation_id !== context.conversationId
    ) {
      return null;
    }

    const bucketName = record.bucket || this.mediaBucket;
    const signedUrl = await this.buildSignedUrl(bucketName, record.object_key);

    return {
      id: record.id,
      url: signedUrl,
      mime: record.mime,
      width: record.width,
      height: record.height,
      metadata: record.metadata,
    };
  }

  async linkToDeliverableVersion(
    assetId: string,
    deliverableVersionId: string,
    _context: ExecutionContext,
  ): Promise<void> {
    const { error } = await this.db
      .from(null, 'assets')
      .update({
        deliverable_version_id: deliverableVersionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId);

    if (error) {
      throw new Error(`Failed to link asset to deliverable: ${error.message}`);
    }
  }

  async deleteAsset(assetId: string, context: ExecutionContext): Promise<void> {
    const asset = await this.getAsset(assetId, context);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found or not accessible`);
    }

    const { data: record } = (await this.db
      .from(null, 'assets')
      .select('bucket, object_key')
      .eq('id', assetId)
      .single()) as {
      data: { bucket: string; object_key: string } | null;
      error: { message: string } | null;
    };

    if (record) {
      const bucketName = record.bucket || this.mediaBucket;
      const file = this.storage.bucket(bucketName).file(record.object_key);
      await file.delete({ ignoreNotFound: true });
    }

    const { error: dbError } = await this.db
      .from(null, 'assets')
      .delete()
      .eq('id', assetId);

    if (dbError) {
      throw new Error(`Failed to delete asset record: ${dbError.message}`);
    }
  }

  async deleteStorageObjects(
    bucket: string,
    objectKeys: string[],
  ): Promise<{ deleted: number; errors: string[] }> {
    if (objectKeys.length === 0) {
      return { deleted: 0, errors: [] };
    }

    const errors: string[] = [];
    let deleted = 0;

    for (const key of objectKeys) {
      try {
        const file = this.storage.bucket(bucket).file(key);
        await file.delete({ ignoreNotFound: true });
        deleted++;
      } catch (err) {
        errors.push(
          `Failed to delete ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { deleted, errors };
  }

  private buildStoragePath(
    context: ExecutionContext,
    filename: string,
  ): string {
    const orgSlug = context.orgSlug || 'global';
    const conversationId = context.conversationId || 'unknown';
    const agentSlug = context.agentSlug || 'unknown';
    return `${orgSlug}/${conversationId}/${agentSlug}/${filename}`;
  }

  private getExtensionFromMime(mime: string): string {
    const mimeMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/mpeg': 'mp3',
    };
    return mimeMap[mime] || 'bin';
  }

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  private requirePositiveInteger(
    envName: string,
    value: string | undefined,
  ): number {
    if (!value || value.trim() === '') {
      throw new Error(`Missing required environment variable: ${envName}`);
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid ${envName} value '${value}'. Expected a positive integer.`,
      );
    }
    return parsed;
  }

  private async buildSignedUrl(
    bucketName: string,
    objectKey: string,
  ): Promise<string> {
    const [signedUrl]: [string] = await this.storage
      .bucket(bucketName)
      .file(objectKey)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + this.signedUrlTtlSeconds * 1000,
      });
    return signedUrl;
  }

  async upload(
    bucket: string,
    path: string,
    data: Buffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string; publicUrl: string }> {
    const file = this.storage.bucket(bucket).file(path);
    await file.save(data, {
      metadata: {
        contentType: options?.contentType ?? 'application/octet-stream',
      },
    });
    return { path, publicUrl: this.getPublicUrl(bucket, path) };
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    for (const path of paths) {
      const file = this.storage.bucket(bucket).file(path);
      await file.delete({ ignoreNotFound: true });
    }
  }

  async list(
    bucket: string,
    path: string,
    options?: { search?: string },
  ): Promise<
    { name: string; size?: number; metadata?: Record<string, unknown> }[]
  > {
    const [files] = await this.storage
      .bucket(bucket)
      .getFiles({ prefix: path });

    return files
      .map((f) => {
        const name = f.name.startsWith(path + '/')
          ? f.name.slice(path.length + 1)
          : f.name;
        const size =
          f.metadata?.size !== undefined ? Number(f.metadata.size) : undefined;
        return {
          name,
          size,
          metadata: f.metadata as Record<string, unknown> | undefined,
        };
      })
      .filter((f) => !options?.search || f.name.includes(options.search));
  }

  getPublicUrl(bucket: string, path: string): string {
    // GCS public URL pattern - bucket must be publicly accessible
    return `https://storage.googleapis.com/${bucket}/${path}`;
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const file = this.storage.bucket(bucket).file(path);
    const [data] = await file.download();

    const ext = path.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      gltf: 'model/gltf+json',
      glb: 'model/gltf-binary',
      stl: 'model/stl',
      step: 'application/step',
      dxf: 'application/dxf',
      json: 'application/json',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    return { data, contentType };
  }

  async listBuckets(): Promise<string[]> {
    const [buckets] = await this.storage.getBuckets();
    return buckets.map((b) => b.name);
  }

  async ensureBucketExists(
    bucket: string,
    _options?: {
      public?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    },
  ): Promise<void> {
    const buckets = await this.listBuckets();
    if (!buckets.includes(bucket)) {
      await this.storage.bucket(bucket).create();
    }
  }
}
