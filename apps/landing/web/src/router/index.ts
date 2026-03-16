/**
 * Landing Web Router
 * Public routes only — no auth required for any of these.
 * "Get Started" and "Login" CTAs redirect to Command Web (port 6001).
 */

import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/LandingPage.vue'),
  },
  {
    path: '/features',
    name: 'Features',
    component: () => import('../views/FeaturesPage.vue'),
  },
  {
    path: '/pricing',
    name: 'Pricing',
    component: () => import('../views/PricingPage.vue'),
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/AboutPage.vue'),
  },
  {
    path: '/whats-possible',
    name: 'WhatsPossible',
    component: () => import('../views/WhatsPossiblePage.vue'),
  },
  {
    // Catch-all: redirect unknown routes to landing
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
});

export default router;
