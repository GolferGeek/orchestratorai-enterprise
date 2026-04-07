/**
 * LegalDocumentsStorageService — thin wrapper around the storage plane's
 * generic file API for the `legal-documents` bucket.
 *
 * The async upload endpoint calls `storeOriginal()` BEFORE running the
 * extractor, so the original bytes survive even if the user later deletes
 * the file from their machine. The job row's `original_file_path` field
 * holds the bucket-relative path; `getSignedUrl()` mints a short-lived
 * URL the modal's Source section uses to render the file inline.
 *
 * This service uses MEDIA_STORAGE_PROVIDER from the storage plane only —
 * no direct Supabase imports — so the same code works against the
 * Supabase, Azure Blob, and GCS implementations.
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';

const BUCKET = 'legal-documents';

@Injectable()
export class LegalDocumentsStorageService implements OnModuleInit {
  private readonly logger = new Logger(LegalDocumentsStorageService.name);

  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.storage.ensureBucketExists(BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024, // 50 MB matches the upload endpoint's multer limit
        allowedMimeTypes: undefined, // accept everything; the extractor router validates
      });
      this.logger.log(`Bucket '${BUCKET}' ready`);
    } catch (error) {
      this.logger.warn(
        `Failed to ensure bucket '${BUCKET}' exists: ${error instanceof Error ? error.message : String(error)}. Uploads will still attempt to write but may fail.`,
      );
    }
  }

  /**
   * Store an uploaded file under a deterministic path keyed by jobId.
   * Returns the bucket-relative path that should be written to the row's
   * `original_file_path` column.
   */
  async storeOriginal(
    jobId: string,
    originalFilename: string,
    data: Buffer,
    contentType: string,
  ): Promise<string> {
    const safeName = sanitizeFilename(originalFilename);
    const path = `${jobId}/${safeName}`;
    await this.storage.upload(BUCKET, path, data, {
      contentType,
      upsert: false,
    });
    this.logger.log(
      `Stored original ${path} (${data.length} bytes, ${contentType})`,
    );
    return path;
  }

  /**
   * Mint a URL the browser can fetch the original file from. For private
   * Supabase buckets, this is a signed URL via the storage plane's
   * `getPublicUrl` (which transparently signs when the bucket is private).
   * For public buckets, it's a direct URL.
   */
  getSignedUrl(storagePath: string): string {
    return this.storage.getPublicUrl(BUCKET, storagePath);
  }
}

/**
 * Strip directory traversal and any unsafe characters from a user-provided
 * filename. Storage backends generally accept any string but a clean
 * filename keeps the storage path human-readable in the UI and prevents
 * accidental key collisions.
 */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/\\]/g, '_')
      .replace(/\s+/g, '-')
      .replace(/[^\w.\-]/g, '')
      .slice(0, 200) || 'file'
  );
}
