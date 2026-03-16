import { Injectable, Logger, Inject } from '@nestjs/common';
import { SupabaseService } from '../database/supabase-client.service';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '../database';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { randomUUID } from 'crypto';
import type { MediaStorageProvider } from './media-storage-provider.interface';
import type {
  MediaStorageMetadata,
  StoredMediaResult,
} from './media-storage.types';

// Re-export types for backward compatibility
export type {
  StoredMediaResult,
  MediaStorageMetadata,
} from './media-storage.types';

/**
 * Media Storage Helper
 *
 * Handles storage of generated media (images, videos) to Supabase Storage
 * and creates corresponding asset records in the assets table.
 *
 * Storage Structure:
 * ```
 * media/
 *   {orgSlug}/
 *     {conversationId}/
 *       {taskId}/
 *         {uuid}.{ext}
 * ```
 *
 * ExecutionContext Flow:
 * - Uses context.orgSlug for organization path
 * - Uses context.conversationId for conversation path
 * - Uses context.taskId for task path and request correlation
 * - Uses context.userId for asset ownership
 *
 * @example
 * ```typescript
 * const result = await mediaStorage.storeGeneratedMedia(
 *   imageBuffer,
 *   executionContext,
 *   {
 *     prompt: 'A sunset over mountains',
 *     provider: 'openai',
 *     model: 'gpt-image-1.5',
 *     mime: 'image/png',
 *   }
 * );
 * // result: { assetId: '...', url: 'https://...', storagePath: '...', mimeType: '...', sizeBytes: 12345 }
 * ```
 */
@Injectable()
export class MediaStorageHelper implements MediaStorageProvider {
  private readonly logger = new Logger(MediaStorageHelper.name);
  private readonly bucketName = process.env.MEDIA_STORAGE_BUCKET || 'media';
  private readonly useSignedUrls =
    process.env.SUPABASE_STORAGE_USE_SIGNED_URLS === 'true';
  private readonly signedUrlTtlSeconds = this.useSignedUrls
    ? this.requirePositiveInteger(
        'SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS',
        process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS,
      )
    : null;
  /**
   * When PUBLIC_API_URL is set, generates API-proxied storage URLs
   * instead of direct Supabase URLs (which may not be browser-reachable).
   */
  private readonly publicApiUrl = process.env.PUBLIC_API_URL;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Store generated media bytes to Supabase storage and create asset record
   *
   * @param data - Raw media bytes (Buffer)
   * @param context - ExecutionContext for ownership and path construction
   * @param metadata - Media metadata (prompt, provider, model, etc.)
   * @returns StoredMediaResult with assetId, url, storagePath
   */
  async storeGeneratedMedia(
    data: Buffer,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult> {
    // Generate unique filename
    const assetId = randomUUID();
    const extension = this.getExtensionFromMime(metadata.mime);
    const filename = `${assetId}.${extension}`;

    // Build storage path using ExecutionContext
    // Structure: {orgSlug}/{conversationId}/{taskId}/{filename}
    const storagePath = this.buildStoragePath(context, filename);

    this.logger.log(
      `📦 [MEDIA-STORAGE] Storing media: ${storagePath} (${data.length} bytes)`,
    );

    // Upload to Supabase storage
    const { error: uploadError } = await this.supabaseService
      .getServiceClient()
      .storage.from(this.bucketName)
      .upload(storagePath, data, {
        contentType: metadata.mime,
        upsert: false,
      });

    if (uploadError) {
      this.logger.error(
        `📦 [MEDIA-STORAGE] Upload failed: ${uploadError.message}`,
      );
      throw new Error(`Failed to upload media: ${uploadError.message}`);
    }

    // Get public URL (API-proxied if PUBLIC_API_URL is set)
    const publicUrl = await this.buildPublicUrl(storagePath, this.bucketName);

    this.logger.log(`📦 [MEDIA-STORAGE] Uploaded successfully: ${publicUrl}`);

    // Create asset record in database
    const insertResult = await this.db
      .from(null, 'assets')
      .insert({
        id: assetId,
        storage: 'supabase',
        bucket: this.bucketName,
        object_key: storagePath,
        mime: metadata.mime,
        size: data.length,
        width: metadata.width || null,
        height: metadata.height || null,
        // Link to ExecutionContext
        user_id: context.userId,
        conversation_id: context.conversationId,
        // Metadata
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
      this.logger.error(
        `📦 [MEDIA-STORAGE] Asset record creation failed: ${assetError.message}`,
      );
      // Try to clean up uploaded file
      await this.supabaseService
        .getServiceClient()
        .storage.from(this.bucketName)
        .remove([storagePath]);
      throw new Error(`Failed to create asset record: ${assetError.message}`);
    }

    const assetRecord = insertResult.data as { id: string } | null;
    if (!assetRecord) {
      throw new Error('Failed to create asset record: no data returned');
    }

    this.logger.log(
      `📦 [MEDIA-STORAGE] Asset record created: ${assetRecord.id}`,
    );

    return {
      assetId: assetRecord.id,
      url: publicUrl,
      storagePath,
      mimeType: metadata.mime,
      sizeBytes: data.length,
    };
  }

  /**
   * Download media from a provider URL and store in Supabase
   *
   * @param url - Source URL to download from
   * @param context - ExecutionContext for ownership
   * @param metadata - Media metadata
   * @returns StoredMediaResult
   */
  async downloadAndStore(
    url: string,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult> {
    this.logger.log(`📦 [MEDIA-STORAGE] Downloading from: ${url}`);

    // Download the media
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    // Store using the normal method
    return this.storeGeneratedMedia(data, context, metadata);
  }

  /**
   * Get an existing asset by ID
   *
   * @param assetId - Asset UUID
   * @param context - ExecutionContext for authorization
   * @returns Asset record or null
   */
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

    // Verify ownership - asset should belong to same conversation or user
    const record = queryResult.data as {
      id: string;
      conversation_id: string | null;
      user_id: string | null;
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
      this.logger.warn(
        `📦 [MEDIA-STORAGE] Asset ${assetId} not in conversation ${context.conversationId}`,
      );
      return null;
    }

    // Build URL (API-proxied if PUBLIC_API_URL is set)
    const assetUrl = await this.buildPublicUrl(
      record.object_key,
      record.bucket || this.bucketName,
    );

    return {
      id: record.id,
      url: assetUrl,
      mime: record.mime,
      width: record.width,
      height: record.height,
      metadata: record.metadata,
    };
  }

  /**
   * Link an asset to a deliverable version
   *
   * @param assetId - Asset UUID
   * @param deliverableVersionId - Deliverable version UUID
   * @param context - ExecutionContext
   */
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
      this.logger.error(
        `📦 [MEDIA-STORAGE] Failed to link asset ${assetId} to version ${deliverableVersionId}: ${error.message}`,
      );
      throw new Error(`Failed to link asset to deliverable: ${error.message}`);
    }

    this.logger.log(
      `📦 [MEDIA-STORAGE] Linked asset ${assetId} to version ${deliverableVersionId}`,
    );
  }

  /**
   * Delete an asset (soft delete or hard delete based on config)
   *
   * @param assetId - Asset UUID
   * @param context - ExecutionContext for authorization
   */
  async deleteAsset(assetId: string, context: ExecutionContext): Promise<void> {
    // Get asset to verify ownership and get storage path
    const asset = await this.getAsset(assetId, context);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found or not accessible`);
    }

    // Get full asset record for storage path
    const { data: record } = (await this.db
      .from(null, 'assets')
      .select('bucket, object_key')
      .eq('id', assetId)
      .single()) as QueryResult<unknown>;

    if (record) {
      const typedRecord = record as { bucket: string; object_key: string };

      // Delete from storage
      const { error: storageError } = await this.supabaseService
        .getServiceClient()
        .storage.from(typedRecord.bucket || this.bucketName)
        .remove([typedRecord.object_key]);

      if (storageError) {
        this.logger.warn(
          `📦 [MEDIA-STORAGE] Storage deletion warning: ${storageError.message}`,
        );
      }
    }

    // Delete record
    const { error: dbError } = await this.db
      .from(null, 'assets')
      .delete()
      .eq('id', assetId);

    if (dbError) {
      throw new Error(`Failed to delete asset record: ${dbError.message}`);
    }

    this.logger.log(`📦 [MEDIA-STORAGE] Deleted asset ${assetId}`);
  }

  /**
   * Build storage path from ExecutionContext
   */
  private buildStoragePath(
    context: ExecutionContext,
    filename: string,
  ): string {
    const orgSlug = context.orgSlug || 'global';
    const conversationId = context.conversationId || 'unknown';
    const taskId = context.taskId || 'unknown';

    return `${orgSlug}/${conversationId}/${taskId}/${filename}`;
  }

  /**
   * Build a browser-reachable URL for a storage path.
   * If PUBLIC_API_URL is set, generates: {PUBLIC_API_URL}/assets/storage/{bucket}/{path}
   * Otherwise falls back to Supabase's getPublicUrl.
   */
  private async buildPublicUrl(
    storagePath: string,
    bucket: string,
  ): Promise<string> {
    if (this.publicApiUrl) {
      const base = this.publicApiUrl.replace(/\/$/, '');
      return `${base}/assets/storage/${bucket}/${storagePath}`;
    }
    const storageClient = this.supabaseService.getServiceClient();
    if (this.useSignedUrls) {
      const signedUrlResult = await storageClient.storage
        .from(bucket)
        .createSignedUrl(storagePath, this.signedUrlTtlSeconds as number);
      if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
        const message =
          signedUrlResult.error?.message || 'No signed URL returned';
        throw new Error(`Failed to create signed URL: ${message}`);
      }
      return signedUrlResult.data.signedUrl;
    }
    const { data } = storageClient.storage
      .from(bucket)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }

  /**
   * Get file extension from MIME type
   */
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

  async deleteStorageObjects(
    bucket: string,
    objectKeys: string[],
  ): Promise<{ deleted: number; errors: string[] }> {
    if (objectKeys.length === 0) {
      return { deleted: 0, errors: [] };
    }

    const { error } = await this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .remove(objectKeys);

    if (error) {
      return { deleted: 0, errors: [error.message] };
    }

    return { deleted: objectKeys.length, errors: [] };
  }

  async upload(
    bucket: string,
    path: string,
    data: Buffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string; publicUrl: string }> {
    const { error } = await this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .upload(path, data, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return {
      path,
      publicUrl: this.getPublicUrl(bucket, path),
    };
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    const { error } = await this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .remove(paths);

    if (error) {
      throw new Error(`Storage remove failed: ${error.message}`);
    }
  }

  async list(
    bucket: string,
    path: string,
    options?: { search?: string },
  ): Promise<
    { name: string; size?: number; metadata?: Record<string, unknown> }[]
  > {
    const { data, error } = await this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .list(path, { search: options?.search });

    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }

    return (data || []).map((f) => ({
      name: f.name,
      size: f.metadata?.size as number | undefined,
      metadata: f.metadata as Record<string, unknown> | undefined,
    }));
  }

  getPublicUrl(bucket: string, path: string): string {
    if (this.publicApiUrl) {
      const base = this.publicApiUrl.replace(/\/$/, '');
      return `${base}/assets/storage/${bucket}/${path}`;
    }
    const { data } = this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<{ data: Buffer; contentType: string }> {
    const { data, error } = await this.supabaseService
      .getServiceClient()
      .storage.from(bucket)
      .download(path);

    if (error || !data) {
      throw new Error(
        `Storage download failed: ${error?.message || 'no data returned'}`,
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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

    return { data: buffer, contentType };
  }

  async listBuckets(): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .getServiceClient()
      .storage.listBuckets();

    if (error) {
      throw new Error(`Failed to list buckets: ${error.message}`);
    }

    return (data || []).map((b) => b.name);
  }

  async ensureBucketExists(
    bucket: string,
    options?: {
      public?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    },
  ): Promise<void> {
    const buckets = await this.listBuckets();
    const exists = buckets.includes(bucket);

    if (!exists) {
      const { error } = await this.supabaseService
        .getServiceClient()
        .storage.createBucket(bucket, {
          public: options?.public ?? false,
          fileSizeLimit: options?.fileSizeLimit,
          allowedMimeTypes: options?.allowedMimeTypes,
        });

      if (error) {
        if (
          !error.message.toLowerCase().includes('already exists') &&
          !error.message.toLowerCase().includes('duplicate')
        ) {
          throw new Error(
            `Failed to create bucket ${bucket}: ${error.message}`,
          );
        }
      } else {
        this.logger.log(`Created storage bucket: ${bucket}`);
      }
    }
  }
}
