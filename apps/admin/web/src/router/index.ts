/**
 * Admin Web Router
 *
 * Route structure:
 * - Public routes (login, access-denied) render WITHOUT the AdminShell sidebar.
 * - All authenticated routes are children of AdminShell, which provides the
 *   OaiAppShell layout (sidebar + top nav). OaiAppShell uses useRouterOutlet=true
 *   so child pages render inside its IonRouterOutlet — no double sidebar.
 */
import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/rbacStore';
import { useRbacStore } from '../stores/rbacStore';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    public?: boolean;
    requiresPermission?: string | string[];
    requiresAllPermissions?: boolean;
    title?: string;
    description?: string;
  }
}

const routes: Array<RouteRecordRaw> = [
  // Root redirect
  {
    path: '/',
    redirect: '/app/admin/organizations',
  },

  // Public routes — rendered WITHOUT the AdminShell sidebar
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/access-denied',
    name: 'AccessDenied',
    component: () => import('../views/AccessDeniedPage.vue'),
    meta: { public: true },
  },

  // All authenticated routes under AdminShell (OaiAppShell provides the sidebar).
  // AdminShell uses useRouterOutlet=true — child pages render via IonRouterOutlet
  // inside the shell, so the OaiSidebar is the only sidebar that ever renders.
  {
    path: '/app',
    component: () => import('../views/AdminShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/app/admin/organizations',
      },

      // Organizations management
      {
        path: 'admin/organizations',
        name: 'AdminOrganizations',
        component: () => import('../views/admin/OrganizationsAdminPage.vue'),
        meta: {
          requiresAuth: true,
          requiresPermission: 'admin:settings',
          title: 'Organizations',
          description: 'Manage organizations',
        },
      },

      // User management
      {
        path: 'admin/users',
        name: 'AdminUsers',
        component: () => import('../views/admin/UserManagementPage.vue'),
        meta: {
          requiresAuth: true,
          requiresPermission: 'admin:users',
          title: 'User Management',
          description: 'Manage users and their roles',
        },
      },

      // Roles & permissions
      {
        path: 'admin/roles',
        name: 'AdminRoles',
        component: () => import('../views/admin/RoleManagementPage.vue'),
        meta: {
          requiresAuth: true,
          requiresPermission: 'admin:roles',
          title: 'Roles & Permissions',
          description: 'View and manage roles and permissions',
        },
      },

      // Entitlements management
      {
        path: 'admin/entitlements',
        name: 'AdminEntitlements',
        component: () => import('../views/admin/EntitlementsAdminPage.vue'),
        meta: {
          requiresAuth: true,
          requiresPermission: 'admin:settings',
          title: 'Entitlements',
          description: 'Grant or revoke product access per organization',
        },
      },

      // System configuration
      {
        path: 'admin/system',
        name: 'AdminSystem',
        component: () => import('../views/admin/SystemConfigPage.vue'),
        meta: {
          requiresAuth: true,
          requiresPermission: 'admin:settings',
          title: 'System Configuration',
          description: 'Manage system-level configuration',
        },
      },

      // LLM Analytics
      {
        path: 'admin/llm/usage',
        name: 'AdminLlmUsage',
        component: () => import('../views/admin/LlmUsagePage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'LLM Usage' },
      },
      {
        path: 'admin/llm/models',
        name: 'AdminLlmModels',
        component: () => import('../views/admin/LlmModelsPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'LLM Models' },
      },
      {
        path: 'admin/llm/costs',
        name: 'AdminLlmCosts',
        component: () => import('../views/admin/LlmCostsPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'LLM Costs' },
      },

      // RAG Management
      {
        path: 'admin/rag',
        name: 'AdminRagCollections',
        component: () => import('../views/admin/RagCollectionsPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'RAG Collections' },
      },
      {
        path: 'admin/rag/:id',
        name: 'AdminRagCollectionDetail',
        component: () => import('../views/admin/RagCollectionDetailPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'RAG Collection' },
      },

      // Agent Registry
      {
        path: 'admin/agents',
        name: 'AdminAgentRegistry',
        component: () => import('../views/admin/AgentRegistryPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Agent Registry' },
      },
      {
        path: 'admin/agents/:slug',
        name: 'AdminAgentDetail',
        component: () => import('../views/admin/AgentDetailPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Agent Detail' },
      },

      // Observability
      {
        path: 'admin/observability',
        name: 'AdminObservabilityDashboard',
        component: () => import('../views/admin/ObservabilityDashboardPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Observability' },
      },
      {
        path: 'admin/observability/events',
        name: 'AdminObservabilityEvents',
        component: () => import('../views/admin/ObservabilityEventsPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Event Log' },
      },

      // Data & Infrastructure
      {
        path: 'admin/crawler',
        name: 'AdminCrawler',
        component: () => import('../views/admin/CrawlerSourcesPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Crawler Sources' },
      },
      {
        path: 'admin/mcp',
        name: 'AdminMcp',
        component: () => import('../views/admin/McpAdminPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'MCP Servers' },
      },
      {
        path: 'admin/database',
        name: 'AdminDatabase',
        component: () => import('../views/admin/DatabaseAdminPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'Database' },
      },

      // System Health
      {
        path: 'admin/system/health',
        name: 'AdminSystemHealth',
        component: () => import('../views/admin/SystemHealthPage.vue'),
        meta: { requiresAuth: true, requiresPermission: 'admin:settings', title: 'System Health' },
      },
    ],
  },

  // Catch-all
  {
    path: '/:pathMatch(.*)*',
    redirect: '/app/admin/organizations',
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const isPublic = to.matched.some(record => record.meta.public);
  if (isPublic) {
    if (to.path === '/login') {
      const authStore = useAuthStore();
      const rbacStore = useRbacStore();
      if (!rbacStore.isInitialized) {
        try { await rbacStore.initialize(); } catch { /* continue */ }
      }
      if (authStore.isAuthenticated) {
        next({ path: '/app/admin/organizations' });
        return;
      }
    }
    next();
    return;
  }

  if (!to.matched.some((record) => record.meta.requiresAuth)) {
    next();
    return;
  }

  const authStore = useAuthStore();
  const rbacStore = useRbacStore();

  if (!rbacStore.isInitialized) {
    try {
      await rbacStore.initialize();
    } catch (error) {
      console.error('Failed to initialize RBAC:', error);
    }
  }

  if (!authStore.isAuthenticated) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  // Check RBAC permissions
  const requiredPermissions = to.meta.requiresPermission;
  if (requiredPermissions) {
    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];
    const requireAll = to.meta.requiresAllPermissions === true;
    const hasAccess = requireAll
      ? rbacStore.hasAllPermissions(permissions)
      : rbacStore.hasAnyPermission(permissions);

    if (!hasAccess && !rbacStore.isSuperAdmin) {
      next({
        path: '/access-denied',
        query: {
          requiredPermission: permissions.join(','),
          attemptedPath: to.fullPath,
        },
      });
      return;
    }
  }

  next();
});

export default router;
