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
        path: 'agents/legal-department/contract-review',
        name: 'LegalContractReview',
        component: () =>
          import(
            '../views/agents/legal-department/ContractReviewPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Contract Review',
          description:
            'Upload a contract for clause-level risk assessment and redlining',
        },
      },
      {
        path: 'agents/legal-department/legal-research',
        name: 'LegalResearch',
        component: () =>
          import(
            '../views/agents/legal-department/LegalResearchPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Legal Research',
          description:
            'Research a legal question with recursive depth-first analysis',
        },
      },
      {
        path: 'agents/legal-department/due-diligence',
        name: 'LegalDueDiligence',
        component: () =>
          import(
            '../views/agents/legal-department/DueDiligenceRoomPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Due Diligence Room',
          description:
            'Multi-document M&A due diligence analysis with risk matrix and reporting',
        },
      },
      {
        path: 'agents/legal-department/dd/:parentJobId/memo/:memoJobId',
        name: 'LegalDealMemoWorkspace',
        component: () =>
          import(
            '../views/agents/legal-department/DealMemoWorkspaceView.vue'
          ),
        props: true,
        meta: {
          requiresAuth: true,
          title: 'Deal Memo',
          description:
            'Acquisition agreement memo drafted from a completed DD Room',
        },
      },
      {
        path: 'agents/legal-department/adversarial-brief',
        name: 'LegalAdversarialBrief',
        component: () =>
          import(
            '../views/agents/legal-department/AdversarialBriefPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Brief Stress Test',
          description:
            'Adversarial stress-test your brief with a Red Team / Blue Team debate',
        },
      },
      {
        path: 'agents/legal-department/compliance-audit',
        name: 'LegalComplianceAudit',
        component: () =>
          import(
            '../views/agents/legal-department/ComplianceAuditPage.vue'
          ),
        meta: {
          requiresAuth: true,
          title: 'Compliance Audit',
          description:
            'Cross-reference policies against regulatory frameworks',
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

/**
 * Run an awaitable with a hard timeout. If the awaitable hasn't resolved
 * by `ms`, this resolves anyway so the navigation guard never blocks the
 * Vue mount on a hung RBAC initialization.
 *
 * Why this exists: rbacStore.initialize() awaits /auth/me and /auth/refresh.
 * If both 401 and the auth interceptor's deduplicated refresh path takes a
 * pathological turn (e.g. an in-flight promise that never settles, a stale
 * tokenStorage clearTokens that hangs), the guard's `await initialize()`
 * blocks router.isReady() forever — and main.ts only mounts the Vue app
 * after router.isReady() resolves. The visible symptom is a fully blank
 * page on /login because #app never mounted. Capping the wait fixes that
 * — if init can't finish quickly, we render the login page anyway and the
 * user can re-authenticate manually.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
    );
  });
}

// Navigation guard — authentication and RBAC
router.beforeEach(async (to, _from, next) => {
  // If heading to login, check if already authenticated and redirect to app
  if (to.path === '/login') {
    const authStore = useAuthStore();
    const rbacStore = useRbacStore();
    if (!rbacStore.isInitialized) {
      // Cap at 2s — if RBAC init can't settle that fast, render the login
      // form anyway so the user can sign in instead of seeing a blank page.
      await withTimeout(rbacStore.initialize(), 2000);
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

    // Initialize RBAC first — token may come from cookie/localStorage during init.
    // Same 2s timeout safety net as the /login branch above.
    if (!rbacStore.isInitialized) {
      await withTimeout(rbacStore.initialize(), 2000);
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
