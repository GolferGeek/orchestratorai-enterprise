import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { GcsMediaStorageService } from '../gcs-media-storage.service';
import { DatabaseService } from '@/database';

// Mock GCP Storage SDK (mapped to __mocks__/@google-cloud/storage.js in jest.config.js)
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Storage } = require('@google-cloud/storage');

describe('GcsMediaStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GCS_PROJECT_ID: 'test-project',
      GCS_BUCKET_MEDIA: 'test-media-bucket',
      GCS_BUCKET_LEGAL: 'test-legal-bucket',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails fast when GCS_PROJECT_ID is missing', () => {
    delete process.env.GCS_PROJECT_ID;

    const mockDb = { from: jest.fn() } as unknown as DatabaseService;

    expect(() => new GcsMediaStorageService(mockDb)).toThrow(
      'Missing required environment variable: GCS_PROJECT_ID',
    );
  });

  it('fails fast when GCS_BUCKET_MEDIA is missing', () => {
    delete process.env.GCS_BUCKET_MEDIA;

    const mockDb = { from: jest.fn() } as unknown as DatabaseService;

    expect(() => new GcsMediaStorageService(mockDb)).toThrow(
      'Missing required environment variable: GCS_BUCKET_MEDIA',
    );
  });

  it('fails fast when GCS_BUCKET_LEGAL is missing', () => {
    delete process.env.GCS_BUCKET_LEGAL;

    const mockDb = { from: jest.fn() } as unknown as DatabaseService;

    expect(() => new GcsMediaStorageService(mockDb)).toThrow(
      'Missing required environment variable: GCS_BUCKET_LEGAL',
    );
  });

  it('stores media bytes to GCS and persists asset row', async () => {
    const mockSignedUrl =
      'https://storage.googleapis.com/test-media-bucket/path/file.png?X-Goog-Signature=abc';
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const getSignedUrlMock = jest.fn().mockResolvedValue([mockSignedUrl]);
    const deleteFileMock = jest.fn().mockResolvedValue(undefined);

    const mockFile = {
      save: saveMock,
      getSignedUrl: getSignedUrlMock,
      delete: deleteFileMock,
    };
    const mockBucket = {
      file: jest.fn().mockReturnValue(mockFile),
    };

    Storage.mockImplementation(
      () =>
        ({
          bucket: jest.fn().mockReturnValue(mockBucket),
        }) as unknown as Storage,
    );

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-gcs-1' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });

    const mockDb = { from } as unknown as DatabaseService;

    const service = new GcsMediaStorageService(mockDb);
    const context = createMockExecutionContext({
      orgSlug: 'orch',
      conversationId: 'conv-1',
      taskId: 'task-1',
      userId: 'user-1',
    });

    const result = await service.storeGeneratedMedia(
      Buffer.from('image-bytes'),
      context,
      {
        prompt: 'make an image',
        provider: 'openai',
        model: 'gpt-image-1',
        mime: 'image/png',
      },
    );

    expect(saveMock).toHaveBeenCalled();
    expect(from).toHaveBeenCalled();
    expect(result.assetId).toBe('asset-gcs-1');
    expect(result.url).toContain('storage.googleapis.com');
  });

  it('returns asset with signed URL on getAsset', async () => {
    const mockSignedUrl =
      'https://storage.googleapis.com/test-media-bucket/path/file.png?X-Goog-Signature=def';
    const getSignedUrlMock = jest.fn().mockResolvedValue([mockSignedUrl]);

    const mockFile = {
      getSignedUrl: getSignedUrlMock,
    };
    const mockBucket = {
      file: jest.fn().mockReturnValue(mockFile),
    };

    Storage.mockImplementation(
      () =>
        ({
          bucket: jest.fn().mockReturnValue(mockBucket),
        }) as unknown as Storage,
    );

    const single = jest.fn().mockResolvedValue({
      data: {
        id: 'asset-gcs-2',
        conversation_id: 'conv-1',
        bucket: 'test-media-bucket',
        object_key: 'orch/conv-1/task-1/asset-gcs-2.png',
        mime: 'image/png',
        width: 1024,
        height: 768,
        metadata: {},
      },
      error: null,
    });
    const eqFn = jest.fn().mockReturnValue({ single });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
    const from = jest.fn().mockReturnValue({ select: selectFn });

    const mockDb = { from } as unknown as DatabaseService;

    const service = new GcsMediaStorageService(mockDb);
    const context = createMockExecutionContext({
      orgSlug: 'orch',
      conversationId: 'conv-1',
      taskId: 'task-1',
      userId: 'user-1',
    });

    const result = await service.getAsset('asset-gcs-2', context);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('asset-gcs-2');
    expect(result!.url).toContain('storage.googleapis.com');
    expect(getSignedUrlMock).toHaveBeenCalled();
  });

  it('deletes asset from GCS and DB', async () => {
    const mockSignedUrl =
      'https://storage.googleapis.com/test-media-bucket/path/file.png?X-Goog-Signature=ghi';
    const getSignedUrlMock = jest.fn().mockResolvedValue([mockSignedUrl]);
    const deleteFileMock = jest.fn().mockResolvedValue(undefined);

    const mockFile = {
      getSignedUrl: getSignedUrlMock,
      delete: deleteFileMock,
    };
    const mockBucket = {
      file: jest.fn().mockReturnValue(mockFile),
    };

    Storage.mockImplementation(
      () =>
        ({
          bucket: jest.fn().mockReturnValue(mockBucket),
        }) as unknown as Storage,
    );

    const assetRecord = {
      id: 'asset-del-1',
      conversation_id: 'conv-del',
      bucket: 'test-media-bucket',
      object_key: 'orch/conv-del/task-1/asset-del-1.png',
      mime: 'image/png',
      metadata: {},
    };

    let callCount = 0;
    const from = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // getAsset select *
        const single = jest
          .fn()
          .mockResolvedValue({ data: assetRecord, error: null });
        const eq = jest.fn().mockReturnValue({ single });
        return { select: jest.fn().mockReturnValue({ eq }) };
      } else if (callCount === 2) {
        // deleteAsset select bucket, object_key
        const single = jest.fn().mockResolvedValue({
          data: {
            bucket: 'test-media-bucket',
            object_key: 'orch/conv-del/task-1/asset-del-1.png',
          },
          error: null,
        });
        const eq = jest.fn().mockReturnValue({ single });
        return { select: jest.fn().mockReturnValue({ eq }) };
      } else {
        // DB delete
        const eq = jest.fn().mockResolvedValue({ error: null });
        return { delete: jest.fn().mockReturnValue({ eq }) };
      }
    });

    const mockDb = { from } as unknown as DatabaseService;

    const service = new GcsMediaStorageService(mockDb);
    const context = createMockExecutionContext({
      orgSlug: 'orch',
      conversationId: 'conv-del',
      taskId: 'task-1',
      userId: 'user-1',
    });

    await service.deleteAsset('asset-del-1', context);

    expect(deleteFileMock).toHaveBeenCalled();
  });
});
