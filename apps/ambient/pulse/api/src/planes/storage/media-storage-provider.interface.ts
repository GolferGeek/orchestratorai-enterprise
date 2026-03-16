import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  MediaStorageMetadata,
  StoredMediaResult,
} from './media-storage.types';

export interface MediaStorageProvider {
  storeGeneratedMedia(
    data: Buffer,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult>;

  downloadAndStore(
    url: string,
    context: ExecutionContext,
    metadata: MediaStorageMetadata,
  ): Promise<StoredMediaResult>;

  getAsset(
    assetId: string,
    context: ExecutionContext,
  ): Promise<{
    id: string;
    url: string;
    mime: string;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
  } | null>;

  linkToDeliverableVersion(
    assetId: string,
    deliverableVersionId: string,
    context: ExecutionContext,
  ): Promise<void>;

  deleteAsset(assetId: string, context: ExecutionContext): Promise<void>;

  /**
   * Delete raw storage objects by bucket and object keys.
   * Use for bulk cleanup operations that don't have ExecutionContext.
   */
  deleteStorageObjects(
    bucket: string,
    objectKeys: string[],
  ): Promise<{ deleted: number; errors: string[] }>;

  // Generic file operations (used by LangGraph agent tools like CadStorageService)
  upload(
    bucket: string,
    path: string,
    data: Buffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ path: string; publicUrl: string }>;
  remove(bucket: string, paths: string[]): Promise<void>;
  list(
    bucket: string,
    path: string,
    options?: { search?: string },
  ): Promise<
    { name: string; size?: number; metadata?: Record<string, unknown> }[]
  >;
  getPublicUrl(bucket: string, path: string): string;
  download(
    bucket: string,
    path: string,
  ): Promise<{ data: Buffer; contentType: string }>;
  listBuckets(): Promise<string[]>;
  ensureBucketExists(
    bucket: string,
    options?: {
      public?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    },
  ): Promise<void>;
}

export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');

/** Alias for backward compatibility with agents/shared/storage/ consumers */
export const STORAGE_SERVICE = MEDIA_STORAGE_PROVIDER;
