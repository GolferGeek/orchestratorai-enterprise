/**
 * Command Router
 * Navigation shell routes only — no business logic routes.
 * The shell has three route groups:
 *   1. /login — public, unauthenticated entry point
 *   2. /app — authenticated shell containing the product launcher dashboard
 *   3. /access-denied — shown when RBAC permissions are insufficient
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
  }
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/app',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/app',
    component: () => import('../views/AppShellPage.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/app/dashboard',
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/DashboardPage.vue'),
        meta: { requiresAuth: true, title: 'Dashboard' },
      },
    ],
  },
  // Access Denied — must NOT require auth to avoid redirect loops
  {
    path: '/access-denied',
    name: 'AccessDenied',
    component: () => import('../views/AccessDeniedPage.vue'),
  },
  {
    // Catch-all — redirect unknown routes to login
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard — authentication and RBAC
router.beforeEach(async (to, _from, next) => {
  const isPublic = to.matched.some(record => record.meta.public);
  if (isPublic) {
    // If already authenticated and heading to login, redirect to app
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
    }
    next();
    return;
  }

  if (!to.matched.some(record => record.meta.requiresAuth)) {
    next();
    return;
  }

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
        query: { requiredPermission: permissions.join(','), attemptedPath: to.fullPath },
      });
      return;
    }
  }

  next();
});

export default router;
