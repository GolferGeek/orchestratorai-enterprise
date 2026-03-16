/**
 * Compose Web Router
 *
 * Routes for the Compose product:
 * - Agent list view (browse available simple agents)
 * - Agent conversation view (chat with an agent)
 * - Runner compose view (build custom pipeline from runners)
 *
 * Auth views (login/logout) are handled by Command / Auth product.
 * Admin views belong in Admin Web.
 * Complex LangGraph dashboards belong in Forge Web.
 */

import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/rbacStore';
import { useRbacStore } from '../stores/rbacStore';

// Eagerly import the landing page to avoid Ionic's "enteringEl is undefined"
// error that occurs when the initial page transition fires before the
// lazy-loaded component has mounted its <ion-page> element.
import AgentListView from '../views/AgentListView.vue';
import AgentsPage from '../views/AgentsPage.vue';
import AgentConversationView from '../views/AgentConversationView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    public?: boolean;
    requiresPermission?: string | string[];
    requiresAllPermissions?: boolean;
    title?: string;
  }
}

const routes: Array<RouteRecordRaw> = [
  // Root → agents list
  {
    path: '/',
    redirect: '/app/agents',
  },

  // Shell layout
  {
    path: '/app',
    component: AgentsPage,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/app/agents',
      },

      // -----------------------------------------------------------------------
      // Compose-specific routes
      // -----------------------------------------------------------------------

      // Agent list — browse available simple agents (eagerly imported)
      {
        path: 'agents',
        name: 'AgentList',
        component: AgentListView,
        meta: { requiresAuth: true, title: 'Agents' },
      },

      // Agent conversation — chat with a specific agent (eagerly imported)
      {
        path: 'agents/:agentSlug/conversation',
        name: 'AgentConversation',
        component: AgentConversationView,
        meta: { requiresAuth: true, title: 'Conversation' },
      },

      // Runner compose — build a custom pipeline
      {
        path: 'compose',
        name: 'RunnerCompose',
        component: () => import('../views/RunnerComposeView.vue'),
        meta: { requiresAuth: true, title: 'Build Pipeline' },
      },

      // Home/Welcome — conversation UI (existing generic chat)
      {
        path: 'home',
        name: 'Home',
        component: () => import('../views/HomePage.vue'),
        meta: { requiresAuth: true, title: 'Compose' },
      },

      {
        path: 'welcome',
        name: 'Welcome',
        component: () => import('../views/WelcomePage.vue'),
        meta: { requiresAuth: true, title: 'Welcome' },
      },

      // Organization switcher context
      {
        path: 'organization',
        name: 'Organization',
        component: () => import('../views/OrganizationPage.vue'),
        meta: { requiresAuth: true, title: 'Organization' },
      },
    ],
  },

  // Access Denied — shown when RBAC check fails (must NOT require auth to avoid redirect loops)
  {
    path: '/access-denied',
    name: 'AccessDenied',
    component: () => import('../views/AccessDeniedPage.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard — authentication + RBAC permission check
router.beforeEach(async (to, _from, next) => {
  if (!to.matched.some((record) => record.meta.requiresAuth)) {
    next();
    return;
  }

  const authStore = useAuthStore();
  const rbacStore = useRbacStore();

  if (!authStore.isAuthenticated) {
    // Redirect to Auth product login (handled by Command shell)
    // For now, show access denied if unauthenticated
    next({ path: '/access-denied', query: { reason: 'unauthenticated' } });
    return;
  }

  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  // Re-check after initialization (token may have expired)
  if (!authStore.isAuthenticated) {
    next({ path: '/access-denied', query: { reason: 'unauthenticated' } });
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
});

export default router;
