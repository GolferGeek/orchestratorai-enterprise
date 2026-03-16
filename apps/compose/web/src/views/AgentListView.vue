<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Compose Agents</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="agent-list-container">
        <div v-if="agentsStore.isLoading" class="loading-state">
          <ion-spinner name="crescent" />
          <p>Loading agents...</p>
        </div>

        <div v-else-if="agentsStore.error" class="error-state">
          <p class="error-message">{{ agentsStore.error }}</p>
        </div>

        <div v-else-if="!agentsStore.hasAgents" class="empty-state">
          <p>No agents available.</p>
        </div>

        <template v-else>
          <div
            v-for="group in agentsByOrg"
            :key="group.org"
            class="org-group"
          >
            <h2 class="org-heading">{{ formatOrgName(group.org) }}</h2>
            <div class="agents-grid">
              <AgentCard
                v-for="agent in group.agents"
                :key="agent.id"
                :agent="agent"
                @select="handleAgentSelected"
              />
            </div>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner } from '@ionic/vue';
import { useAgentsStore } from '@/stores/agents.store';
import { composeApiService, type ComposeAgent } from '@/services/compose-api.service';
import { useRbacStore } from '@/stores/rbacStore';
import AgentCard from '@/components/agent-list/AgentCard.vue';

const router = useRouter();
const agentsStore = useAgentsStore();
const rbacStore = useRbacStore();

/** Group agents by organization, sorted alphabetically */
const agentsByOrg = computed(() => {
  const groups = new Map<string, ComposeAgent[]>();

  for (const agent of agentsStore.agents) {
    const org = agent.organizationSlug || 'general';
    if (!groups.has(org)) groups.set(org, []);
    groups.get(org)!.push(agent);
  }

  // Sort groups: 'general'/'global' last, rest alphabetically
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === 'global' || a === 'general') return 1;
      if (b === 'global' || b === 'general') return -1;
      return a.localeCompare(b);
    })
    .map(([org, agents]) => ({ org, agents }));
});

/** Format org slug into a readable heading */
function formatOrgName(slug: string): string {
  if (slug === 'global' || slug === 'general') return 'General';
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function loadAgents(): Promise<void> {
  agentsStore.setLoading(true);
  agentsStore.clearError();
  try {
    // currentOrganization is a string slug, not an object
    const orgSlug = rbacStore.currentOrganization;
    const agents = await composeApiService.fetchAgents(orgSlug ?? undefined);
    agentsStore.setAgents(agents);
    agentsStore.setLastLoadedOrgSlug(orgSlug ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load agents';
    console.error('[AgentListView] loadAgents failed:', message);
    agentsStore.setError(message);
  } finally {
    agentsStore.setLoading(false);
  }
}

async function handleAgentSelected(agent: ComposeAgent): Promise<void> {
  await router.push({
    name: 'AgentConversation',
    params: { agentSlug: agent.slug },
  });
}

onMounted(() => {
  loadAgents();
});
</script>

<style scoped>
.agent-list-container {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}

.org-group {
  margin-bottom: 28px;
}

.org-heading {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--oai-text-secondary, var(--ion-color-medium));
  margin: 0 0 12px 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--oai-border, var(--ion-color-step-200));
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
  color: var(--ion-color-medium);
}

.error-message {
  color: var(--ion-color-danger);
}
</style>
