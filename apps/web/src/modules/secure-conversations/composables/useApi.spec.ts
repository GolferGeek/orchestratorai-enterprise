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

describe('Secure Conversations API browser boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await useApi().secureConversationsApi.get('/registry/agents');

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/secure-conversations/registry/agents',
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'x-organization-slug': 'acme',
    });
  });

  it('does not call the API without authentication or tenant context', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { useApi } = await import('./useApi');

    getAccessToken.mockResolvedValueOnce(null);
    await expect(
      useApi().secureConversationsApi.get('/registry/agents'),
    ).rejects.toThrow('Authentication is required');

    getAccessToken.mockResolvedValueOnce('access-token');
    resolveConcreteOrganization.mockRejectedValueOnce(
      new Error('A concrete organization is required'),
    );
    await expect(
      useApi().secureConversationsApi.get('/registry/agents'),
    ).rejects.toThrow('A concrete organization is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and accepts an empty DELETE response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'not-json' })
      .mockResolvedValueOnce({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const { useApi } = await import('./useApi');
    const api = useApi().secureConversationsApi;

    await expect(api.get('/registry/agents')).rejects.toThrow('malformed JSON');
    await expect(api.del('/registry/agents/agent-1')).resolves.toBeUndefined();
  });
});
