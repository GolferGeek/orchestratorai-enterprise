import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AppShellPage from '@/shell/AppShellPage.vue';
import DashboardPage from '@/modules/auth/DashboardPage.vue';
import AdminModule from '@/modules/admin/AdminModule.vue';
import AgentConversationView from '@/modules/agents/views/AgentConversationView.vue';
import AgentListView from '@/modules/agents/views/AgentListView.vue';
import RunnerComposeView from '@/modules/agents/views/RunnerComposeView.vue';
import AmbientDashboardView from '@/modules/ambient/views/DashboardView.vue';
import AmbientExecutionsView from '@/modules/ambient/views/ExecutionsView.vue';
import AmbientListenersView from '@/modules/ambient/views/ListenersView.vue';
import AmbientScenarioDetailView from '@/modules/ambient/views/ScenarioDetailView.vue';
import AmbientScenariosView from '@/modules/ambient/views/ScenariosView.vue';
import AmbientStreamView from '@/modules/ambient/views/StreamView.vue';
import AmbientTriggersView from '@/modules/ambient/views/TriggersView.vue';
import AmbientWorkflowsView from '@/modules/ambient/views/WorkflowsView.vue';
import EntitlementsAdminPage from '@/modules/admin/views/EntitlementsAdminPage.vue';
import AgentDetailPage from '@/modules/admin/views/AgentDetailPage.vue';
import AgentRegistryPage from '@/modules/admin/views/AgentRegistryPage.vue';
import DatabaseAdminPage from '@/modules/admin/views/DatabaseAdminPage.vue';
import LlmCostsPage from '@/modules/admin/views/LlmCostsPage.vue';
import LlmModelsPage from '@/modules/admin/views/LlmModelsPage.vue';
import LlmUsagePage from '@/modules/admin/views/LlmUsagePage.vue';
import McpAdminPage from '@/modules/admin/views/McpAdminPage.vue';
import ObservabilityDashboardPage from '@/modules/admin/views/ObservabilityDashboardPage.vue';
import ObservabilityEventsPage from '@/modules/admin/views/ObservabilityEventsPage.vue';
import OrganizationsAdminPage from '@/modules/admin/views/OrganizationsAdminPage.vue';
import RagCollectionDetailPage from '@/modules/admin/views/RagCollectionDetailPage.vue';
import RagCollectionsPage from '@/modules/admin/views/RagCollectionsPage.vue';
import RoleManagementPage from '@/modules/admin/views/RoleManagementPage.vue';
import SystemConfigPage from '@/modules/admin/views/SystemConfigPage.vue';
import SystemHealthPage from '@/modules/settings/SystemHealthPage.vue';
import UserManagementPage from '@/modules/admin/views/UserManagementPage.vue';
import RagModule from '@/modules/rag/RagModule.vue';
import SettingsModule from '@/modules/settings/SettingsModule.vue';
import { useRbacStore } from '@/stores/rbacStore';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppShellPage,
    children: [
      {
        path: '',
        redirect: '/app/dashboard',
      },
      {
        path: 'dashboard',
        redirect: '/app/dashboard',
      },
      {
        path: 'app',
        redirect: '/app/dashboard',
        meta: { requiresAuth: true },
      },
      {
        path: 'app/dashboard',
        name: 'dashboard',
        component: DashboardPage,
        meta: { requiresAuth: true, title: 'Dashboard' },
      },
      {
        path: 'app/agents',
        name: 'agents',
        component: AgentListView,
        meta: { requiresAuth: true, title: 'Agents' },
      },
      {
        path: 'app/agents/compose',
        name: 'RunnerCompose',
        component: RunnerComposeView,
        meta: { requiresAuth: true, title: 'Build Pipeline' },
      },
      {
        path: 'app/agents/:agentSlug/conversation',
        name: 'AgentConversation',
        component: AgentConversationView,
        meta: { requiresAuth: true, title: 'Agent Conversation' },
      },
      {
        path: 'app/workflows',
        name: 'workflows',
        redirect: '/app/workflows/marketing-swarm',
        meta: { requiresAuth: true, title: 'Workflows' },
      },
      {
        path: 'app/workflows/marketing-swarm',
        name: 'MarketingSwarm',
        component: () => import('@/modules/workflows/views/marketing-swarm/MarketingSwarmPage.vue'),
        meta: { requiresAuth: true, title: 'Marketing Swarm' },
      },
      {
        path: 'app/ambient',
        name: 'ambient',
        component: AmbientDashboardView,
        meta: { requiresAuth: true, title: 'Ambient Dashboard' },
      },
      {
        path: 'app/ambient/listeners',
        name: 'ambient-listeners',
        component: AmbientListenersView,
        meta: { requiresAuth: true, title: 'Ambient Listeners' },
      },
      {
        path: 'app/ambient/workflows',
        name: 'ambient-workflows',
        component: AmbientWorkflowsView,
        meta: { requiresAuth: true, title: 'Ambient Workflows' },
      },
      {
        path: 'app/ambient/triggers',
        name: 'ambient-triggers',
        component: AmbientTriggersView,
        meta: { requiresAuth: true, title: 'Ambient Triggers' },
      },
      {
        path: 'app/ambient/executions',
        name: 'ambient-executions',
        component: AmbientExecutionsView,
        meta: { requiresAuth: true, title: 'Ambient Executions' },
      },
      {
        path: 'app/ambient/scenarios',
        name: 'ambient-scenarios',
        component: AmbientScenariosView,
        meta: { requiresAuth: true, title: 'Ambient Scenarios' },
      },
      {
        path: 'app/ambient/scenarios/:id',
        name: 'ambient-scenario-detail',
        component: AmbientScenarioDetailView,
        meta: { requiresAuth: true, title: 'Ambient Scenario' },
      },
      {
        path: 'app/ambient/stream',
        name: 'ambient-stream',
        component: AmbientStreamView,
        meta: { requiresAuth: true, title: 'Ambient Event Stream' },
      },
      {
        path: 'app/secure-conversations',
        name: 'secure-conversations',
        component: () => import('@/modules/secure-conversations/views/home/HomeView.vue'),
        meta: { requiresAuth: true, title: 'Secure Conversations' },
      },
      {
        path: 'app/secure-conversations/registry',
        name: 'secure-conversations-registry',
        component: () => import('@/modules/secure-conversations/views/registry/RegistryView.vue'),
        meta: { requiresAuth: true, title: 'External Agent Registry' },
      },
      {
        path: 'app/secure-conversations/registry/agents/:id',
        name: 'secure-conversations-agent-detail',
        component: () => import('@/modules/secure-conversations/views/registry/AgentDetailView.vue'),
        props: true,
        meta: { requiresAuth: true, title: 'External Agent' },
      },
      {
        path: 'app/secure-conversations/inbound',
        name: 'secure-conversations-inbound',
        component: () => import('@/modules/secure-conversations/views/inbound/InboundView.vue'),
        meta: { requiresAuth: true, title: 'Inbound A2A' },
      },
      {
        path: 'app/secure-conversations/outbound',
        name: 'secure-conversations-outbound',
        component: () => import('@/modules/secure-conversations/views/outbound/OutboundView.vue'),
        meta: { requiresAuth: true, title: 'Outbound A2A' },
      },
      {
        path: 'app/secure-conversations/security',
        name: 'secure-conversations-security',
        component: () => import('@/modules/secure-conversations/views/security/SecurityView.vue'),
        meta: { requiresAuth: true, title: 'Security' },
      },
      {
        path: 'app/secure-conversations/observability',
        name: 'secure-conversations-observability',
        component: () => import('@/modules/secure-conversations/views/observability/ObservabilityView.vue'),
        meta: { requiresAuth: true, title: 'Observability' },
      },
      {
        path: 'app/secure-conversations/observability/topology',
        name: 'secure-conversations-topology',
        component: () => import('@/modules/secure-conversations/views/observability/NetworkTopologyView.vue'),
        meta: { requiresAuth: true, title: 'Network Topology' },
      },
      {
        path: 'app/secure-conversations/observability/timeline',
        name: 'secure-conversations-timeline',
        component: () => import('@/modules/secure-conversations/views/observability/MessageTimelineView.vue'),
        meta: { requiresAuth: true, title: 'Message Timeline' },
      },
      {
        path: 'app/secure-conversations/observability/metrics',
        name: 'secure-conversations-metrics',
        component: () => import('@/modules/secure-conversations/views/observability/MetricsView.vue'),
        meta: { requiresAuth: true, title: 'Metrics' },
      },
      {
        path: 'app/secure-conversations/observability/audit',
        name: 'secure-conversations-audit',
        component: () => import('@/modules/secure-conversations/views/observability/AuditTrailView.vue'),
        meta: { requiresAuth: true, title: 'Audit Trail' },
      },
      {
        path: 'app/secure-conversations/scenarios',
        name: 'secure-conversations-scenarios',
        component: () => import('@/modules/secure-conversations/views/scenarios/ScenarioListView.vue'),
        meta: { requiresAuth: true, title: 'Scenarios' },
      },
      {
        path: 'app/secure-conversations/demo',
        name: 'secure-conversations-demo',
        component: () => import('@/modules/secure-conversations/views/demo/DemoModeView.vue'),
        meta: { requiresAuth: true, title: 'Demo Mode' },
      },
      {
        path: 'app/secure-conversations/matrix',
        name: 'secure-conversations-matrix',
        component: () => import('@/modules/secure-conversations/views/matrix/MatrixView.vue'),
        meta: { requiresAuth: true, title: 'Protocol Matrix' },
      },
      {
        path: 'app/secure-conversations/protocol-compare',
        name: 'secure-conversations-protocol-compare',
        component: () => import('@/modules/secure-conversations/views/protocol/ProtocolCompareView.vue'),
        meta: { requiresAuth: true, title: 'Protocol Compare' },
      },
      {
        path: 'app/secure-conversations/settings',
        name: 'secure-conversations-settings',
        component: () => import('@/modules/secure-conversations/views/settings/SettingsView.vue'),
        meta: { requiresAuth: true, title: 'Secure Conversation Settings' },
      },
      {
        path: 'app/admin',
        redirect: '/app/admin/organizations',
        meta: { requiresAuth: true },
      },
      {
        path: 'app/admin/organizations',
        name: 'admin-organizations',
        component: OrganizationsAdminPage,
        meta: { requiresAuth: true, title: 'Organizations' },
      },
      {
        path: 'app/admin/users',
        name: 'admin-users',
        component: UserManagementPage,
        meta: { requiresAuth: true, title: 'Users' },
      },
      {
        path: 'app/admin/roles',
        name: 'admin-roles',
        component: RoleManagementPage,
        meta: { requiresAuth: true, title: 'Roles' },
      },
      {
        path: 'app/admin/entitlements',
        name: 'admin-entitlements',
        component: EntitlementsAdminPage,
        meta: { requiresAuth: true, title: 'Entitlements' },
      },
      {
        path: 'app/admin/llm/usage',
        name: 'admin-llm-usage',
        component: LlmUsagePage,
        meta: { requiresAuth: true, title: 'LLM Usage' },
      },
      {
        path: 'app/admin/llm/models',
        name: 'admin-llm-models',
        component: LlmModelsPage,
        meta: { requiresAuth: true, title: 'LLM Models' },
      },
      {
        path: 'app/admin/llm/costs',
        name: 'admin-llm-costs',
        component: LlmCostsPage,
        meta: { requiresAuth: true, title: 'LLM Costs' },
      },
      {
        path: 'app/admin/rag',
        name: 'admin-rag',
        component: RagCollectionsPage,
        meta: { requiresAuth: true, title: 'RAG Collections' },
      },
      {
        path: 'app/admin/rag/:id',
        name: 'admin-rag-detail',
        component: RagCollectionDetailPage,
        meta: { requiresAuth: true, title: 'RAG Collection' },
      },
      {
        path: 'app/admin/agents',
        name: 'admin-agents',
        component: AgentRegistryPage,
        meta: { requiresAuth: true, title: 'Agent Registry' },
      },
      {
        path: 'app/admin/agents/:slug',
        name: 'admin-agent-detail',
        component: AgentDetailPage,
        meta: { requiresAuth: true, title: 'Agent Detail' },
      },
      {
        path: 'app/admin/observability',
        name: 'admin-observability',
        component: ObservabilityDashboardPage,
        meta: { requiresAuth: true, title: 'Observability' },
      },
      {
        path: 'app/admin/observability/events',
        name: 'admin-observability-events',
        component: ObservabilityEventsPage,
        meta: { requiresAuth: true, title: 'Event Log' },
      },
      {
        path: 'app/admin/system',
        name: 'admin-system',
        component: SystemConfigPage,
        meta: { requiresAuth: true, title: 'System Config' },
      },
      {
        path: 'app/admin/system/health',
        name: 'admin-system-health',
        component: SystemHealthPage,
        meta: { requiresAuth: true, title: 'System Health' },
      },
      {
        path: 'app/admin/mcp',
        name: 'admin-mcp',
        component: McpAdminPage,
        meta: { requiresAuth: true, title: 'MCP Servers' },
      },
      {
        path: 'app/admin/database',
        name: 'admin-database',
        component: DatabaseAdminPage,
        meta: { requiresAuth: true, title: 'Database' },
      },
      {
        path: 'app/admin/:pathMatch(.*)*',
        name: 'admin',
        component: AdminModule,
        meta: { requiresAuth: true, title: 'Admin' },
      },
      {
        path: 'app/rag/:pathMatch(.*)*',
        name: 'rag',
        component: RagModule,
        meta: { requiresAuth: true, title: 'RAG' },
      },
      {
        path: 'app/settings/:pathMatch(.*)*',
        name: 'settings',
        component: SettingsModule,
        meta: { requiresAuth: true, title: 'Settings' },
      },
      {
        path: 'access-denied',
        name: 'access-denied',
        component: () => import('@/modules/auth/AccessDeniedPage.vue'),
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/modules/auth/LoginPage.vue'),
    meta: { public: true },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  if (to.matched.length === 0) {
    return '/';
  }

  const isPublic = to.matched.some((record) => record.meta.public);
  if (isPublic) {
    if (to.path === '/login') {
      const rbacStore = useRbacStore();
      if (!rbacStore.isInitialized) {
        await rbacStore.initialize();
      }
      if (rbacStore.isAuthenticated) {
        return '/app/dashboard';
      }
    }
    return true;
  }

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
  if (!requiresAuth) return true;

  const rbacStore = useRbacStore();
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  if (!rbacStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  return true;
});
