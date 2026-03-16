/**
 * Application Context Detection Composable (Admin Web)
 * Simplified for Admin — only admin management context is relevant.
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/rbacStore';

export interface ApplicationContext {
  currentRoute: string;
  routeName?: string;
  activeView: 'organizations' | 'users' | 'roles' | 'entitlements' | 'system' | 'admin' | 'unknown';
  orgSlug?: string;
  userId?: string;
  userEmail?: string;
  isAuthenticated: boolean;
  hasAdminAccess: boolean;
  timestamp: string;
}

function detectActiveView(routePath: string): ApplicationContext['activeView'] {
  if (routePath.includes('/admin/organizations')) return 'organizations';
  if (routePath.includes('/admin/users')) return 'users';
  if (routePath.includes('/admin/roles')) return 'roles';
  if (routePath.includes('/admin/entitlements')) return 'entitlements';
  if (routePath.includes('/admin/system')) return 'system';
  if (routePath.startsWith('/app/admin')) return 'admin';
  return 'unknown';
}

export function useApplicationContext() {
  const route = useRoute();
  const authStore = useAuthStore();

  const context = computed<ApplicationContext>(() => ({
    currentRoute: route.path,
    routeName: route.name?.toString(),
    activeView: detectActiveView(route.path),
    orgSlug: authStore.currentOrganization || undefined,
    userId: authStore.user?.id,
    userEmail: authStore.user?.email,
    isAuthenticated: authStore.isAuthenticated,
    hasAdminAccess: authStore.hasAdminAccess ?? false,
    timestamp: new Date().toISOString(),
  }));

  return { context };
}
