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
      <template v-for="org in filteredOrgs" :key="org.slug">
        <!-- Org header -->
        <div class="org-header">
          <ion-icon :icon="businessOutline" class="org-icon" />
          <span class="org-label">{{ formatOrgName(org.slug) }}</span>
        </div>

        <!-- Agents in this org -->
        <template v-for="agent in org.agents" :key="agent.slug">
          <!-- Agent row -->
          <ion-item
            button
            detail="false"
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

            <!-- Conversation count badge -->
            <ion-badge
              v-if="conversationCount(agent.slug) > 0"
              color="medium"
              slot="end"
              class="conv-badge"
            >
              {{ conversationCount(agent.slug) }}
            </ion-badge>

            <!-- Chevron toggle -->
            <ion-icon
              v-if="conversationCount(agent.slug) > 0"
              :icon="expandedAgents.has(agent.slug) ? chevronDownOutline : chevronForwardOutline"
              slot="end"
              class="chevron-icon"
            />

            <!-- New chat button -->
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

          <!-- Conversations under this agent (expanded) -->
          <template v-if="expandedAgents.has(agent.slug)">
            <ion-item
              v-for="conv in navStore.conversationsForAgent(agent.slug)"
              :key="conv.id"
              button
              detail="false"
              class="conv-item"
              :class="{ 'conv-item--active': isActiveConversation(conv.id) }"
              @click="openConversation(agent.slug, conv.id)"
            >
              <ion-icon :icon="chatbubbleOutline" slot="start" class="conv-icon" />
              <ion-label>
                <p class="conv-time">{{ formatRelativeTime(conv.lastActiveAt) }}</p>
              </ion-label>
              <ion-button
                fill="clear"
                size="small"
                slot="end"
                class="delete-conv-btn"
                title="Delete conversation"
                @click.stop="handleDeleteConversation(agent.slug, conv.id)"
              >
                <ion-icon :icon="trashOutline" />
              </ion-button>
            </ion-item>
          </template>
        </template>
      </template>

      <!-- Empty state -->
      <div v-if="filteredOrgs.length === 0" class="empty-state">
        <p>No agents found</p>
      </div>
    </ion-list>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
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
  businessOutline,
  chatbubbleOutline,
  imageOutline,
  libraryOutline,
  globeOutline,
  addOutline,
  chevronDownOutline,
  chevronForwardOutline,
  trashOutline,
} from 'ionicons/icons';
import { useAgentsStore } from '@/stores/agents.store';
import { useConversationsNavStore } from '@/stores/conversations-nav.store';
import { useRbacStore } from '@/stores/rbacStore';
import { composeApiService } from '@/services/compose-api.service';

const router = useRouter();
const route = useRoute();
const agentsStore = useAgentsStore();
const navStore = useConversationsNavStore();
const rbacStore = useRbacStore();

const searchQuery = ref('');
const expandedAgents = ref<Set<string>>(new Set());

// Org selector
const userOrgs = computed(() => rbacStore.userOrganizations.filter(o => !o.isGlobal));
const isSuperAdmin = computed(() =>
  rbacStore.userOrganizations.some(o => o.isGlobal || o.organizationSlug === '*'),
);
const selectedOrg = computed(() => rbacStore.currentOrganization ?? '*');

async function onOrgChange(orgSlug: string): Promise<void> {
  await rbacStore.setOrganization(orgSlug);
  // Reload agents for the new org
  const agents = await composeApiService.fetchAgents(orgSlug === '*' ? undefined : orgSlug);
  agentsStore.setAgents(agents);
}

// ============================================================================
// Computed — group agents by org, filter by search
// ============================================================================

interface OrgGroup {
  slug: string;
  agents: Array<{ slug: string; name: string; agentType: string }>;
}

const orgGroups = computed((): OrgGroup[] => {
  const map = new Map<string, OrgGroup>();

  for (const agent of agentsStore.agents) {
    const orgSlug = agent.organizationSlug ?? 'global';
    if (!map.has(orgSlug)) {
      map.set(orgSlug, { slug: orgSlug, agents: [] });
    }
    map.get(orgSlug)!.agents.push({
      slug: agent.slug,
      name: agent.name,
      agentType: agent.agentType,
    });
  }

  // Sort orgs: global first, then alphabetical
  return Array.from(map.values()).sort((a, b) => {
    if (a.slug === 'global') return -1;
    if (b.slug === 'global') return 1;
    return a.slug.localeCompare(b.slug);
  });
});

const filteredOrgs = computed((): OrgGroup[] => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return orgGroups.value;

  return orgGroups.value
    .map((org) => ({
      ...org,
      agents: org.agents.filter((a) => a.name.toLowerCase().includes(q)),
    }))
    .filter((org) => org.agents.length > 0);
});

// ============================================================================
// Helpers
// ============================================================================

function formatOrgName(slug: string): string {
  if (slug === 'global') return 'Global';
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

/**
 * Format ISO timestamp to relative time string.
 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const ts = new Date(isoString).getTime();
  const diffMs = now - ts;

  if (isNaN(ts)) return '';

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

// ============================================================================
// Actions
// ============================================================================

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
  // Trigger Vue reactivity on Set mutation
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

async function handleDeleteConversation(agentSlug: string, conversationId: string): Promise<void> {
  try {
    await composeApiService.deleteConversation(conversationId);
    navStore.removeConversation(conversationId);

    // If the deleted conversation is currently open, navigate to the agent's fresh chat
    if (isActiveConversation(conversationId)) {
      router.push({ name: 'AgentConversation', params: { agentSlug } });
    }
  } catch (err) {
    console.error(
      '[AgentNavTree] Failed to delete conversation:',
      err instanceof Error ? err.message : err,
    );
  }
}

async function reload(): Promise<void> {
  await navStore.fetchConversations();
}

// ============================================================================
// Mount
// ============================================================================

onMounted(async () => {
  // Ensure RBAC is ready
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  // Load agents for current org (or all if super-admin with '*')
  const orgSlug = rbacStore.currentOrganization;
  const agents = await composeApiService.fetchAgents(
    orgSlug === '*' ? undefined : (orgSlug ?? undefined),
  );
  agentsStore.setAgents(agents);

  // Load conversations (user identified from JWT token)
  await navStore.fetchConversations();
});
</script>

<style scoped>
.agent-nav-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.org-selector-wrapper {
  padding: 12px 12px 0;
  flex-shrink: 0;
}

.org-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  background: var(--ion-background-color, #fff);
  color: var(--ion-text-color);
  font-size: 0.85rem;
  font-weight: 600;
  appearance: auto;
  cursor: pointer;
}

.org-select:focus {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 1px;
  border-color: var(--ion-color-primary);
}

.search-wrapper {
  padding: 8px 8px 0;
  flex-shrink: 0;
}

.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 8px;
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}

.status-container.error {
  color: var(--ion-color-danger);
}

.nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.org-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin: 8px 8px 2px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ion-color-primary);
  background: linear-gradient(135deg, rgba(var(--ion-color-primary-rgb), 0.1), rgba(var(--ion-color-primary-rgb), 0.04));
  border-left: 3px solid var(--ion-color-primary);
  border-radius: 0 6px 6px 0;
  user-select: none;
}

.org-icon {
  font-size: 1rem;
  color: var(--ion-color-primary);
}

.org-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item {
  --padding-start: 12px;
  --padding-end: 4px;
  --min-height: 40px;
  --border-radius: 6px;
  margin: 1px 6px;
  border-radius: 6px;
}

.agent-item--active {
  --background: var(--ion-color-primary-tint);
  --color: var(--ion-color-primary);
}

.agent-icon {
  font-size: 1rem;
  color: var(--ion-color-medium);
  margin-inline-end: 8px;
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
  color: var(--ion-color-medium);
  transition: transform 0.15s ease;
}

.new-chat-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  margin: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.agent-item:hover .new-chat-btn {
  opacity: 1;
}

.conv-item {
  --padding-start: 32px;
  --padding-end: 12px;
  --min-height: 32px;
  --border-radius: 6px;
  margin: 1px 6px;
  border-radius: 6px;
}

.conv-item--active {
  --background: var(--ion-color-primary-tint);
}

.conv-icon {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  margin-inline-end: 8px;
}

.conv-time {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 0;
}

.delete-conv-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  margin: 0;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--ion-color-danger);
}

.conv-item:hover .delete-conv-btn {
  opacity: 1;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}
</style>
