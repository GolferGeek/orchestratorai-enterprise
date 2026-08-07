import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAccessToken = vi.fn();

vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

describe('resolveConcreteOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessToken.mockResolvedValue('access-token');
  });

  it('uses a selected concrete organization', async () => {
    const { resolveConcreteOrganization } =
      await import('./organization-context');

    await expect(
      resolveConcreteOrganization({
        currentOrganization: 'acme',
        userOrganizations: [],
        isSuperAdmin: false,
      }),
    ).resolves.toBe('acme');
  });

  it('ignores the synthetic all-organizations membership', async () => {
    const { resolveConcreteOrganization } =
      await import('./organization-context');

    await expect(
      resolveConcreteOrganization({
        currentOrganization: '*',
        userOrganizations: [
          { organizationSlug: '*' },
          { organizationSlug: 'marketing' },
        ],
        isSuperAdmin: false,
      }),
    ).resolves.toBe('marketing');
  });

  it('resolves a super-admin tenant from the authoritative organization API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { slug: '*', name: 'All Organizations' },
        { slug: 'building', name: 'Building' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const { resolveConcreteOrganization } =
      await import('./organization-context');

    await expect(
      resolveConcreteOrganization({
        currentOrganization: '*',
        userOrganizations: [
          { organizationSlug: '*', roleName: 'admin', isGlobal: true },
        ],
        isSuperAdmin: false,
      }),
    ).resolves.toBe('building');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/organizations', {
      headers: {
        Authorization: 'Bearer access-token',
        'x-organization-slug': '*',
      },
    });
  });

  it('fails when a non-admin has no concrete membership', async () => {
    const { resolveConcreteOrganization } =
      await import('./organization-context');

    await expect(
      resolveConcreteOrganization({
        currentOrganization: '*',
        userOrganizations: [{ organizationSlug: '*' }],
        isSuperAdmin: false,
      }),
    ).rejects.toThrow('A concrete organization is required');
  });
});
