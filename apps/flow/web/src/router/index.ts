import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const routes: Array<RouteRecordRaw> = [
  // Auth — top level, no shell
  {
    path: '/login',
    component: () => import('@/views/AuthView.vue'),
  },

  // App shell — all authenticated views nested under FlowShellPage
  {
    path: '/',
    component: () => import('@/views/FlowShellPage.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        component: () => import('@/views/HomeView.vue'),
      },
      {
        path: 'tasks',
        component: () => import('@/views/TasksView.vue'),
      },
      {
        path: 'tasks/:taskId',
        component: () => import('@/views/TaskDetailView.vue'),
      },
      {
        path: 'kanban',
        component: () => import('@/views/SprintBoardView.vue'),
      },
      {
        path: 'teams',
        component: () => import('@/views/TeamsView.vue'),
      },
      {
        path: 'teams/:teamId',
        component: () => import('@/views/TeamDetailView.vue'),
      },
      {
        path: 'sprints',
        component: () => import('@/views/SprintsView.vue'),
      },
      {
        path: 'shared-lists',
        component: () => import('@/views/SharedListsView.vue'),
      },
      {
        path: 'files',
        component: () => import('@/views/FilesView.vue'),
      },
    ],
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const authStore = useAuthStore();
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return '/login';
  }
  return true;
});

export default router;
