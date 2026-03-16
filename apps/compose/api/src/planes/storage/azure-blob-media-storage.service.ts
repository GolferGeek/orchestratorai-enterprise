import { Injectable, Logger } from '@nestjs/common';
import { BlobSASPermissions, BlobServiceClient } from '@azure/storage-blob';
import { DatabaseService, QueryResult } from '../database';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { randomUUID } from 'crypto';
import type { MediaStorageProvider } from './media-storage-provider.interface';
import type {
  MediaStorageMetadata,
  StoredMediaResult,
} from './media-storage.types';

@Injectable()
export class AzureBlobMediaStorageService implements MediaStorageProvider {
  private readonly logger = new Logger(AzureBlobMediaStorageService.name);
  private readonly containerName: string;
  private readonly blobServiceClient: BlobServiceClient;
  private readonly useSasUrls =
    process.env.AZURE_STORAGE_USE_SAS_URLS === 'true';
  private readonly sasTtlSeconds = this.useSasUrls
    ? this.requirePositiveInteger(
        'AZURE_STORAGE_SAS_TTL_SECONDS',
        process.env.AZURE_STORAGE_SAS_TTL_SECONDS,
      )
    : null;

  constructor(private readonly db: DatabaseService) {
    this.containerName = this.requireEnv('AZURE_STORAGE_CONTAINER_MEDIA');
    const connectionString = this.requireEnv('AZURE_STORAGE_CONNECTION_STRING');
    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
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
      `📦 [AZURE-BLOB-STORAGE] Storing media: ${storagePath} (${data.length} bytes)`,
    );

    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    const blobClient = containerClient.getBlockBlobClient(storagePath);
    await blobClient.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: metadata.mime,
      },
    });

    const publicUrl = await this.buildAccessUrl(blobClient);

    const insertResult = await this.db
      .from(null, 'assets')
      .insert({
        id: assetId,
        storage: 'azure_blob',
        bucket: this.containerName,
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
          taskId: context.taskId,
          orgSlug: context.orgSlug,
          durationSeconds: metadata.durationSeconds,
          parentAssetId: metadata.parentAssetId,
        },
      })
      .select()
      .single();

    const assetError = insertResult.error;
    if (assetError) {
      await blobClient.deleteIfExists();
      throw new Error(`Failed to create asset record: ${assetError.message}`);
    }

    const assetRecord = insertResult.data as { id: string } | null;
    if (!assetRecord) {
      await blobClient.deleteIfExists();
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

    const bucket = record.bucket || this.containerName;
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(record.object_key);

    return {
      id: record.id,
      url: await this.buildAccessUrl(blobClient),
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
      .single()) as QueryResult<unknown>;

    if (record) {
      const typedRecord = record as { bucket: string; object_key: string };
      const containerClient = this.blobServiceClient.getContainerClient(
        typedRecord.bucket || this.containerName,
      );
      const blobClient = containerClient.getBlobClient(typedRecord.object_key);
      await blobClient.deleteIfExists();
    }

    const { error: dbError } = await this.db
      .from(null, 'assets')
      .delete()
      .eq('id', assetId);

    if (dbError) {
      throw new Error(`Failed to delete asset record: ${dbError.message}`);
    }
  }

  private buildStoragePath(
    context: ExecutionContext,
    filename: string,
  ): string {
    const orgSlug = context.orgSlug || 'global';
    const conversationId = context.conversationId || 'unknown';
    const taskId = context.taskId || 'unknown';
    return `${orgSlug}/${conversationId}/${taskId}/${filename}`;
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

  private async buildAccessUrl(blobClient: {
    url: string;
    generateSasUrl?: (options: {
      permissions: BlobSASPermissions;
      expiresOn: Date;
    }) => Promise<string>;
  }): Promise<string> {
    if (!this.useSasUrls) {
      return blobClient.url;
    }

    if (typeof blobClient.generateSasUrl !== 'function') {
      throw new Error(
        'AZURE_STORAGE_USE_SAS_URLS is enabled but blob client cannot generate SAS URLs',
      );
    }

    return blobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + (this.sasTtlSeconds as number) * 1000),
    });
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
    const containerClient = this.blobServiceClient.getContainerClient(bucket);

    for (const key of objectKeys) {
      const blobClient = containerClient.getBlobClient(key);
      const result = await blobClient.deleteIfExists();
      if (result.succeeded) {
        deleted++;
      } else {
        errors.push(`Failed to delete ${key}`);
      }
    }

    return { deleted, errors };
  }

  async upload(
    bucket: string,
    path: string,
    data: Buffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string; publicUrl: string }> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlockBlobClient(path);
    await blobClient.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: options?.contentType,
      },
    });
    return { path, publicUrl: blobClient.url };
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    for (const path of paths) {
      const blobClient = containerClient.getBlobClient(path);
      await blobClient.deleteIfExists();
    }
  }

  async list(
    bucket: string,
    path: string,
    options?: { search?: string },
  ): Promise<
    { name: string; size?: number; metadata?: Record<string, unknown> }[]
  > {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const results: {
      name: string;
      size?: number;
      metadata?: Record<string, unknown>;
    }[] = [];

    for await (const blob of containerClient.listBlobsFlat({ prefix: path })) {
      const name = blob.name.startsWith(path + '/')
        ? blob.name.slice(path.length + 1)
        : blob.name;

      if (options?.search && !name.includes(options.search)) {
        continue;
      }

      results.push({
        name,
        size: blob.properties.contentLength,
        metadata: blob.metadata as Record<string, unknown> | undefined,
      });
    }

    return results;
  }

  getPublicUrl(bucket: string, path: string): string {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(path);
    return blobClient.url;
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blobClient = containerClient.getBlobClient(path);
    const downloadResponse = await blobClient.download();

    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Azure Blob download returned no stream for ${path}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk as unknown as ArrayBuffer));
      }
    }
    const data = Buffer.concat(chunks);

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
    const contentType =
      downloadResponse.contentType ||
      mimeMap[ext] ||
      'application/octet-stream';

    return { data, contentType };
  }

  async listBuckets(): Promise<string[]> {
    const results: string[] = [];
    for await (const container of this.blobServiceClient.listContainers()) {
      results.push(container.name);
    }
    return results;
  }

  async ensureBucketExists(
    bucket: string,
    _options?: {
      public?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    },
  ): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    await containerClient.createIfNotExists();
  }
}
