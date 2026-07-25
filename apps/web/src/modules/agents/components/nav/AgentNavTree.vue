<template>
  <div class="agent-nav-tree">
    <!-- Org Selector -->
    <div class="org-selector-wrapper">
      <select
        :value="selectedOrg"
        class="org-select"
        @change="onOrgChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="isSuperAdmin" value="*">All Organizations</option>
        <option
          v-for="org in userOrgs"
          :key="org.organizationSlug"
          :value="org.organizationSlug"
        >
          {{ org.organizationName }}
        </option>
      </select>
    </div>

    <!-- Search -->
    <div class="search-wrapper">
      <ion-searchbar
        v-model="searchQuery"
        placeholder="Search agents..."
        show-clear-button="focus"
        :debounce="200"
      />
    </div>

    <!-- Loading -->
    <div v-if="navStore.loading" class="status-container">
      <ion-spinner name="crescent" />
      <p>Loading...</p>
    </div>

    <!-- Error -->
    <div v-else-if="navStore.error" class="status-container error">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ navStore.error }}</p>
      <ion-button fill="outline" size="small" @click="reload">Retry</ion-button>
    </div>

    <!-- Tree -->
    <ion-list v-else lines="none" class="nav-list">
      <template v-for="group in filteredGroups" :key="group.key">
        <div class="category-header">
          <ion-icon :icon="group.icon" class="category-icon" />
          <span class="category-label">{{ group.label }}</span>
        </div>

        <template v-for="agent in group.agents" :key="agent.slug">
          <ion-item
            button
            :detail="false"
            class="agent-item"
            :class="{ 'agent-item--active': isActiveAgent(agent.slug) }"
            @click="toggleAgent(agent.slug)"
          >
            <ion-icon
              :icon="agentTypeIcon(agent.agentType)"
              slot="start"
              class="agent-icon"
            />
            <ion-label class="agent-label">{{ agent.name }}</ion-label>

            <ion-badge
              v-if="conversationCount(agent.slug) > 0"
              color="medium"
              slot="end"
              class="conv-badge"
            >
              {{ conversationCount(agent.slug) }}
            </ion-badge>

            <ion-icon
              v-if="conversationCount(agent.slug) > 0"
              :icon="expandedAgents.has(agent.slug) ? chevronDownOutline : chevronForwardOutline"
              slot="end"
              class="chevron-icon"
            />

            <ion-button
              fill="clear"
              size="small"
              slot="end"
              class="new-chat-btn"
              title="New chat"
              @click.stop="startNewChat(agent.slug)"
            >
              <ion-icon :icon="addOutline" />
            </ion-button>
          </ion-item>

          <template v-if="expandedAgents.has(agent.slug)">
            <ion-item
              v-for="conv in navStore.conversationsForAgent(agent.slug)"
              :key="conv.id"
              button
              :detail="false"
              class="conv-item"
              :class="{ 'conv-item--active': isActiveConversation(conv.id) }"
              @click="openConversation(agent.slug, conv.id)"
            >
              <ion-icon
                :icon="conv.primaryWorkProductType ? documentTextOutline : chatbubbleOutline"
                slot="start"
                class="conv-icon"
              />
              <ion-label>
                <p class="conv-title">{{ conversationLabel(conv) }}</p>
                <p class="conv-time">{{ formatRelativeTime(conv.lastActiveAt ?? conv.startedAt) }}</p>
              </ion-label>
            </ion-item>
          </template>
        </template>
      </template>

      <div v-if="filteredGroups.length === 0" class="empty-state">
        <p>No agents found</p>
      </div>
    </ion-list>

    <!-- Build Pipeline — admin-style utility pinned to bottom -->
    <div class="sidebar-footer">
      <ion-item
        button
        :detail="false"
        class="footer-item"
        :class="{ 'footer-item--active': isPipelineActive }"
        :router-link="'/app/agents/pipeline'"
        router-direction="root"
        lines="none"
      >
        <ion-icon slot="start" :icon="constructOutline" class="footer-icon" />
        <ion-label>Build Pipeline</ion-label>
      </ion-item>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonButton,
  IonSpinner,
} from '@ionic/vue';
import {
  alertCircleOutline,
  chatbubbleOutline,
  documentTextOutline,
  imageOutline,
  libraryOutline,
  globeOutline,
  addOutline,
  chevronDownOutline,
  chevronForwardOutline,
  constructOutline,
} from 'ionicons/icons';
import { useAgentsStore } from '@/modules/agents/stores/agents.store';
import { useConversationsNavStore } from '@/modules/agents/stores/conversations-nav.store';
import { useRbacStore } from '@/stores/rbacStore';
import {
  agentsApiService,
  type ConversationNavItem,
} from '@/modules/agents/services/agents-api.service';

const router = useRouter();
const route = useRoute();
const agentsStore = useAgentsStore();
const navStore = useConversationsNavStore();
const rbacStore = useRbacStore();

const searchQuery = ref('');
const expandedAgents = ref<Set<string>>(new Set());

const userOrgs = computed(() => rbacStore.userOrganizations.filter((o) => !o.isGlobal));
const isSuperAdmin = computed(() =>
  rbacStore.userOrganizations.some((o) => o.isGlobal || o.organizationSlug === '*'),
);
const selectedOrg = computed(() => rbacStore.currentOrganization ?? '*');
const isPipelineActive = computed(() => route.path.startsWith('/app/agents/pipeline'));

interface AgentRow {
  slug: string;
  name: string;
  agentType: string;
  organizationSlug: string;
}

interface CategoryGroup {
  key: string;
  label: string;
  icon: string;
  agents: AgentRow[];
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  context: 'General',
  rag: 'Knowledge',
  media: 'Media',
  api: 'API',
  external: 'External',
};

const AGENT_TYPE_ORDER = ['context', 'rag', 'media', 'api', 'external'];

function categoryLabel(agentType: string): string {
  return AGENT_TYPE_LABELS[agentType] ?? agentType.charAt(0).toUpperCase() + agentType.slice(1);
}

const categoryGroups = computed((): CategoryGroup[] => {
  const map = new Map<string, CategoryGroup>();

  for (const agent of agentsStore.agents) {
    const type = agent.agentType || 'context';
    if (!map.has(type)) {
      map.set(type, {
        key: type,
        label: categoryLabel(type),
        icon: agentTypeIcon(type),
        agents: [],
      });
    }
    map.get(type)!.agents.push({
      slug: agent.slug,
      name: agent.name,
      agentType: type,
      organizationSlug: agent.organizationSlug ?? 'global',
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const ai = AGENT_TYPE_ORDER.indexOf(a.key);
    const bi = AGENT_TYPE_ORDER.indexOf(b.key);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.label.localeCompare(b.label);
  });
});

const filteredGroups = computed((): CategoryGroup[] => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return categoryGroups.value;

  return categoryGroups.value
    .map((group) => ({
      ...group,
      agents: group.agents.filter((a) => a.name.toLowerCase().includes(q)),
    }))
    .filter((group) => group.agents.length > 0);
});

function agentTypeIcon(agentType: string): string {
  switch (agentType) {
    case 'media':
      return imageOutline;
    case 'rag':
      return libraryOutline;
    case 'api':
    case 'external':
      return globeOutline;
    default:
      return chatbubbleOutline;
  }
}

function conversationCount(agentSlug: string): number {
  return navStore.conversationsForAgent(agentSlug).length;
}

function isActiveAgent(agentSlug: string): boolean {
  return route.params.agentSlug === agentSlug;
}

function isActiveConversation(conversationId: string): boolean {
  return route.query.id === conversationId;
}

function conversationLabel(conv: ConversationNavItem): string {
  if (conv.previewTitle) return conv.previewTitle;
  if (conv.primaryWorkProductType) return 'Deliverable ready';
  if (conv.messageCount && conv.messageCount > 0) {
    return `${conv.messageCount} message${conv.messageCount === 1 ? '' : 's'}`;
  }
  return 'New conversation';
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const ts = new Date(isoString).getTime();
  const diffMs = now - ts;

  if (Number.isNaN(ts)) return '';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(isoString).toLocaleDateString();
}

function toggleAgent(agentSlug: string): void {
  if (conversationCount(agentSlug) === 0) {
    startNewChat(agentSlug);
    return;
  }
  if (expandedAgents.value.has(agentSlug)) {
    expandedAgents.value.delete(agentSlug);
  } else {
    expandedAgents.value.add(agentSlug);
  }
  expandedAgents.value = new Set(expandedAgents.value);
}

function startNewChat(agentSlug: string): void {
  router.push({ name: 'AgentConversation', params: { agentSlug } });
}

function openConversation(agentSlug: string, conversationId: string): void {
  router.push({
    name: 'AgentConversation',
    params: { agentSlug },
    query: { id: conversationId },
  });
}

async function reload(): Promise<void> {
  await Promise.all([loadAgents(), navStore.fetchConversations()]);
}

async function loadAgents(): Promise<void> {
  const orgSlug = rbacStore.currentOrganization;
  const agents = await agentsApiService.fetchAgents(orgSlug === '*' ? undefined : (orgSlug ?? undefined));
  agentsStore.setAgents(agents);
  agentsStore.setLastLoadedOrgSlug(orgSlug ?? null);
}

async function onOrgChange(orgSlug: string): Promise<void> {
  await rbacStore.setOrganization(orgSlug);
  await reload();
}

function syncExpandedFromRoute(): void {
  const slug = route.params.agentSlug as string | undefined;
  if (slug && conversationCount(slug) > 0) {
    expandedAgents.value = new Set([...expandedAgents.value, slug]);
  }
}

watch(
  () => route.params.agentSlug,
  () => syncExpandedFromRoute(),
);

watch(
  () => rbacStore.currentOrganization,
  async (org, prev) => {
    if (prev && org !== prev) {
      await reload();
    }
  },
);

onMounted(async () => {
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }
  if (
    rbacStore.currentOrganization === '*' &&
    !rbacStore.isSuperAdmin &&
    rbacStore.userOrganizations.length > 0
  ) {
    await rbacStore.setOrganization(rbacStore.userOrganizations[0].organizationSlug);
  }
  await reload();
  syncExpandedFromRoute();
});
</script>

<style scoped>
.agent-nav-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--oai-sidebar-bg, #1e293b);
}

.org-selector-wrapper {
  padding: 12px 12px 0;
  flex-shrink: 0;
}

.org-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--oai-sidebar-divider, #334155);
  border-radius: 8px;
  background: var(--oai-bg-surface, rgba(255, 255, 255, 0.04));
  color: var(--oai-text-primary, #e2e8f0);
  font-size: 0.85rem;
  font-weight: 600;
  appearance: auto;
  cursor: pointer;
}

.org-select:focus {
  outline: 2px solid var(--oai-primary, #3b82f6);
  outline-offset: 1px;
  border-color: var(--oai-primary, #3b82f6);
}

.search-wrapper {
  padding: 8px 8px 0;
  flex-shrink: 0;
}

.search-wrapper :deep(ion-searchbar) {
  --background: var(--oai-bg-surface, rgba(255, 255, 255, 0.04));
  --color: var(--oai-text-primary, #e2e8f0);
  --placeholder-color: var(--oai-text-muted, #94a3b8);
  --icon-color: var(--oai-text-muted, #94a3b8);
  --border-radius: 8px;
  padding: 0;
}

.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 8px;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 0.875rem;
}

.status-container.error {
  color: var(--ion-color-danger);
}

.nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
  background: transparent;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--oai-sidebar-section-label, #475569);
  user-select: none;
}

.category-icon {
  font-size: 0.85rem;
}

.category-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item {
  --background: transparent;
  --background-hover: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  --background-activated: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color, #94a3b8);
  --padding-start: 12px;
  --padding-end: 4px;
  --min-height: 40px;
  --border-radius: 6px;
  margin: 1px 6px;
  border-radius: 6px;
}

.agent-item--active {
  --background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color-active, #3b82f6);
}

.agent-icon {
  font-size: 1rem;
  color: var(--oai-sidebar-icon-color, #64748b);
  margin-inline-end: 8px;
}

.agent-item--active .agent-icon {
  color: var(--oai-sidebar-icon-color-active, #3b82f6);
}

.agent-label {
  font-size: 0.875rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-badge {
  font-size: 0.65rem;
  margin-inline-end: 2px;
}

.chevron-icon {
  font-size: 0.75rem;
  color: var(--oai-text-muted, #94a3b8);
}

.new-chat-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  --color: var(--oai-text-muted, #94a3b8);
  margin: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.agent-item:hover .new-chat-btn {
  opacity: 1;
}

.conv-item {
  --background: transparent;
  --background-hover: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  --background-activated: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color, #94a3b8);
  --padding-start: 28px;
  --padding-end: 12px;
  --min-height: 36px;
  --border-radius: 6px;
  margin: 1px 6px;
  border-radius: 6px;
}

.conv-item--active {
  --background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color-active, #3b82f6);
}

.conv-icon {
  font-size: 0.75rem;
  color: var(--oai-sidebar-icon-color, #64748b);
  margin-inline-end: 8px;
}

.conv-title {
  font-size: 0.8rem;
  color: var(--oai-text-primary, #e2e8f0);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 0.7rem;
  color: var(--oai-text-muted, #94a3b8);
  margin: 2px 0 0;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 0.875rem;
}

.sidebar-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--oai-sidebar-divider, #334155);
  padding: 8px 6px;
  margin-top: auto;
}

.footer-item {
  --background: transparent;
  --background-hover: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  --color: var(--oai-text-muted, #94a3b8);
  --padding-start: 12px;
  --min-height: 40px;
  --border-radius: 6px;
  border-radius: 6px;
}

.footer-item--active {
  --background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color-active, #3b82f6);
}

.footer-icon {
  font-size: 1rem;
  color: var(--oai-sidebar-icon-color, #64748b);
}
</style>
