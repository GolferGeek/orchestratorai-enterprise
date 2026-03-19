import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomeView from '../views/home/HomeView.vue';

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
  {
    path: '/apps/research-hub',
    name: 'research-dashboard',
    component: () => import('../views/research-hub/ResearchDashboard.vue'),
  },
  {
    path: '/apps/research-hub/categories',
    name: 'research-categories',
    component: () => import('../views/research-hub/CategoriesView.vue'),
  },
  {
    path: '/apps/research-hub/categories/:id',
    name: 'research-category-detail',
    component: () => import('../views/research-hub/CategoryDetailView.vue'),
  },
  {
    path: '/apps/research-hub/narratives',
    name: 'research-narratives',
    component: () => import('../views/research-hub/NarrativesView.vue'),
  },
  {
    path: '/apps/research-hub/articles',
    name: 'research-articles',
    component: () => import('../views/research-hub/ArticlesView.vue'),
  },
  {
    path: '/apps/research-hub/articles/:id',
    name: 'research-article-detail',
    component: () => import('../views/research-hub/ArticleDetail.vue'),
  },
  {
    path: '/apps/research-hub/scout',
    name: 'research-scout',
    component: () => import('../views/research-hub/ScoutView.vue'),
  },
  {
    path: '/apps/research-hub/requests',
    name: 'research-requests',
    component: () => import('../views/research-hub/RequestsView.vue'),
  },
  {
    path: '/apps/research-hub/agent-card',
    name: 'research-agent-card',
    component: () => import('../views/research-hub/AgentCardView.vue'),
  },
  {
    path: '/apps/market-pulse',
    name: 'market-dashboard',
    component: () => import('../views/market-pulse/MarketDashboard.vue'),
  },
  {
    path: '/apps/market-pulse/feeds',
    name: 'market-feeds',
    component: () => import('../views/market-pulse/FeedsView.vue'),
  },
  {
    path: '/apps/market-pulse/trending',
    name: 'market-trending',
    component: () => import('../views/market-pulse/TrendingView.vue'),
  },
  {
    path: '/apps/market-pulse/queue',
    name: 'market-queue',
    component: () => import('../views/market-pulse/QueueView.vue'),
  },
  {
    path: '/apps/market-pulse/requests',
    name: 'market-requests',
    component: () => import('../views/market-pulse/RequestsView.vue'),
  },
  {
    path: '/apps/market-pulse/agent-card',
    name: 'market-agent-card',
    component: () => import('../views/market-pulse/MPAgentCardView.vue'),
  },
  {
    path: '/apps/content-forge',
    name: 'content-forge-dashboard',
    component: () => import('../views/content-forge/ContentForgeDashboard.vue'),
  },
  {
    path: '/apps/content-forge/drafts',
    name: 'content-forge-drafts',
    component: () => import('../views/content-forge/DraftsView.vue'),
  },
  {
    path: '/apps/content-forge/drafts/:id',
    name: 'content-forge-draft-editor',
    component: () => import('../views/content-forge/DraftEditorView.vue'),
  },
  {
    path: '/apps/content-forge/topics',
    name: 'content-forge-topics',
    component: () => import('../views/content-forge/TopicsView.vue'),
  },
  {
    path: '/apps/content-forge/workflow',
    name: 'content-forge-workflow',
    component: () => import('../views/content-forge/WorkflowView.vue'),
  },
  {
    path: '/apps/content-forge/agent-card',
    name: 'content-forge-agent-card',
    component: () => import('../views/content-forge/CFAgentCardView.vue'),
  },
  {
    path: '/apps/content-forge/sources',
    name: 'content-forge-sources',
    component: () => import('../views/content-forge/SourcesView.vue'),
  },
  {
    path: '/apps/content-forge/publishing',
    name: 'content-forge-publishing',
    component: () => import('../views/content-forge/PublishingView.vue'),
  },
  {
    path: '/apps/mini-me',
    name: 'mini-me-dashboard',
    component: () => import('../views/mini-me/MiniMeDashboard.vue'),
  },
  {
    path: '/apps/agent-consumer',
    name: 'agent-consumer',
    component: () => import('../views/agent-consumer/AgentConsumerDashboard.vue'),
  },
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
  {
    path: '/observability/messages/:id',
    name: 'observability-message-detail',
    component: () => import('../views/observability/MessageDetailRoute.vue'),
    props: true,
  },
  {
    path: '/observability/workflows/:id',
    name: 'observability-workflow-detail',
    component: () => import('../views/workflow/WorkflowTraceView.vue'),
    props: true,
  },
  {
    path: '/protocol-compare',
    name: 'protocol-compare',
    component: () => import('../views/protocol/ProtocolCompareView.vue'),
  },
  {
    path: '/matrix',
    name: 'matrix',
    component: () => import('../views/matrix/MatrixView.vue'),
  },
  {
    path: '/async-patterns',
    name: 'async-patterns',
    component: () => import('../views/async/AsyncPatternsView.vue'),
  },
  {
    path: '/workflow-trace',
    name: 'workflow-trace',
    component: () => import('../views/workflow/WorkflowTraceView.vue'),
  },
  {
    path: '/mcp-comparison',
    name: 'mcp-comparison',
    component: () => import('../views/mcp/MCPComparisonView.vue'),
  },
  {
    path: '/demo',
    name: 'demo',
    component: () => import('../views/demo/DemoModeView.vue'),
  },
  {
    path: '/scenarios',
    name: 'scenarios',
    component: () => import('../views/scenarios/ScenarioListView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/settings/SettingsView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  // Check localStorage directly to avoid pinia circular dependency at import time
  const hasToken = !!localStorage.getItem('agent-comm-jwt');
  if (to.name !== 'login' && !hasToken) {
    return { name: 'login' };
  }
});
