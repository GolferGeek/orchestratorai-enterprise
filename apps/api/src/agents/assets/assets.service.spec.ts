import { NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import type { AssetRecord } from './assets.repository';

describe('AssetsService public delivery boundary', () => {
  const repo = {
    get: jest.fn(),
    getByStorageLocation: jest.fn(),
    create: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('media'),
  };
  const storage = {
    providerName: 'supabase',
    upload: jest.fn(),
    download: jest.fn(),
  };
  const response = {
    setHeader: jest.fn(),
    send: jest.fn(),
  };
  let service: AssetsService;

  const storedAsset: AssetRecord = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    storage: 'supabase',
    bucket: 'media',
    object_key:
      'example-org/123e4567-e89b-42d3-a456-426614174001/image-agent/123e4567-e89b-42d3-a456-426614174002.png',
    mime: 'image/png',
    size: 3,
    user_id: 'user-1',
    conversation_id: '123e4567-e89b-42d3-a456-426614174001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.getOrThrow.mockReturnValue('media');
    storage.download.mockResolvedValue({
      data: Buffer.from('png'),
      contentType: 'image/png',
    });
    service = new AssetsService(
      repo as never,
      config as never,
      storage as never,
    );
  });

  it('serves only an exact database-backed storage location', async () => {
    repo.getByStorageLocation.mockResolvedValue(storedAsset);

    await service.streamStoredAsset(
      'media',
      storedAsset.object_key as string,
      response as never,
    );

    expect(repo.getByStorageLocation).toHaveBeenCalledWith(
      'media',
      storedAsset.object_key,
    );
    expect(storage.download).toHaveBeenCalledWith(
      'media',
      storedAsset.object_key,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('png'));
  });

  it('rejects a bucket outside the configured media bucket', async () => {
    await expect(
      service.streamStoredAsset(
        'private-documents',
        storedAsset.object_key as string,
        response as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repo.getByStorageLocation).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('rejects path traversal before querying storage', async () => {
    await expect(
      service.streamStoredAsset(
        'media',
        'example-org/../private/secret',
        response as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repo.getByStorageLocation).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('does not turn an unknown storage object into a storage oracle', async () => {
    repo.getByStorageLocation.mockResolvedValue(null);

    await expect(
      service.streamStoredAsset(
        'media',
        storedAsset.object_key as string,
        response as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.download).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs and external URL records', async () => {
    await expect(
      service.streamStoredAssetById('not-an-asset-id', response as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.get).not.toHaveBeenCalled();

    repo.get.mockResolvedValue({
      ...storedAsset,
      storage: 'external',
      source_url: 'https://attacker.example/redirect',
      bucket: null,
      object_key: null,
    });
    await expect(
      service.streamStoredAssetById(storedAsset.id, response as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('propagates storage failures instead of returning empty content', async () => {
    repo.get.mockResolvedValue(storedAsset);
    storage.download.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      service.streamStoredAssetById(storedAsset.id, response as never),
    ).rejects.toThrow('storage unavailable');
    expect(response.send).not.toHaveBeenCalled();
  });

  it('forces non-media content to download with nosniff protection', async () => {
    repo.get.mockResolvedValue({
      ...storedAsset,
      mime: 'application/pdf',
    });

    await service.streamStoredAssetById(storedAsset.id, response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment',
    );
  });
});
