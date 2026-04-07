/**
 * Forge Web Router
 *
 * Routes for Forge Web — complex LangGraph agent dashboards only.
 * Port 6201. Connects to Forge API on port 6200.
 *
 * Agents:
 *   - marketing-swarm   (multi-agent marketing content generation)
 *   - legal-department  (legal document analysis + HITL)
 *   - cad-agent         (AI-powered CAD model generation)
 */
import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/rbacStore';
import { useRbacStore } from '../stores/rbacStore';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresPermission?: string | string[];
    requiresAllPermissions?: boolean;
    title?: string;
    description?: string;
  }
}

const routes: Array<RouteRecordRaw> = [
  // Root redirects to login
  {
    path: '/',
    redirect: '/app',
  },

  // Auth
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue'),
  },
  // Access Denied — must NOT require auth to avoid redirect loops
  {
    path: '/access-denied',
    name: 'AccessDenied',
    component: () => import('../views/AccessDeniedPage.vue'),
  },

  // Forge App Shell — all agent dashboards live here
  {
    path: '/app',
    component: () => import('../views/ForgeShellPage.vue'),
    meta: { requiresAuth: true },
    children: [
      // Default: redirect to agent list
      {
        path: '',
        redirect: '/app/agents',
      },

      // Agent index — list of available complex agents
      {
        path: 'agents',
        name: 'AgentIndex',
        component: () => import('../views/agents/AgentIndexPage.vue'),
        meta: {
          requiresAuth: true,
          title: 'Forge Agents',
          description: 'Complex LangGraph agent dashboards',
        },
      },

      // ─── Marketing Swarm ─────────────────────────────────────────────────

      {
        path: 'agents/marketing-swarm',
        name: 'MarketingSwarm',
        component: () =>
          import('../views/agents/marketing-swarm/MarketingSwarmPage.vue'),
        meta: {
          requiresAuth: true,
          title: 'Marketing Swarm',
          description: 'Multi-agent marketing content generation',
        },
      },
      {
        path: 'agents/:orgSlug/marketing-swarm',
        name: 'MarketingSwarmOrg',
        component: () =>
          import('../views/agents/marketing-swarm/MarketingSwarmPage.vue'),
        meta: {
          requiresAuth: true,
          title: 'Marketing Swarm',
          description: 'Multi-agent marketing content generation',
        },
      },
      {
        path: 'agents/:orgSlug/marketing-swarm/tasks/:taskId',
        name: 'MarketingSwarmTask',
        component: () =>
          import('../views/agents/marketing-swarm/MarketingSwarmPage.vue'),
        meta: {
          requiresAuth: true,
          title: 'Marketing Swarm Task',
          description: 'View marketing swarm task details',
        },
      },

      // ─── Legal Department ─────────────────────────────────────────────────

      {
        path: 'agents/legal-department',
        name: 'LegalDepartment',
        component: () =>
          import(
            '../views/agents/legal-department/LegalDepartmentWorkspace.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Legal Department',
          description: 'Async document workspace — all activity',
        },
      },
      {
        // Single route for the workspace list AND the detail modal — the
        // modal opens via `?jobId=…` query rather than a child route so
        // IonRouterOutlet doesn't push a new view item (which broke the
        // ion-page lookup and triggered a runtime warning + TypeError in
        // @ionic/vue's isViewVisible).
        path: 'agents/legal-department/document-onboarding',
        name: 'LegalDocumentOnboarding',
        component: () =>
          import(
            '../views/agents/legal-department/DocumentOnboardingPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Document Onboarding',
          description: 'Drop a document and watch it run through the workflow',
        },
      },
      {
        path: 'agents/legal-department/settings',
        name: 'LegalSettings',
        component: () =>
          import('../views/agents/legal-department/LegalSettingsPage.vue'),
        meta: {
          requiresAuth: true,
          title: 'Legal Settings',
          description: 'Per-capability model picker',
        },
      },

      // ─── CAD Agent ────────────────────────────────────────────────────────

      {
        path: 'agents/cad-agent',
        name: 'CadAgent',
        component: () => import('../views/agents/cad-agent/CadAgentView.vue'),
        meta: {
          requiresAuth: true,
          title: 'CAD Agent',
          description: 'AI-powered CAD model generation',
        },
      },
      {
        path: 'agents/:orgSlug/cad-agent',
        name: 'CadAgentOrg',
        component: () => import('../views/agents/cad-agent/CadAgentView.vue'),
        meta: {
          requiresAuth: true,
          title: 'CAD Agent',
          description: 'AI-powered CAD model generation',
        },
      },

    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard — authentication and RBAC
router.beforeEach(async (to, _from, next) => {
  // If heading to login, check if already authenticated and redirect to app
  if (to.path === '/login') {
    const authStore = useAuthStore();
    const rbacStore = useRbacStore();
    if (!rbacStore.isInitialized) {
      try { await rbacStore.initialize(); } catch { /* continue */ }
    }
    if (authStore.isAuthenticated) {
      next({ path: '/app' });
      return;
    }
    next();
    return;
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    const authStore = useAuthStore();
    const rbacStore = useRbacStore();

    // Initialize RBAC first — token may come from cookie/localStorage during init
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

    if (!authStore.isAuthenticated) {
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }

    const requiredPermissions = to.meta.requiresPermission;
    if (requiredPermissions) {
      const permissions = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];
      const requireAll = to.meta.requiresAllPermissions === true;

      const hasAccess = requireAll
        ? rbacStore.hasAllPermissions(permissions)
        : rbacStore.hasAnyPermission(permissions);

      if (!hasAccess) {
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
  } else {
    next();
  }
});

export default router;
