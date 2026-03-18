/**
 * Command Router — Unified single-layout entry point.
 *
 * OaiAppShell is ALWAYS the layout (AppShellPage).
 *
 * Public routes (/, /features, /pricing, /about, /whats-possible, /login)
 *   — No auth required. Render inside OaiAppShell's content area.
 *   — Sidebar is empty (no navItems) and top nav shows a Log In button.
 *
 * Authenticated routes (/app/*)
 *   — Auth guard. Sidebar shows product links. Top nav shows user menu.
 *   — Redirects to /login if unauthenticated.
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
  // ─── All routes under AppShellPage (OaiAppShell is always the layout) ────
  {
    path: '/',
    component: () => import('../views/AppShellPage.vue'),
    children: [
      // Public routes — no auth required, sidebar empty, top nav shows Log In
      {
        path: '',
        name: 'Landing',
        component: () => import('../views/public/LandingPage.vue'),
        meta: { public: true },
      },
      {
        path: 'features',
        name: 'Features',
        component: () => import('../views/public/FeaturesPage.vue'),
        meta: { public: true },
      },
      {
        path: 'pricing',
        name: 'Pricing',
        component: () => import('../views/public/PricingPage.vue'),
        meta: { public: true },
      },
      {
        path: 'about',
        name: 'About',
        component: () => import('../views/public/AboutPage.vue'),
        meta: { public: true },
      },
      {
        path: 'whats-possible',
        name: 'WhatsPossible',
        component: () => import('../views/public/WhatsPossiblePage.vue'),
        meta: { public: true },
      },
      {
        path: 'login',
        name: 'Login',
        component: () => import('../views/LoginPage.vue'),
        meta: { public: true },
      },

      // Authenticated routes — auth guard, sidebar shows product links
      {
        path: 'app',
        redirect: '/app/dashboard',
        meta: { requiresAuth: true },
      },
      {
        path: 'app/dashboard',
        name: 'Dashboard',
        component: () => import('../views/DashboardPage.vue'),
        meta: { requiresAuth: true, title: 'Dashboard' },
      },

      // Access Denied — must NOT require auth to avoid redirect loops
      {
        path: 'access-denied',
        name: 'AccessDenied',
        component: () => import('../views/AccessDeniedPage.vue'),
      },
    ],
  },

  // ─── Catch-all — redirect unknown routes to landing ─────────────────────
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
});

// Navigation guard — authentication and RBAC.
// Public routes pass through immediately.
// /login redirects already-authenticated users to /app.
// /app/* routes require authentication.
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
