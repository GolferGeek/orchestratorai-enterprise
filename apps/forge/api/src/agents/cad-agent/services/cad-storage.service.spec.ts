/**
 * Unit tests for CadStorageService
 *
 * Tests all storage operations for CAD output files:
 * - File storage/upload
 * - Multiple file storage
 * - File deletion
 * - Public URL generation
 * - File existence checking
 * - Storage statistics
 * - Bucket initialization
 *
 * StorageService is fully mocked via STORAGE_SERVICE injection.
 */

import { CadStorageService } from './cad-storage.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { MediaStorageProvider } from '@orchestratorai/planes/storage';

function createMockStorage(): jest.Mocked<MediaStorageProvider> {
  return {
    upload: jest.fn().mockResolvedValue({
      path: 'some/path',
      publicUrl:
        'https://supabase.co/storage/v1/object/public/engineering/path',
    }),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    getPublicUrl: jest
      .fn()
      .mockReturnValue(
        'https://supabase.co/storage/v1/object/public/engineering/path',
      ),
    listBuckets: jest.fn().mockResolvedValue([]),
    ensureBucketExists: jest.fn().mockResolvedValue(undefined),
    storeGeneratedMedia: jest.fn().mockResolvedValue({
      assetId: 'asset-123',
      url: 'https://example.com/asset',
      storagePath: 'some/path',
      mimeType: 'image/png',
      sizeBytes: 1000,
    }),
    downloadAndStore: jest.fn().mockResolvedValue({
      assetId: 'asset-123',
      url: 'https://example.com/asset',
      storagePath: 'some/path',
      mimeType: 'image/png',
      sizeBytes: 1000,
    }),
    getAsset: jest.fn().mockResolvedValue(null),
    linkToDeliverableVersion: jest.fn().mockResolvedValue(undefined),
    deleteAsset: jest.fn().mockResolvedValue(undefined),
    deleteStorageObjects: jest
      .fn()
      .mockResolvedValue({ deleted: 0, errors: [] }),
    download: jest.fn().mockResolvedValue({
      data: Buffer.from('file-content'),
      contentType: 'application/octet-stream',
    }),
  };
}

describe('CadStorageService', () => {
  let service: CadStorageService;
  let mockStorage: jest.Mocked<MediaStorageProvider>;

  const mockContext = createMockExecutionContext({
    conversationId: 'conv-123',
    userId: 'user-456',
    orgSlug: 'test-org',
    conversationId: 'conv-123',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = createMockStorage();
    service = new CadStorageService(mockStorage as any);
  });

  // ========================================
  // CONSTRUCTOR
  // ========================================

  describe('constructor', () => {
    it('should create service with injected storage', () => {
      expect(service).toBeDefined();
    });
  });

  // ========================================
  // onModuleInit / ensureBucketExists
  // ========================================

  describe('onModuleInit', () => {
    it('should call ensureBucketExists on module init', async () => {
      await service.onModuleInit();
      expect(mockStorage.ensureBucketExists).toHaveBeenCalledWith(
        'engineering',
        expect.objectContaining({ public: true }),
      );
    });

    it('should handle ensureBucketExists error gracefully', async () => {
      mockStorage.ensureBucketExists.mockRejectedValue(
        new Error('Permission denied'),
      );

      await service.onModuleInit();
      // Should not throw - just warns
    });
  });

  // ========================================
  // STORE FILE
  // ========================================

  describe('storeFile', () => {
    it('should store a STEP file successfully', async () => {
      const fileData = Buffer.from('STEP file content');
      mockStorage.upload.mockResolvedValue({
        path: 'test-org/project-123/drawing-123/model.step',
        publicUrl:
          'https://supabase.co/storage/v1/object/public/engineering/test-org/project-123/drawing-123/model.step',
      });

      const result = await service.storeFile(
        fileData,
        mockContext,
        'project-123',
        'drawing-123',
        'step',
      );

      expect(result.storagePath).toBe(
        'test-org/project-123/drawing-123/model.step',
      );
      expect(result.mimeType).toBe('application/step');
      expect(result.sizeBytes).toBe(fileData.length);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        'engineering',
        'test-org/project-123/drawing-123/model.step',
        fileData,
        expect.objectContaining({
          contentType: 'application/step',
          upsert: true,
        }),
      );
    });

    it('should store an STL file', async () => {
      const fileData = Buffer.from('STL file content');
      mockStorage.upload.mockResolvedValue({
        path: 'test-org/project-123/drawing-123/model.stl',
        publicUrl: 'https://example.com/model.stl',
      });

      const result = await service.storeFile(
        fileData,
        mockContext,
        'project-123',
        'drawing-123',
        'stl',
      );

      expect(result.storagePath).toBe(
        'test-org/project-123/drawing-123/model.stl',
      );
      expect(result.mimeType).toBe('model/stl');
    });

    it('should store a GLTF file', async () => {
      const fileData = Buffer.from('GLTF file content');
      mockStorage.upload.mockResolvedValue({
        path: 'test-org/project-123/drawing-123/model.gltf',
        publicUrl: 'https://example.com/model.gltf',
      });

      const result = await service.storeFile(
        fileData,
        mockContext,
        'project-123',
        'drawing-123',
        'gltf',
      );

      expect(result.storagePath).toBe(
        'test-org/project-123/drawing-123/model.gltf',
      );
      expect(result.mimeType).toBe('model/gltf+json');
    });

    it('should store a DXF file', async () => {
      const fileData = Buffer.from('DXF file content');
      mockStorage.upload.mockResolvedValue({
        path: 'test-org/project-123/drawing-123/model.dxf',
        publicUrl: 'https://example.com/model.dxf',
      });

      const result = await service.storeFile(
        fileData,
        mockContext,
        'project-123',
        'drawing-123',
        'dxf',
      );

      expect(result.storagePath).toBe(
        'test-org/project-123/drawing-123/model.dxf',
      );
      expect(result.mimeType).toBe('application/dxf');
    });

    it('should store a thumbnail file', async () => {
      const fileData = Buffer.from('PNG thumbnail content');
      mockStorage.upload.mockResolvedValue({
        path: 'test-org/project-123/drawing-123/thumbnail.png',
        publicUrl: 'https://example.com/thumbnail.png',
      });

      const result = await service.storeFile(
        fileData,
        mockContext,
        'project-123',
        'drawing-123',
        'thumbnail',
      );

      expect(result.storagePath).toBe(
        'test-org/project-123/drawing-123/thumbnail.png',
      );
      expect(result.mimeType).toBe('image/png');
    });

    it('should throw if orgSlug is missing from ExecutionContext', async () => {
      const contextWithoutOrg = createMockExecutionContext({ orgSlug: '' });

      await expect(
        service.storeFile(
          Buffer.from('content'),
          contextWithoutOrg,
          'project-123',
          'drawing-123',
          'step',
        ),
      ).rejects.toThrow('ExecutionContext.orgSlug is required for CAD storage');
    });

    it('should throw if upload fails', async () => {
      mockStorage.upload.mockRejectedValue(
        new Error('Storage upload failed: Storage quota exceeded'),
      );

      await expect(
        service.storeFile(
          Buffer.from('content'),
          mockContext,
          'project-123',
          'drawing-123',
          'step',
        ),
      ).rejects.toThrow('Storage upload failed: Storage quota exceeded');
    });
  });

  // ========================================
  // STORE MULTIPLE FILES
  // ========================================

  describe('storeFiles', () => {
    it('should store multiple files', async () => {
      mockStorage.upload.mockResolvedValue({
        path: 'some/path',
        publicUrl: 'https://example.com/file',
      });

      const files = new Map([
        ['step' as const, Buffer.from('STEP content')],
        ['stl' as const, Buffer.from('STL content')],
      ]);

      const results = await service.storeFiles(
        files,
        mockContext,
        'project-123',
        'drawing-123',
      );

      expect(results.size).toBe(2);
      expect(results.has('step')).toBe(true);
      expect(results.has('stl')).toBe(true);
    });

    it('should continue if one file fails', async () => {
      let callCount = 0;
      mockStorage.upload.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Upload failed'));
        }
        return Promise.resolve({
          path: 'some/path',
          publicUrl: 'https://example.com/file',
        });
      });

      const files = new Map([
        ['step' as const, Buffer.from('STEP content')],
        ['stl' as const, Buffer.from('STL content')],
      ]);

      const results = await service.storeFiles(
        files,
        mockContext,
        'project-123',
        'drawing-123',
      );

      expect(results.size).toBe(1);
    });

    it('should return empty map if context has no orgSlug', async () => {
      const contextWithoutOrg = createMockExecutionContext({ orgSlug: '' });

      const files = new Map([['step' as const, Buffer.from('STEP content')]]);

      const results = await service.storeFiles(
        files,
        contextWithoutOrg,
        'project-123',
        'drawing-123',
      );

      expect(results.size).toBe(0);
    });
  });

  // ========================================
  // DELETE FILES
  // ========================================

  describe('deleteDrawingFiles', () => {
    it('should delete all files for a drawing', async () => {
      mockStorage.list.mockResolvedValue([
        { name: 'model.step' },
        { name: 'model.stl' },
      ]);

      await service.deleteDrawingFiles(
        'test-org',
        'project-123',
        'drawing-123',
      );

      expect(mockStorage.list).toHaveBeenCalledWith(
        'engineering',
        'test-org/project-123/drawing-123',
      );
      expect(mockStorage.remove).toHaveBeenCalledWith('engineering', [
        'test-org/project-123/drawing-123/model.step',
        'test-org/project-123/drawing-123/model.stl',
      ]);
    });

    it('should handle list error gracefully', async () => {
      mockStorage.list.mockRejectedValue(new Error('List failed'));

      await expect(
        service.deleteDrawingFiles('test-org', 'project-123', 'drawing-123'),
      ).resolves.toBeUndefined();
    });

    it('should handle empty file list', async () => {
      mockStorage.list.mockResolvedValue([]);

      await service.deleteDrawingFiles(
        'test-org',
        'project-123',
        'drawing-123',
      );

      expect(mockStorage.remove).not.toHaveBeenCalled();
    });

    it('should handle remove error gracefully', async () => {
      mockStorage.list.mockResolvedValue([{ name: 'model.step' }]);
      mockStorage.remove.mockRejectedValue(new Error('Delete failed'));

      await expect(
        service.deleteDrawingFiles('test-org', 'project-123', 'drawing-123'),
      ).resolves.toBeUndefined();
    });
  });

  // ========================================
  // GET PUBLIC URL
  // ========================================

  describe('getPublicUrl', () => {
    it('should delegate to storage service', () => {
      mockStorage.getPublicUrl.mockReturnValue(
        'https://supabase.co/storage/v1/object/public/engineering/some/path',
      );

      const url = service.getPublicUrl('some/path');
      expect(url).toBe(
        'https://supabase.co/storage/v1/object/public/engineering/some/path',
      );
      expect(mockStorage.getPublicUrl).toHaveBeenCalledWith(
        'engineering',
        'some/path',
      );
    });
  });

  // ========================================
  // FILE EXISTS
  // ========================================

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      mockStorage.list.mockResolvedValue([{ name: 'model.step' }]);

      const exists = await service.fileExists(
        'test-org/project-123/drawing-123/model.step',
      );

      expect(exists).toBe(true);
      expect(mockStorage.list).toHaveBeenCalledWith(
        'engineering',
        'test-org/project-123/drawing-123',
        { search: 'model.step' },
      );
    });

    it('should return false if file does not exist', async () => {
      mockStorage.list.mockResolvedValue([]);

      const exists = await service.fileExists(
        'test-org/project-123/drawing-123/model.step',
      );

      expect(exists).toBe(false);
    });

    it('should return false on list error', async () => {
      mockStorage.list.mockRejectedValue(new Error('List failed'));

      const exists = await service.fileExists(
        'test-org/project-123/drawing-123/model.step',
      );

      expect(exists).toBe(false);
    });
  });

  // ========================================
  // STORAGE STATISTICS
  // ========================================

  describe('getDrawingStorageStats', () => {
    it('should return storage statistics for a drawing', async () => {
      mockStorage.list.mockResolvedValue([
        { name: 'model.step', size: 5000 },
        { name: 'model.stl', size: 3000 },
      ]);

      const stats = await service.getDrawingStorageStats(
        'test-org',
        'project-123',
        'drawing-123',
      );

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSizeBytes).toBe(8000);
    });

    it('should return zero stats on error', async () => {
      mockStorage.list.mockRejectedValue(new Error('List failed'));

      const stats = await service.getDrawingStorageStats(
        'test-org',
        'project-123',
        'drawing-123',
      );

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });

    it('should handle files without size', async () => {
      mockStorage.list.mockResolvedValue([{ name: 'model.step' }]);

      const stats = await service.getDrawingStorageStats(
        'test-org',
        'project-123',
        'drawing-123',
      );

      expect(stats.totalFiles).toBe(1);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });
});
