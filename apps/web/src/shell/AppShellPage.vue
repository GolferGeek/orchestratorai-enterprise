<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  analyticsOutline,
  businessOutline,
  cashOutline,
  chatbubbleEllipsesOutline,
  cogOutline,
  constructOutline,
  hammerOutline,
  gitBranchOutline,
  hardwareChipOutline,
  heartOutline,
  keyOutline,
  layersOutline,
  libraryOutline,
  listOutline,
  peopleOutline,
  radioOutline,
  settingsOutline,
  pulseOutline,
  serverOutline,
  shieldOutline,
  swapHorizontalOutline,
  flaskOutline,
  flashOutline,
  shieldCheckmarkOutline,
  navigateOutline,
  terminalOutline,
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { entitlementsService } from '@/services/entitlementsService';
import { useViewMode } from '@/composables/useViewMode';

const router = useRouter();
const route = useRoute();
const rbacStore = useRbacStore();
const entitlementsStore = useEntitlementsStore();
const { viewMode, setViewMode, isVisibleInCurrentMode, hiddenSlugs } = useViewMode();

const { user, isAuthenticated, currentOrganization, userOrganizations } = storeToRefs(rbacStore);
const { accessibleProducts } = storeToRefs(entitlementsStore);

const iconMap: Record<string, string> = {
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
  'flask-outline': flaskOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'navigate-outline': navigateOutline,
};

const SIDEBAR_ORDER: string[] = ['compose', 'forge'];

const commandNavItems = computed<NavItem[]>(() => {
  if (!isAuthenticated.value) return [];
  return accessibleProducts.value
    .filter((product) => isVisibleInCurrentMode(product.productSlug))
    .sort((a, b) => {
      const ai = SIDEBAR_ORDER.indexOf(a.productSlug);
      const bi = SIDEBAR_ORDER.indexOf(b.productSlug);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    })
    .map((product) => ({
      label: product.productName,
      icon: iconMap[product.icon] ?? settingsOutline,
      path: entitlementsService.getProductUrl(product),
      external: false,
    }));
});

const adminNavItems: NavItem[] = [
  { label: 'Organizations', icon: businessOutline, path: '/app/admin/organizations' },
  { label: 'Users', icon: peopleOutline, path: '/app/admin/users' },
  { label: 'Roles', icon: shieldOutline, path: '/app/admin/roles' },
  { label: 'Entitlements', icon: keyOutline, path: '/app/admin/entitlements' },
  {
    label: 'LLM Analytics',
    icon: analyticsOutline,
    children: [
      { label: 'Usage', icon: analyticsOutline, path: '/app/admin/llm/usage' },
      { label: 'Models', icon: hardwareChipOutline, path: '/app/admin/llm/models' },
      { label: 'Costs', icon: cashOutline, path: '/app/admin/llm/costs' },
    ],
  },
  { label: 'RAG Management', icon: libraryOutline, path: '/app/admin/rag' },
  { label: 'Agent Registry', icon: serverOutline, path: '/app/admin/agents' },
  {
    label: 'Observability',
    icon: pulseOutline,
    children: [
      { label: 'Dashboard', icon: pulseOutline, path: '/app/admin/observability' },
      { label: 'Events', icon: listOutline, path: '/app/admin/observability/events' },
    ],
  },
  {
    label: 'System',
    icon: settingsOutline,
    children: [
      { label: 'Config', icon: cogOutline, path: '/app/admin/system' },
      { label: 'Health', icon: heartOutline, path: '/app/admin/system/health' },
    ],
  },
  {
    label: 'Data & Infrastructure',
    icon: layersOutline,
    children: [
      { label: 'MCP Servers', icon: terminalOutline, path: '/app/admin/mcp' },
      { label: 'Database', icon: serverOutline, path: '/app/admin/database' },
    ],
  },
];

const composeNavItems: NavItem[] = [
  { label: 'Agents', icon: chatbubbleEllipsesOutline, path: '/app/agents' },
  { label: 'Build Pipeline', icon: constructOutline, path: '/app/agents/compose' },
];

const workflowsNavItems: NavItem[] = [
  { label: 'Legal Department', icon: shieldCheckmarkOutline, path: '/app/workflows/legal-department' },
  { label: 'Marketing Swarm', icon: gitBranchOutline, path: '/app/workflows/marketing-swarm' },
  { label: 'Document Onboarding', icon: libraryOutline, path: '/app/workflows/legal-department/document-onboarding' },
  { label: 'Contract Review', icon: shieldOutline, path: '/app/workflows/legal-department/contract-review' },
  { label: 'Legal Research', icon: analyticsOutline, path: '/app/workflows/legal-department/legal-research' },
  { label: 'Due Diligence', icon: layersOutline, path: '/app/workflows/legal-department/due-diligence' },
  { label: 'Adversarial Brief', icon: gitBranchOutline, path: '/app/workflows/legal-department/adversarial-brief' },
  { label: 'Discovery Review', icon: listOutline, path: '/app/workflows/legal-department/discovery-review' },
  { label: 'Compliance Audit', icon: shieldCheckmarkOutline, path: '/app/workflows/legal-department/compliance-audit' },
  { label: 'Portfolio Sentinel', icon: pulseOutline, path: '/app/workflows/legal-department/sentinel' },
  { label: 'Monte Carlo Trial', icon: flaskOutline, path: '/app/workflows/legal-department/monte-carlo' },
  { label: 'Matters', icon: businessOutline, path: '/app/workflows/legal-department/matters' },
  { label: 'Settings', icon: settingsOutline, path: '/app/workflows/legal-department/settings' },
];

const ambientNavItems: NavItem[] = [
  { label: 'Dashboard', icon: pulseOutline, path: '/app/ambient' },
  { label: 'Listeners', icon: radioOutline, path: '/app/ambient/listeners' },
  { label: 'Workflows', icon: gitBranchOutline, path: '/app/ambient/workflows' },
  { label: 'Triggers', icon: flashOutline, path: '/app/ambient/triggers' },
  { label: 'Executions', icon: listOutline, path: '/app/ambient/executions' },
  { label: 'Scenarios', icon: flaskOutline, path: '/app/ambient/scenarios' },
  { label: 'Event Stream', icon: analyticsOutline, path: '/app/ambient/stream' },
];

const secureConversationsNavItems: NavItem[] = [
  { label: 'Overview', icon: swapHorizontalOutline, path: '/app/secure-conversations' },
  { label: 'Registry', icon: serverOutline, path: '/app/secure-conversations/registry' },
  { label: 'Inbound A2A', icon: radioOutline, path: '/app/secure-conversations/inbound' },
  { label: 'Outbound A2A', icon: navigateOutline, path: '/app/secure-conversations/outbound' },
  { label: 'Security', icon: shieldOutline, path: '/app/secure-conversations/security' },
  {
    label: 'Observability',
    icon: analyticsOutline,
    children: [
      { label: 'Message Log', icon: listOutline, path: '/app/secure-conversations/observability' },
      { label: 'Topology', icon: gitBranchOutline, path: '/app/secure-conversations/observability/topology' },
      { label: 'Timeline', icon: pulseOutline, path: '/app/secure-conversations/observability/timeline' },
      { label: 'Metrics', icon: analyticsOutline, path: '/app/secure-conversations/observability/metrics' },
      { label: 'Audit Trail', icon: shieldCheckmarkOutline, path: '/app/secure-conversations/observability/audit' },
    ],
  },
  { label: 'Scenarios', icon: flaskOutline, path: '/app/secure-conversations/scenarios' },
  { label: 'Demo Mode', icon: flashOutline, path: '/app/secure-conversations/demo' },
  {
    label: 'Protocol Tools',
    icon: layersOutline,
    children: [
      { label: 'Matrix', icon: layersOutline, path: '/app/secure-conversations/matrix' },
      { label: 'Compare', icon: swapHorizontalOutline, path: '/app/secure-conversations/protocol-compare' },
    ],
  },
  { label: 'Settings', icon: settingsOutline, path: '/app/secure-conversations/settings' },
];

const activeProductSlug = computed(() => {
  if (route.path.startsWith('/app/admin')) return 'admin';
  if (route.path.startsWith('/app/agents')) return 'compose';
  if (route.path.startsWith('/app/workflows')) return 'forge';
  if (route.path.startsWith('/app/ambient')) return 'pulse';
  if (route.path.startsWith('/app/secure-conversations')) return 'bridge';
  return 'command';
});

const navItems = computed<NavItem[]>(() => {
  if (!isAuthenticated.value) return [];
  if (activeProductSlug.value === 'admin') return adminNavItems;
  if (activeProductSlug.value === 'compose') return composeNavItems;
  if (activeProductSlug.value === 'forge') return workflowsNavItems;
  if (activeProductSlug.value === 'pulse') return ambientNavItems;
  if (activeProductSlug.value === 'bridge') return secureConversationsNavItems;
  return commandNavItems.value;
});

const showViewModeToggle = computed(() => (
  isAuthenticated.value && activeProductSlug.value === 'command'
));

const userName = computed<string | undefined>(() => {
  if (!isAuthenticated.value) return undefined;
  return user.value?.displayName ?? user.value?.email ?? undefined;
});

const orgName = computed<string | undefined>(() => {
  if (!isAuthenticated.value) return undefined;
  const slug = currentOrganization.value;
  if (!slug || slug === '*') return undefined;
  const match = userOrganizations.value.find((o) => o.organizationSlug === slug);
  return match?.organizationName ?? slug;
});

async function handleSignOut(): Promise<void> {
  await rbacStore.logout();
  router.push('/');
}

onMounted(async () => {
  if (isAuthenticated.value) {
    await entitlementsService.loadEntitlements();
  }
});

watch(isAuthenticated, async (authed) => {
  if (authed) {
    await entitlementsService.loadEntitlements();
  }
});
</script>

<template>
  <OaiAppShell
    :product-slug="activeProductSlug"
    :nav-items="navItems"
    :user-name="userName"
    :org-name="orgName"
    :hidden-slugs="hiddenSlugs"
    :use-router-outlet="true"
    admin-api-url="/api"
    landing-url="/"
    @sign-out="handleSignOut"
  >
    <template v-if="showViewModeToggle" #topNavCenter>
      <div class="view-mode-toggle">
        <button
          :class="['view-mode-btn', { active: viewMode === 'standard' }]"
          @click="setViewMode('standard')"
        >
          Standard
        </button>
        <button
          :class="['view-mode-btn', { active: viewMode === 'advanced' }]"
          @click="setViewMode('advanced')"
        >
          Advanced
        </button>
      </div>
    </template>
  </OaiAppShell>
</template>

<style scoped>
.view-mode-toggle {
  display: inline-flex;
  background: var(--oai-bg-surface, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--oai-border, #334155);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.view-mode-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-mode-btn:hover {
  color: var(--oai-text-primary, #e2e8f0);
}

.view-mode-btn.active {
  background: var(--oai-primary, #3b82f6);
  color: #fff;
}
</style>
