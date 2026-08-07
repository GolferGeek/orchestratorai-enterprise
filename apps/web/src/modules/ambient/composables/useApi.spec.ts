import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn();
const initialize = vi.fn();
const resolveConcreteOrganization = vi.fn();

vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

vi.mock('@/stores/rbacStore', () => ({
  useRbacStore: () => ({ initialize }),
}));

vi.mock('@/shared/services/organization-context', () => ({
  resolveConcreteOrganization,
}));

describe('Ambient API browser boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getAccessToken.mockResolvedValue('access-token');
    initialize.mockResolvedValue(undefined);
    resolveConcreteOrganization.mockResolvedValue('acme');
  });

  it('uses canonical auth and explicit organization scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { useApi } = await import('./useApi');

    await useApi().ambientApi.get('/listeners');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ambient/listeners');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'x-organization-slug': 'acme',
    });
  });

  it('does not call Ambient without authentication or tenant context', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { useApi } = await import('./useApi');

    getAccessToken.mockResolvedValueOnce(null);
    await expect(useApi().ambientApi.get('/listeners')).rejects.toThrow(
      'Authentication is required',
    );

    getAccessToken.mockResolvedValueOnce('access-token');
    resolveConcreteOrganization.mockRejectedValueOnce(
      new Error('A concrete organization is required'),
    );
    await expect(useApi().ambientApi.get('/listeners')).rejects.toThrow(
      'A concrete organization is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
