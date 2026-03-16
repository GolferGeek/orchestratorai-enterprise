import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { SupabaseService } from '@/planes/database/supabase-client.service';
import { DatabaseService } from '@/database';
import { MediaStorageHelper } from '../supabase-media-storage.service';

describe('MediaStorageHelper URL contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MEDIA_STORAGE_BUCKET: 'media',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds API proxied URL when PUBLIC_API_URL is set', async () => {
    process.env.PUBLIC_API_URL = 'http://test-api-host:8080/';

    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://supabase.example/public-path' },
    });

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-proxy' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    const mockDb = {
      from: jest.fn().mockReturnValue({ insert }),
    } as unknown as DatabaseService;

    const supabaseService = {
      getServiceClient: jest.fn().mockReturnValue({
        storage: {
          from: jest.fn().mockReturnValue({
            upload,
            getPublicUrl,
          }),
        },
      }),
    } as unknown as SupabaseService;

    const service = new MediaStorageHelper(mockDb, supabaseService);
    const context = createMockExecutionContext({
      orgSlug: 'org',
      conversationId: 'conv',
      taskId: 'task',
      userId: 'user',
    });

    const result = await service.storeGeneratedMedia(
      Buffer.from('smoke'),
      context,
      {
        prompt: 'smoke',
        provider: 'openai',
        model: 'gpt-image-1',
        mime: 'image/png',
      },
    );

    expect(
      result.url.startsWith('http://test-api-host:8080/assets/storage/media/'),
    ).toBe(true);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('falls back to Supabase public URL when PUBLIC_API_URL is not set', async () => {
    delete process.env.PUBLIC_API_URL;
    delete process.env.SUPABASE_STORAGE_USE_SIGNED_URLS;
    delete process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS;

    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://supabase.example/public-path' },
    });

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-public' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    const mockDb = {
      from: jest.fn().mockReturnValue({ insert }),
    } as unknown as DatabaseService;

    const supabaseService = {
      getServiceClient: jest.fn().mockReturnValue({
        storage: {
          from: jest.fn().mockReturnValue({
            upload,
            getPublicUrl,
          }),
        },
      }),
    } as unknown as SupabaseService;

    const service = new MediaStorageHelper(mockDb, supabaseService);
    const context = createMockExecutionContext({
      orgSlug: 'org',
      conversationId: 'conv',
      taskId: 'task',
      userId: 'user',
    });

    const result = await service.storeGeneratedMedia(
      Buffer.from('smoke'),
      context,
      {
        prompt: 'smoke',
        provider: 'openai',
        model: 'gpt-image-1',
        mime: 'image/png',
      },
    );

    expect(getPublicUrl).toHaveBeenCalled();
    expect(result.url).toBe('https://supabase.example/public-path');
  });

  it('uses signed URLs when SUPABASE_STORAGE_USE_SIGNED_URLS is enabled', async () => {
    delete process.env.PUBLIC_API_URL;
    process.env.SUPABASE_STORAGE_USE_SIGNED_URLS = 'true';
    process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS = '600';

    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://supabase.example/public-path' },
    });
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://supabase.example/signed-path?token=abc' },
      error: null,
    });

    const single = jest.fn().mockResolvedValue({
      data: { id: 'asset-signed' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });

    const mockDb = {
      from: jest.fn().mockReturnValue({ insert }),
    } as unknown as DatabaseService;

    const supabaseService = {
      getServiceClient: jest.fn().mockReturnValue({
        storage: {
          from: jest.fn().mockReturnValue({
            upload,
            getPublicUrl,
            createSignedUrl,
          }),
        },
      }),
    } as unknown as SupabaseService;

    const service = new MediaStorageHelper(mockDb, supabaseService);
    const context = createMockExecutionContext({
      orgSlug: 'org',
      conversationId: 'conv',
      taskId: 'task',
      userId: 'user',
    });

    const result = await service.storeGeneratedMedia(
      Buffer.from('smoke'),
      context,
      {
        prompt: 'smoke',
        provider: 'openai',
        model: 'gpt-image-1',
        mime: 'image/png',
      },
    );

    expect(createSignedUrl).toHaveBeenCalled();
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(result.url).toContain('signed-path');
  });
});
