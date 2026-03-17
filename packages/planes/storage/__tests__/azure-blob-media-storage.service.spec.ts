import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { BlobServiceClient } from '@azure/storage-blob';
import { AzureBlobMediaStorageService } from '../azure-blob-media-storage.service';
import { DatabaseService } from '@/database';

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
  BlobSASPermissions: {
    parse: jest.fn().mockReturnValue('r'),
  },
}));

describe('AzureBlobMediaStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      AZURE_STORAGE_CONTAINER_MEDIA: 'media',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails fast when required env keys are missing', () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    const mockDb = {
      from: jest.fn(),
    } as unknown as DatabaseService;

    expect(() => new AzureBlobMediaStorageService(mockDb)).toThrow(
      'Missing required environment variable: AZURE_STORAGE_CONNECTION_STRING',
    );
  });

  it('stores media bytes to azure blob and persists asset row', async () => {
    const uploadData = jest.fn().mockResolvedValue(undefined);
    const deleteIfExists = jest.fn().mockResolvedValue(undefined);
    const generateSasUrl = jest
      .fn()
      .mockResolvedValue(
        'https://example.blob.core.windows.net/media/path/file.png?sas=123',
      );
    const blobClient = {
      url: 'https://example.blob.core.windows.net/media/path/file.png',
      uploadData,
      deleteIfExists,
      generateSasUrl,
    };
    const containerClient = {
      getBlockBlobClient: jest.fn().mockReturnValue(blobClient),
    };
    const blobService = {
      getContainerClient: jest.fn().mockReturnValue(containerClient),
    };

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue(
      blobService,
    );

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-1' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });

    const mockDb = {
      from,
    } as unknown as DatabaseService;

    const service = new AzureBlobMediaStorageService(mockDb);
    const context = createMockExecutionContext({
      orgSlug: 'orch',
      conversationId: 'conv-1',
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

    expect(uploadData).toHaveBeenCalled();
    expect(from).toHaveBeenCalled();
    expect(result.assetId).toBe('asset-1');
    expect(result.url).toContain('https://example.blob.core.windows.net');
  });

  it('uses SAS URL when AZURE_STORAGE_USE_SAS_URLS is enabled', async () => {
    process.env.AZURE_STORAGE_USE_SAS_URLS = 'true';
    process.env.AZURE_STORAGE_SAS_TTL_SECONDS = '900';

    const uploadData = jest.fn().mockResolvedValue(undefined);
    const deleteIfExists = jest.fn().mockResolvedValue(undefined);
    const generateSasUrl = jest
      .fn()
      .mockResolvedValue(
        'https://example.blob.core.windows.net/media/path/file.png?sas=123',
      );
    const blobClient = {
      url: 'https://example.blob.core.windows.net/media/path/file.png',
      uploadData,
      deleteIfExists,
      generateSasUrl,
    };
    const containerClient = {
      getBlockBlobClient: jest.fn().mockReturnValue(blobClient),
    };
    const blobService = {
      getContainerClient: jest.fn().mockReturnValue(containerClient),
    };

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue(
      blobService,
    );

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-sas' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });

    const mockDb = {
      from,
    } as unknown as DatabaseService;

    const service = new AzureBlobMediaStorageService(mockDb);
    const context = createMockExecutionContext({
      orgSlug: 'orch',
      conversationId: 'conv-1',
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

    expect(generateSasUrl).toHaveBeenCalled();
    expect(result.url).toContain('?sas=');
  });
});
