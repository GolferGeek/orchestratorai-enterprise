import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));
vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

import { platformApiClient } from './api-client';

describe('PlatformApiClient authentication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentOrganization', 'acme');
    getAccessToken.mockResolvedValue('canonical-access-token');
  });

  it('uses canonical token storage and sends the active organization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      platformApiClient.get<{ status: string }>('/health'),
    ).resolves.toEqual({ status: 'ok' });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer canonical-access-token');
    expect(headers.get('x-organization-slug')).toBe('acme');
  });

  it('fails before network access when authentication is missing', async () => {
    getAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(platformApiClient.get('/health')).rejects.toThrow(
      'Authentication is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty successful response instead of inventing data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '' }),
    );

    await expect(platformApiClient.get('/health')).rejects.toThrow(
      'empty response',
    );
  });
});
