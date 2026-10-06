<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { IonPage } from '@ionic/vue';
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  analyticsOutline,
  businessOutline,
  cashOutline,
  cogOutline,
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
import AgentNavTree from '@/modules/agents/components/nav/AgentNavTree.vue';
import WorkflowNavTree from '@/modules/workflows/components/nav/WorkflowNavTree.vue';

const router = useRouter();
const route = useRoute();
// While Ionic animates a navigation out of the shell (sign-out to the landing
// page), this page stays mounted; its nested outlet would render the new
// route's child (the landing page) inside the shell. Render children only for
// routes that belong to the shell.
const inShell = computed(() => route.matched[0]?.name === 'app-shell');
const rbacStore = useRbacStore();
const entitlementsStore = useEntitlementsStore();
const { viewMode, setViewMode, isVisibleInCurrentMode, hiddenSlugs } = useViewMode();

// The Claude pane is an admin tool (its API is admin-only): only super-admins get it.
const { user, isAuthenticated, currentOrganization, userOrganizations, isSuperAdmin } = storeToRefs(rbacStore);
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

const SIDEBAR_ORDER: string[] = ['agents', 'workflows'];

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
  { label: 'RAG Management', icon: libraryOutline, path: '/app/rag/collections' },
  { label: 'Agent Registry', icon: serverOutline, path: '/app/admin/agents' },
  { label: 'Workflows', icon: gitBranchOutline, path: '/app/admin/workflows' },
  { label: 'Settings', icon: settingsOutline, path: '/app/settings/system/health' },
];

const settingsNavItems: NavItem[] = [
  {
    label: 'LLM Analytics',
    icon: analyticsOutline,
    children: [
      { label: 'Usage', icon: analyticsOutline, path: '/app/settings/llm/usage' },
      { label: 'Models', icon: hardwareChipOutline, path: '/app/settings/llm/models' },
      { label: 'Costs', icon: cashOutline, path: '/app/settings/llm/costs' },
    ],
  },
  {
    label: 'System',
    icon: settingsOutline,
    children: [
      { label: 'Config', icon: cogOutline, path: '/app/settings/system' },
      { label: 'Health', icon: heartOutline, path: '/app/settings/system/health' },
    ],
  },
  {
    label: 'Observability',
    icon: pulseOutline,
    children: [
      { label: 'Dashboard', icon: pulseOutline, path: '/app/settings/observability' },
      { label: 'Events', icon: listOutline, path: '/app/settings/observability/events' },
    ],
  },
  {
    label: 'Privacy & PII',
    icon: shieldCheckmarkOutline,
    children: [
      {
        label: 'PII Patterns',
        icon: shieldOutline,
        path: '/app/settings/privacy/patterns',
      },
      {
        label: 'Dictionary',
        icon: libraryOutline,
        path: '/app/settings/privacy/dictionary',
      },
      {
        label: 'Mappings',
        icon: swapHorizontalOutline,
        path: '/app/settings/privacy/mappings',
      },
      {
        label: 'Inspector',
        icon: flaskOutline,
        path: '/app/settings/privacy/testing',
      },
    ],
  },
  {
    label: 'Data & Infrastructure',
    icon: layersOutline,
    children: [
      { label: 'MCP Servers', icon: terminalOutline, path: '/app/settings/mcp' },
      { label: 'Database', icon: serverOutline, path: '/app/settings/database' },
    ],
  },
];

const agentsNavItems: NavItem[] = [];

const workflowsNavItems: NavItem[] = [];

const ambientNavItems: NavItem[] = [
  { label: 'Dashboard', icon: pulseOutline, path: '/app/ambient' },
  { label: 'Listeners', icon: radioOutline, path: '/app/ambient/listeners' },
  { label: 'Workflows', icon: gitBranchOutline, path: '/app/ambient/workflows' },
  { label: 'Triggers', icon: flashOutline, path: '/app/ambient/triggers' },
  { label: 'Executions', icon: listOutline, path: '/app/ambient/executions' },
  { label: 'Scenarios', icon: flaskOutline, path: '/app/ambient/scenarios' },
  { label: 'Event Stream', icon: analyticsOutline, path: '/app/ambient/stream' },
];

const gatehouseNavItems: NavItem[] = [
  { label: 'Overview', icon: swapHorizontalOutline, path: '/app/gatehouse' },
  { label: 'A2A agents', icon: serverOutline, path: '/app/gatehouse/agents' },
  { label: 'Callers', icon: shieldCheckmarkOutline, path: '/app/gatehouse/callers' },
  { label: 'Agent keys', icon: keyOutline, path: '/app/gatehouse/keys' },
  { label: 'Inbound', icon: radioOutline, path: '/app/gatehouse/inbound' },
  { label: 'Outbound', icon: navigateOutline, path: '/app/gatehouse/outbound' },
  { label: 'Events and watches', icon: flashOutline, path: '/app/gatehouse/events' },
];

const activeProductSlug = computed(() => {
  if (route.path.startsWith('/app/admin')) return 'admin';
  if (route.path.startsWith('/app/rag')) return 'rag';
  if (route.path.startsWith('/app/settings')) return 'settings';
  if (route.path.startsWith('/app/agents')) return 'agents';
  if (route.path.startsWith('/app/workflows')) return 'workflows';
  if (route.path.startsWith('/app/ambient')) return 'ambient';
  if (route.path.startsWith('/app/gatehouse')) return 'secure-conversations';
  return 'command';
});

const navItems = computed<NavItem[]>(() => {
  if (!isAuthenticated.value) return [];
  if (activeProductSlug.value === 'admin') return adminNavItems;
  if (activeProductSlug.value === 'rag') return [{ label: 'Collections', icon: libraryOutline, path: '/app/rag/collections' }];
  if (activeProductSlug.value === 'settings') return settingsNavItems;
  if (activeProductSlug.value === 'agents') return agentsNavItems;
  if (activeProductSlug.value === 'workflows') return workflowsNavItems;
  if (activeProductSlug.value === 'ambient') return ambientNavItems;
  if (activeProductSlug.value === 'secure-conversations') return gatehouseNavItems;
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
  <!-- IonPage root registers this view with the root ion-router-outlet.
       OaiAppShell's IonApp fills it, so layout is unchanged. -->
  <IonPage>
  <OaiAppShell
    :product-slug="activeProductSlug"
    :nav-items="navItems"
    :user-name="userName"
    :org-name="orgName"
    :hidden-slugs="hiddenSlugs"
    :use-router-outlet="inShell"
    :show-claude-pane="isSuperAdmin"
    admin-api-url="/api"
    landing-url="/"
    @sign-out="handleSignOut"
  >
    <template v-if="activeProductSlug === 'agents'" #sidebar>
      <AgentNavTree />
    </template>

    <template v-if="activeProductSlug === 'workflows'" #sidebar>
      <WorkflowNavTree />
    </template>

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
  </IonPage>
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
