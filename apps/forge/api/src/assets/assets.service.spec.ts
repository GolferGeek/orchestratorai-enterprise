/**
 * AssetsService unit tests
 *
 * Tests plane-based storage path, URL download path, external registration,
 * streaming/redirect dispatch, and metadata retrieval — including all error branches.
 *
 * All external I/O is mocked: MEDIA_STORAGE_PROVIDER plane and axios.
 */

import { NotFoundException } from '@nestjs/common';
import type { AssetRecord } from './assets.repository';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

jest.mock('axios');

import { AssetsService } from './assets.service';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const assetFixture: AssetRecord = {
  id: 'asset-uuid-1',
  storage: 'supabase',
  bucket: 'media',
  object_key: 'test-org/conv-1/images/file.png',
  mime: 'image/png',
  size: 1024,
};

function buildMockRepo(
  overrides: Partial<{
    get: jest.Mock;
    create: jest.Mock;
  }> = {},
) {
  return {
    get: jest.fn().mockResolvedValue(assetFixture),
    create: jest.fn().mockResolvedValue(assetFixture),
    ...overrides,
  };
}

function buildMockMediaStorage(
  overrides: Partial<{
    upload: jest.Mock;
    download: jest.Mock;
  }> = {},
) {
  return {
    upload: jest.fn().mockResolvedValue({ path: 'some/path', publicUrl: 'https://cdn.example.com/path' }),
    download: jest.fn().mockResolvedValue({ data: Buffer.from('file-bytes'), contentType: 'image/png' }),
    storeGeneratedMedia: jest.fn(),
    downloadAndStore: jest.fn(),
    getAsset: jest.fn(),
    linkToDeliverableVersion: jest.fn(),
    deleteAsset: jest.fn(),
    deleteStorageObjects: jest.fn(),
    remove: jest.fn(),
    list: jest.fn(),
    getPublicUrl: jest.fn(),
    listBuckets: jest.fn(),
    ensureBucketExists: jest.fn(),
    ...overrides,
  };
}

function buildMockConfig(values: Record<string, string | number>) {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key in values) return values[key];
      throw new Error(`Config key not found: ${key}`);
    }),
    get: jest.fn((key: string) => values[key]),
  };
}

function buildMockResponse() {
  return {
    redirect: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
    pipe: jest.fn(),
  } as unknown as import('express').Response;
}

const defaultConfig = {
  ASSET_FETCH_EXTERNAL: 'false',
  ASSET_FETCH_MAX_BYTES: 10 * 1024 * 1024,
  ASSET_EXTERNAL_STRATEGY: 'redirect',
  MEDIA_STORAGE_BUCKET: 'media',
};

// ---------------------------------------------------------------------------
// getMetadata
// ---------------------------------------------------------------------------

describe('AssetsService.getMetadata', () => {
  it('returns the asset record when the repository finds it', async () => {
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );

    const result = await service.getMetadata('asset-uuid-1');

    expect(repo.get).toHaveBeenCalledWith('asset-uuid-1');
    expect(result).toEqual(assetFixture);
  });

  it('throws NotFoundException when the repository returns null', async () => {
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(null) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );

    await expect(service.getMetadata('missing-id')).rejects.toThrow(NotFoundException);
    await expect(service.getMetadata('missing-id')).rejects.toThrow('Asset not found');
  });
});

// ---------------------------------------------------------------------------
// saveBuffer
// ---------------------------------------------------------------------------

describe('AssetsService.saveBuffer', () => {
  it('uploads the buffer via MEDIA_STORAGE_PROVIDER with correct bucket and path', async () => {
    const mediaStorage = buildMockMediaStorage();
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      mediaStorage as never,
    );
    const buffer = Buffer.from('fake-image-data');

    await service.saveBuffer({
      organizationSlug: 'acme',
      conversationId: 'conv-42',
      userId: 'user-1',
      mime: 'image/png',
      buffer,
      filename: 'photo.png',
    });

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('acme'),
      buffer,
      { contentType: 'image/png' },
    );
    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('photo.png'),
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('calls repo.create with storage: supabase, bucket, object_key', async () => {
    const mediaStorage = buildMockMediaStorage();
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      mediaStorage as never,
    );
    const buffer = Buffer.from('content');

    await service.saveBuffer({
      organizationSlug: 'org1',
      conversationId: 'conv-1',
      userId: 'uid-1',
      mime: 'image/jpeg',
      buffer,
      filename: 'test.jpg',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: 'supabase',
        bucket: 'media',
        mime: 'image/jpeg',
        size: buffer.length,
        user_id: 'uid-1',
        conversation_id: 'conv-1',
      }),
    );
  });

  it('returns the AssetRecord returned by repo.create', async () => {
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );

    const result = await service.saveBuffer({
      mime: 'image/png',
      buffer: Buffer.from('x'),
    });

    expect(result).toEqual(assetFixture);
  });

  it('uses "global" as org and "unknown" as conversationId when not provided', async () => {
    const mediaStorage = buildMockMediaStorage();
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      mediaStorage as never,
    );

    await service.saveBuffer({ mime: 'image/png', buffer: Buffer.from('x') });

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('global'),
      expect.anything(),
      expect.anything(),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'unknown' }),
    );
  });
});

// ---------------------------------------------------------------------------
// saveFromUrl
// ---------------------------------------------------------------------------

describe('AssetsService.saveFromUrl', () => {
  it('throws when ASSET_FETCH_EXTERNAL is false', async () => {
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'false' }) as never,
      buildMockMediaStorage() as never,
    );

    await expect(
      service.saveFromUrl({ url: 'https://example.com/img.png' }),
    ).rejects.toThrow('External fetching disabled');
  });

  it('downloads the URL and saves via plane when fetching is enabled', async () => {
    const fakeBuffer = Buffer.from('image-bytes');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      headers: { 'content-type': 'image/png' },
      data: fakeBuffer,
    });
    const mediaStorage = buildMockMediaStorage();
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'true' }) as never,
      mediaStorage as never,
    );

    const result = await service.saveFromUrl({
      url: 'https://example.com/photo.png',
      organizationSlug: 'org1',
      conversationId: 'conv-1',
      userId: 'user-1',
      filename: 'photo.png',
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://example.com/photo.png',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );
    expect(mediaStorage.upload).toHaveBeenCalled();
    expect(result).toEqual(assetFixture);
  });

  it('propagates axios errors as thrown exceptions', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'true' }) as never,
      buildMockMediaStorage() as never,
    );

    await expect(
      service.saveFromUrl({ url: 'https://example.com/broken.png' }),
    ).rejects.toThrow('Network request failed');
  });

  it('derives the filename from the URL when no filename is provided', async () => {
    const fakeBuffer = Buffer.from('data');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      headers: { 'content-type': 'image/jpeg' },
      data: fakeBuffer,
    });
    const mediaStorage = buildMockMediaStorage();
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'true' }) as never,
      mediaStorage as never,
    );

    await service.saveFromUrl({ url: 'https://cdn.example.com/assets/banner.jpg' });

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('banner.jpg'),
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('generates a filename from mime type when URL has no extension', async () => {
    const fakeBuffer = Buffer.from('data');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      headers: { 'content-type': 'image/png' },
      data: fakeBuffer,
    });
    const mediaStorage = buildMockMediaStorage();
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'true' }) as never,
      mediaStorage as never,
    );

    await service.saveFromUrl({ url: 'https://api.example.com/generate' });

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.png$/),
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('falls back to .bin extension for unknown mime types', async () => {
    const fakeBuffer = Buffer.from('data');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      headers: { 'content-type': 'application/octet-stream' },
      data: fakeBuffer,
    });
    const mediaStorage = buildMockMediaStorage();
    const service = new AssetsService(
      buildMockRepo() as never,
      buildMockConfig({ ...defaultConfig, ASSET_FETCH_EXTERNAL: 'true' }) as never,
      mediaStorage as never,
    );

    await service.saveFromUrl({ url: 'https://api.example.com/download' });

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.bin$/),
      expect.any(Buffer),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// registerExternal
// ---------------------------------------------------------------------------

describe('AssetsService.registerExternal', () => {
  it('creates a metadata-only record without uploading anything', async () => {
    const repo = buildMockRepo();
    const mediaStorage = buildMockMediaStorage();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      mediaStorage as never,
    );

    const result = await service.registerExternal({
      url: 'https://external.cdn.com/image.png',
      mime: 'image/png',
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    expect(mediaStorage.upload).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: 'supabase',
        source_url: 'https://external.cdn.com/image.png',
        mime: 'image/png',
        user_id: 'user-1',
        conversation_id: 'conv-1',
      }),
    );
    expect(result).toEqual(assetFixture);
  });

  it('defaults mime to application/octet-stream when not provided', async () => {
    const repo = buildMockRepo();
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );

    await service.registerExternal({ url: 'https://example.com/file' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ mime: 'application/octet-stream' }),
    );
  });
});

// ---------------------------------------------------------------------------
// streamByIdOrRedirect
// ---------------------------------------------------------------------------

describe('AssetsService.streamByIdOrRedirect', () => {
  it('calls res.redirect(302, url) for external storage assets', async () => {
    const externalRecord: AssetRecord = {
      id: 'ext-asset-1',
      storage: 'external' as AssetRecord['storage'],
      source_url: 'https://external.cdn.com/image.png',
      mime: 'image/png',
    };
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(externalRecord) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );
    const res = buildMockResponse();

    await service.streamByIdOrRedirect('ext-asset-1', res);

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://external.cdn.com/image.png');
  });

  it('throws NotFoundException when external asset has no source_url', async () => {
    const externalRecord: AssetRecord = {
      id: 'ext-no-url',
      storage: 'external' as AssetRecord['storage'],
      source_url: null,
      mime: 'image/png',
    };
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(externalRecord) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );
    const res = buildMockResponse();

    await expect(service.streamByIdOrRedirect('ext-no-url', res)).rejects.toThrow(NotFoundException);
  });

  it('downloads via plane and sends buffer for stored assets', async () => {
    const storedRecord: AssetRecord = {
      id: 'stored-asset-1',
      storage: 'supabase',
      bucket: 'media',
      object_key: 'org1/conv-1/photo.png',
      mime: 'image/png',
    };
    const fakeBuffer = Buffer.from('image-data');
    const mediaStorage = buildMockMediaStorage({
      download: jest.fn().mockResolvedValue({ data: fakeBuffer, contentType: 'image/png' }),
    });
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(storedRecord) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      mediaStorage as never,
    );
    const res = buildMockResponse();

    await service.streamByIdOrRedirect('stored-asset-1', res);

    expect(mediaStorage.download).toHaveBeenCalledWith('media', 'org1/conv-1/photo.png');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });

  it('throws NotFoundException when stored asset has no bucket or object_key', async () => {
    const noKeyRecord: AssetRecord = {
      id: 'no-key-asset',
      storage: 'supabase',
      bucket: null,
      object_key: null,
      mime: 'image/png',
    };
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(noKeyRecord) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );
    const res = buildMockResponse();

    await expect(service.streamByIdOrRedirect('no-key-asset', res)).rejects.toThrow(NotFoundException);
    await expect(service.streamByIdOrRedirect('no-key-asset', res)).rejects.toThrow('Asset has no stored content');
  });

  it('throws NotFoundException when asset does not exist', async () => {
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(null) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig(defaultConfig) as never,
      buildMockMediaStorage() as never,
    );
    const res = buildMockResponse();

    await expect(service.streamByIdOrRedirect('ghost-asset', res)).rejects.toThrow(NotFoundException);
  });

  it('proxies the external asset stream when externalStrategy is proxy', async () => {
    const externalRecord: AssetRecord = {
      id: 'ext-proxy-1',
      storage: 'external' as AssetRecord['storage'],
      source_url: 'https://external.cdn.com/video.mp4',
      mime: 'video/mp4',
    };
    const mockReadable = { pipe: jest.fn() };
    (axios.get as jest.Mock).mockResolvedValueOnce({
      headers: { 'content-type': 'video/mp4' },
      data: mockReadable,
    });
    const repo = buildMockRepo({ get: jest.fn().mockResolvedValue(externalRecord) });
    const service = new AssetsService(
      repo as never,
      buildMockConfig({ ...defaultConfig, ASSET_EXTERNAL_STRATEGY: 'proxy' }) as never,
      buildMockMediaStorage() as never,
    );
    const res = buildMockResponse();

    await service.streamByIdOrRedirect('ext-proxy-1', res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
    expect(mockReadable.pipe).toHaveBeenCalledWith(res);
  });
});
