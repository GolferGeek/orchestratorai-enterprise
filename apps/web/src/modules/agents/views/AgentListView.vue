<template>
  <ion-page>
    <ion-content class="agents-welcome">
      <div class="welcome-inner">
        <ion-icon :icon="chatbubblesOutline" class="welcome-icon" />
        <h1 class="welcome-title">Agents</h1>
        <p class="welcome-text">
          Choose an agent from the sidebar to start a conversation or reopen a previous one.
        </p>
        <p v-if="agentsStore.isLoading" class="welcome-hint">Loading agents...</p>
        <p v-else-if="agentsStore.error" class="welcome-error">{{ agentsStore.error }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import { IonPage, IonContent, IonIcon } from '@ionic/vue';
import { chatbubblesOutline } from 'ionicons/icons';
import { useAgentsStore } from '@/modules/agents/stores/agents.store';
import { agentsApiService } from '@/modules/agents/services/agents-api.service';
import { useRbacStore } from '@/stores/rbacStore';

const agentsStore = useAgentsStore();
const rbacStore = useRbacStore();

async function loadAgents(): Promise<void> {
  if (agentsStore.hasAgents) return;

  agentsStore.setLoading(true);
  agentsStore.clearError();
  try {
    await rbacStore.initialize();
    const orgSlug = rbacStore.currentOrganization;
    const agents = await agentsApiService.fetchAgents(orgSlug ?? undefined);
    agentsStore.setAgents(agents);
    agentsStore.setLastLoadedOrgSlug(orgSlug ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load agents';
    agentsStore.setError(message);
  } finally {
    agentsStore.setLoading(false);
  }
}

onMounted(() => {
  loadAgents();
});
</script>

<style scoped>
.agents-welcome {
  --background: var(--oai-bg-page, #0f172a);
}

.welcome-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 48px 32px;
  text-align: center;
}

.welcome-icon {
  font-size: 3rem;
  color: var(--oai-primary, #3b82f6);
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--oai-text-primary, #e2e8f0);
  margin: 0 0 12px;
}

.welcome-text {
  font-size: 0.95rem;
  color: var(--oai-text-muted, #94a3b8);
  max-width: 420px;
  line-height: 1.5;
  margin: 0;
}

.welcome-hint {
  margin-top: 16px;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 0.875rem;
}

.welcome-error {
  margin-top: 16px;
  color: var(--ion-color-danger);
  font-size: 0.875rem;
}
</style>
