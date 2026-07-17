/**
 * useRbac Composable
 *
 * Provides reactive permission checks for Vue components.
 *
 * Usage:
 *   const { can, canAny, canAll, isAdmin, isSuperAdmin } = useRbac();
 *
 *   // In template or computed
 *   if (can('rag:write')) { ... }
 *   if (canAny(['admin:users', 'admin:roles'])) { ... }
 */
import { computed, type ComputedRef } from 'vue';
import { useRbacStore } from '@/stores/rbacStore';

interface UseRbacReturn {
  // Permission checks
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;

  // Computed permission checks (reactive)
  canRead: (resource: string) => ComputedRef<boolean>;
  canWrite: (resource: string) => ComputedRef<boolean>;
  canDelete: (resource: string) => ComputedRef<boolean>;
  canAdmin: (resource: string) => ComputedRef<boolean>;

  // Role checks
  isAdmin: ComputedRef<boolean>;
  isManager: ComputedRef<boolean>;
  isMember: ComputedRef<boolean>;
  isSuperAdmin: ComputedRef<boolean>;

  // Organization context
  currentOrg: ComputedRef<string | null>;
  organizations: ComputedRef<Array<{ slug: string; name: string; role: string }>>;

  // State
  isLoading: ComputedRef<boolean>;
  isInitialized: ComputedRef<boolean>;
}

export function useRbac(): UseRbacReturn {
  const rbacStore = useRbacStore();

  // Permission check functions
  const can = (permission: string): boolean => {
    return rbacStore.hasPermission(permission);
  };

  const canAny = (permissions: string[]): boolean => {
    return rbacStore.hasAnyPermission(permissions);
  };

  const canAll = (permissions: string[]): boolean => {
    return rbacStore.hasAllPermissions(permissions);
  };

  const hasRole = (role: string): boolean => {
    return rbacStore.hasRole(role);
  };

  // Resource-based permission helpers (reactive)
  const canRead = (resource: string): ComputedRef<boolean> => {
    return computed(() => rbacStore.hasPermission(`${resource}:read`));
  };

  const canWrite = (resource: string): ComputedRef<boolean> => {
    return computed(() => rbacStore.hasPermission(`${resource}:write`));
  };

  const canDelete = (resource: string): ComputedRef<boolean> => {
    return computed(() => rbacStore.hasPermission(`${resource}:delete`));
  };

  const canAdmin = (resource: string): ComputedRef<boolean> => {
    return computed(() => rbacStore.hasPermission(`${resource}:admin`));
  };

  // Role checks (reactive)
  const isAdmin = computed(() => rbacStore.hasRole('admin'));
  const isManager = computed(() => rbacStore.hasRole('manager'));
  const isMember = computed(() => rbacStore.hasRole('member'));
  const isSuperAdmin = computed(() => rbacStore.isSuperAdmin);

  // Organization context
  const currentOrg = computed(() => rbacStore.currentOrganization);
  const organizations = computed(() =>
    rbacStore.userOrganizations.map((org) => ({
      slug: org.organizationSlug,
      name: org.organizationName,
      role: org.roleName,
    }))
  );

  // State
  const isLoading = computed(() => rbacStore.isLoading);
  const isInitialized = computed(() => rbacStore.isInitialized);

  return {
    can,
    canAny,
    canAll,
    hasRole,
    canRead,
    canWrite,
    canDelete,
    canAdmin,
    isAdmin,
    isManager,
    isMember,
    isSuperAdmin,
    currentOrg,
    organizations,
    isLoading,
    isInitialized,
  };
}

export default useRbac;
