import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomeView from '../views/home/HomeView.vue';

/**
 * Bridge Web Router — Port 6601
 *
 * Bridge is the External A2A Communication Gateway.
 * Routes are organized around:
 * - Inbound A2A traffic monitoring
 * - Outbound A2A request management
 * - External agent registry
 * - Security monitoring (signatures, rate limits, violations)
 * - Observability (message log, audit trail)
 * - Scenarios and guided training
 * - Protocol matrix and settings
 *
 * STRIPPED: Internal agent UIs (research-hub, market-pulse, content-forge, mini-me, agent-consumer)
 *           Those are internal automation and belong in Pulse, not Bridge.
 */

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
  },
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },

  // External Agent Registry
  {
    path: '/registry',
    name: 'registry',
    component: () => import('../views/registry/RegistryView.vue'),
  },
  {
    path: '/registry/agents/:id',
    name: 'registry-agent-detail',
    component: () => import('../views/registry/AgentDetailView.vue'),
    props: true,
  },

  // Inbound A2A monitoring
  {
    path: '/inbound',
    name: 'inbound',
    component: () => import('../views/inbound/InboundView.vue'),
  },

  // Outbound A2A management
  {
    path: '/outbound',
    name: 'outbound',
    component: () => import('../views/outbound/OutboundView.vue'),
  },

  // Security monitoring
  {
    path: '/security',
    name: 'security',
    component: () => import('../views/security/SecurityView.vue'),
  },

  // Observability
  {
    path: '/observability',
    name: 'observability',
    component: () => import('../views/observability/ObservabilityView.vue'),
  },
  {
    path: '/observability/topology',
    name: 'observability-topology',
    component: () => import('../views/observability/NetworkTopologyView.vue'),
  },
  {
    path: '/observability/timeline',
    name: 'observability-timeline',
    component: () => import('../views/observability/MessageTimelineView.vue'),
  },
  {
    path: '/observability/metrics',
    name: 'observability-metrics',
    component: () => import('../views/observability/MetricsView.vue'),
  },
  {
    path: '/observability/audit',
    name: 'observability-audit',
    component: () => import('../views/observability/AuditTrailView.vue'),
  },
  // Training & Scenarios (KEEP — Bridge has built-in guided scenarios)
  {
    path: '/scenarios',
    name: 'scenarios',
    component: () => import('../views/scenarios/ScenarioListView.vue'),
  },
  {
    path: '/demo',
    name: 'demo',
    component: () => import('../views/demo/DemoModeView.vue'),
  },

  // Protocol tools (KEEP — used for A2A protocol education)
  {
    path: '/matrix',
    name: 'matrix',
    component: () => import('../views/matrix/MatrixView.vue'),
  },
  {
    path: '/protocol-compare',
    name: 'protocol-compare',
    component: () => import('../views/protocol/ProtocolCompareView.vue'),
  },

  // Settings
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/settings/SettingsView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach((to) => {
  const hasToken = !!localStorage.getItem('authToken') || !!localStorage.getItem('bridge-jwt') || !!localStorage.getItem('agent-comm-jwt');
  if (to.name !== 'login' && !hasToken) {
    return { name: 'login' };
  }
});
