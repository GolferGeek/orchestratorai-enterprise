import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn();
vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

describe('Workflows API authentication and tenant boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentOrganization', 'acme');
    getAccessToken.mockResolvedValue('access-token');
  });

  it('uses the canonical token and organization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', workflows: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { workflowsApiService } = await import('./workflows-api.service');

    await workflowsApiService.fetchWorkflows('acme');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('x-organization-slug')).toBe('acme');
  });

  it('does not call a protected endpoint without a token', async () => {
    getAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { workflowsApiService } = await import('./workflows-api.service');

    await expect(workflowsApiService.fetchWorkflows()).rejects.toThrow(
      'Authentication is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
