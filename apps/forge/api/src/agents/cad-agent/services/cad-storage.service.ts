import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';

/**
 * Result of storing a CAD file
 */
export interface StoredCadFileResult {
  /** Storage path within bucket */
  storagePath: string;
  /** Public URL to access the file */
  publicUrl: string;
  /** File size in bytes */
  sizeBytes: number;
  /** MIME type */
  mimeType: string;
}

/**
 * CAD file format types
 */
export type CadFileFormat = 'step' | 'stl' | 'gltf' | 'dxf' | 'thumbnail';

/**
 * CAD Storage Service
 *
 * Handles storage of CAD output files (STEP, STL, GLTF, DXF, thumbnails)
 * via the STORAGE_SERVICE provider abstraction.
 *
 * Storage Structure:
 * ```
 * engineering/
 *   {orgSlug}/
 *     {projectId}/
 *       {drawingId}/
 *         model.step
 *         model.stl
 *         model.gltf
 *         model.dxf
 *         thumbnail.png
 * ```
 *
 * ExecutionContext Flow:
 * - Uses context.orgSlug for organization path
 * - Uses projectId for project path
 * - Uses drawingId (which equals taskId) for drawing path
 */
@Injectable()
export class CadStorageService implements OnModuleInit {
  private readonly logger = new Logger(CadStorageService.name);
  private readonly bucketName: string;

  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>('CAD_STORAGE_BUCKET', 'engineering');
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  /**
   * Ensure the CAD outputs bucket exists
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.storage.ensureBucketExists(this.bucketName, {
        public: true,
        fileSizeLimit: 52428800, // 50MB limit for CAD files
        allowedMimeTypes: [
          'application/step',
          'application/sla',
          'model/stl',
          'model/gltf+json',
          'model/gltf-binary',
          'application/json',
          'application/octet-stream',
          'image/dxf',
          'application/dxf',
          'image/png',
          'image/jpeg',
        ],
      });
      this.logger.log(`Storage bucket ${this.bucketName} ready`);
    } catch (error) {
      this.logger.warn(
        `Error ensuring bucket exists: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.warn('CAD storage may not work correctly');
    }
  }

  /**
   * Get MIME type for CAD format
   */
  private getMimeType(format: CadFileFormat): string {
    const mimeTypes: Record<CadFileFormat, string> = {
      step: 'application/step',
      stl: 'model/stl',
      gltf: 'model/gltf+json',
      dxf: 'application/dxf',
      thumbnail: 'image/png',
    };
    return mimeTypes[format];
  }

  /**
   * Get file extension for CAD format
   */
  private getExtension(format: CadFileFormat): string {
    const extensions: Record<CadFileFormat, string> = {
      step: 'step',
      stl: 'stl',
      gltf: 'gltf',
      dxf: 'dxf',
      thumbnail: 'png',
    };
    return extensions[format];
  }

  /**
   * Build storage path from context and format
   */
  private buildStoragePath(
    orgSlug: string,
    projectId: string,
    drawingId: string,
    format: CadFileFormat,
  ): string {
    const extension = this.getExtension(format);
    const filename = format === 'thumbnail' ? 'thumbnail' : 'model';
    return `${orgSlug}/${projectId}/${drawingId}/${filename}.${extension}`;
  }

  /**
   * Store a CAD output file
   */
  async storeFile(
    data: Buffer,
    context: ExecutionContext,
    projectId: string,
    drawingId: string,
    format: CadFileFormat,
  ): Promise<StoredCadFileResult> {
    if (!context.orgSlug) {
      throw new Error('ExecutionContext.orgSlug is required for CAD storage');
    }
    // Replace wildcard '*' (super-admin) with 'global' for valid storage paths
    const orgSlug = context.orgSlug === '*' ? 'global' : context.orgSlug;
    const storagePath = this.buildStoragePath(
      orgSlug,
      projectId,
      drawingId,
      format,
    );
    const mimeType = this.getMimeType(format);

    this.logger.log(
      `📦 [CAD-STORAGE] Storing ${format} file: ${storagePath} (${data.length} bytes)`,
    );

    const result = await this.storage.upload(
      this.bucketName,
      storagePath,
      data,
      { contentType: mimeType, upsert: true },
    );

    this.logger.log(
      `📦 [CAD-STORAGE] Uploaded successfully: ${result.publicUrl}`,
    );

    return {
      storagePath,
      publicUrl: result.publicUrl,
      sizeBytes: data.length,
      mimeType,
    };
  }

  /**
   * Store multiple CAD output files
   */
  async storeFiles(
    files: Map<CadFileFormat, Buffer>,
    context: ExecutionContext,
    projectId: string,
    drawingId: string,
  ): Promise<Map<CadFileFormat, StoredCadFileResult>> {
    const results = new Map<CadFileFormat, StoredCadFileResult>();

    for (const [format, data] of files) {
      try {
        const result = await this.storeFile(
          data,
          context,
          projectId,
          drawingId,
          format,
        );
        results.set(format, result);
      } catch (error) {
        this.logger.error(
          `Failed to store ${format} file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  }

  /**
   * Delete CAD output files for a drawing
   */
  async deleteDrawingFiles(
    orgSlug: string,
    projectId: string,
    drawingId: string,
  ): Promise<void> {
    const basePath = `${orgSlug}/${projectId}/${drawingId}`;

    try {
      const files = await this.storage.list(this.bucketName, basePath);

      if (files.length > 0) {
        const filePaths = files.map((f) => `${basePath}/${f.name}`);
        await this.storage.remove(this.bucketName, filePaths);
        this.logger.log(
          `Deleted ${filePaths.length} files for drawing ${drawingId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete drawing files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get public URL for a stored file.
   */
  getPublicUrl(storagePath: string): string {
    return this.storage.getPublicUrl(this.bucketName, storagePath);
  }

  /**
   * Check if a file exists
   */
  async fileExists(storagePath: string): Promise<boolean> {
    const parts = storagePath.split('/');
    const filename = parts.pop();
    const folderPath = parts.join('/');

    try {
      const files = await this.storage.list(this.bucketName, folderPath, {
        search: filename,
      });
      return files.some((f) => f.name === filename);
    } catch {
      return false;
    }
  }

  /**
   * Get storage statistics for a drawing
   */
  async getDrawingStorageStats(
    orgSlug: string,
    projectId: string,
    drawingId: string,
  ): Promise<{ totalFiles: number; totalSizeBytes: number }> {
    const basePath = `${orgSlug}/${projectId}/${drawingId}`;

    try {
      const files = await this.storage.list(this.bucketName, basePath);

      const totalSizeBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

      return {
        totalFiles: files.length,
        totalSizeBytes,
      };
    } catch {
      return { totalFiles: 0, totalSizeBytes: 0 };
    }
  }
}
