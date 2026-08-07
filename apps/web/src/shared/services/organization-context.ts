import { tokenStorage } from '@/services/tokenStorageService';

interface OrganizationMembership {
  organizationSlug: string;
  roleName?: string;
  isGlobal?: boolean;
}

interface OrganizationContextStore {
  currentOrganization: string | null;
  userOrganizations: OrganizationMembership[];
  isSuperAdmin: boolean;
}

export async function resolveConcreteOrganization(
  store: OrganizationContextStore,
): Promise<string> {
  if (store.currentOrganization && store.currentOrganization !== '*') {
    return store.currentOrganization;
  }

  const membership = store.userOrganizations.find(
    (organization) => organization.organizationSlug !== '*',
  );
  if (membership) {
    return membership.organizationSlug;
  }
  const hasGlobalAdminScope = store.userOrganizations.some(
    (organization) =>
      organization.organizationSlug === '*' &&
      organization.isGlobal === true &&
      organization.roleName === 'admin',
  );
  if (!store.isSuperAdmin && !hasGlobalAdminScope) {
    throw new Error('A concrete organization is required');
  }

  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Authentication is required to resolve an organization');
  }
  const response = await fetch('/api/admin/organizations', {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': '*',
    },
  });
  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}`,
    );
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error('Organization lookup response was malformed');
  }
  const organizations = body.map((value) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      typeof (value as Record<string, unknown>).slug !== 'string' ||
      !(value as Record<string, unknown>).slug
    ) {
      throw new Error('Organization lookup response was malformed');
    }
    return (value as Record<string, unknown>).slug as string;
  });
  const concreteOrganization = organizations.find((slug) => slug !== '*');
  if (!concreteOrganization) {
    throw new Error('No concrete organization is configured');
  }
  return concreteOrganization;
}
