/**
 * Command Router — Unified entry point.
 * Two-tier routing:
 *   1. Public routes (/,/features,/pricing,/about,/whats-possible,/login)
 *      No auth required. Renders landing pages with NavBar + Footer.
 *   2. Authenticated routes (/app/*)
 *      Auth guard. Renders OaiAppShell with sidebar + product nav.
 *
 * The / root shows the landing page. Authenticated users can still visit the
 * landing — they choose when to enter /app. Login success redirects to /app/dashboard.
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
  // ─── Public routes — no auth, no sidebar ────────────────────────────────
  {
    path: '/',
    component: () => import('../components/landing/PublicLayout.vue'),
    children: [
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
    ],
  },

  // ─── Authenticated routes — OaiAppShell with sidebar ────────────────────
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

  // ─── Access Denied — must NOT require auth to avoid redirect loops ───────
  {
    path: '/access-denied',
    name: 'AccessDenied',
    component: () => import('../views/AccessDeniedPage.vue'),
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
