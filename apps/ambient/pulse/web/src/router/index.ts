import { createRouter, createWebHistory } from '@ionic/vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/triggers',
      name: 'triggers',
      component: () => import('../views/TriggersView.vue'),
    },
    {
      path: '/executions',
      name: 'executions',
      component: () => import('../views/ExecutionsView.vue'),
    },
    {
      path: '/listeners',
      name: 'listeners',
      component: () => import('../views/ListenersView.vue'),
    },
    {
      path: '/workflows',
      name: 'workflows',
      component: () => import('../views/WorkflowsView.vue'),
    },
    {
      path: '/scenarios',
      name: 'scenarios',
      component: () => import('../views/ScenariosView.vue'),
    },
    {
      path: '/scenarios/:id',
      name: 'scenario-detail',
      component: () => import('../views/ScenarioDetailView.vue'),
    },
    {
      path: '/stream',
      name: 'stream',
      component: () => import('../views/StreamView.vue'),
    },
  ],
});

export { router };
