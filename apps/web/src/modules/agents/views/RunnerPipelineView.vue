<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/agents" />
        </ion-buttons>
        <ion-title>Build Custom Pipeline</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :disabled="pipeline.length === 0 || isSaving"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : 'Save Pipeline' }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="pipeline-container">
        <!-- Runner selection panel -->
        <div class="runner-panel">
          <h3 class="panel-title">Available Runners</h3>
          <div v-if="agentsStore.isLoading" class="loading-state">
            <ion-spinner name="crescent" />
          </div>
          <div v-else class="runner-list">
            <RunnerCard
              v-for="runner in agentsStore.runners"
              :key="runner.id"
              :runner="runner"
              :in-pipeline="isPipelineRunner(runner.id)"
              @add="handleAddRunner"
              @remove="handleRemoveRunner"
            />
          </div>
        </div>

        <!-- Pipeline visualization -->
        <div class="pipeline-panel">
          <h3 class="panel-title">Your Pipeline</h3>
          <RunnerPipeline
            :runners="pipeline"
            @reorder="handleReorder"
            @remove="handleRemoveFromPipeline"
          />
          <p v-if="saveMessage" class="save-message" role="status">
            {{ saveMessage }}
          </p>
          <p v-if="saveError" class="save-error" role="alert">
            {{ saveError }}
          </p>
          <div v-if="pipeline.length === 0" class="empty-pipeline">
            <p>Add runners from the left panel to build your pipeline.</p>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonSpinner,
} from '@ionic/vue';
import { useAgentsStore } from '@/modules/agents/stores/agents.store';
import { useExecutionContextStore } from '@/modules/agents/stores/executionContextStore';
import {
  agentsApiService,
  type AgentRunner,
} from '@/modules/agents/services/agents-api.service';
import { useLLMStore } from '@/modules/agents/stores/llm.store';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';
import RunnerCard from '@/modules/agents/components/runner-selector/RunnerCard.vue';
import RunnerPipeline from '@/modules/agents/components/runner-selector/RunnerPipeline.vue';

const agentsStore = useAgentsStore();
const executionContextStore = useExecutionContextStore();
const llmStore = useLLMStore();
const rbacStore = useRbacStore();

const pipeline = ref<AgentRunner[]>([]);
const isSaving = ref(false);
const saveMessage = ref('');
const saveError = ref('');

function isPipelineRunner(runnerId: string): boolean {
  return pipeline.value.some((r) => r.id === runnerId);
}

function handleAddRunner(runner: AgentRunner): void {
  if (!isPipelineRunner(runner.id)) {
    pipeline.value = [...pipeline.value, runner];
  }
}

function handleRemoveRunner(runnerId: string): void {
  pipeline.value = pipeline.value.filter((r) => r.id !== runnerId);
}

function handleRemoveFromPipeline(runnerId: string): void {
  handleRemoveRunner(runnerId);
}

function handleReorder(reordered: AgentRunner[]): void {
  pipeline.value = reordered;
}

async function handleSave(): Promise<void> {
  if (pipeline.value.length === 0) return;

  isSaving.value = true;
  saveMessage.value = '';
  saveError.value = '';
  try {
    const saved = await agentsApiService.savePipeline(
      {
        name: `Custom Pipeline ${new Date().toLocaleString()}`,
        runners: pipeline.value.map((r) => ({ runnerId: r.id })),
      },
      executionContextStore.current,
    );
    saveMessage.value = `Saved ${saved.name}`;
  } catch (error) {
    saveError.value =
      error instanceof Error ? error.message : 'Pipeline save failed';
  } finally {
    isSaving.value = false;
  }
}

async function loadRunners(): Promise<void> {
  agentsStore.setLoading(true);
  agentsStore.clearError();
  try {
    await rbacStore.initialize();
    if (!rbacStore.user) {
      throw new Error(
        'An authenticated organization is required to save pipelines',
      );
    }
    const orgSlug = await resolveConcreteOrganization(rbacStore);
    await llmStore.loadForAgentType('context');
    if (!llmStore.selectedProvider || !llmStore.selectedModel) {
      throw new Error('A provider and model are required to save pipelines');
    }
    executionContextStore.initialize({
      orgSlug,
      userId: rbacStore.user.id,
      conversationId: crypto.randomUUID(),
      agentSlug: 'pipeline-builder',
      agentType: 'pipeline',
      provider: llmStore.selectedProvider,
      model: llmStore.selectedModel,
    });
    const runners = await agentsApiService.fetchRunners();
    agentsStore.setRunners(runners);
  } catch (err) {
    agentsStore.setError(
      err instanceof Error ? err.message : 'Failed to load runners',
    );
  } finally {
    agentsStore.setLoading(false);
  }
}

onMounted(() => {
  loadRunners();
});
</script>

<style scoped>
.pipeline-container {
  display: flex;
  gap: 24px;
  padding: 16px;
  height: 100%;
}

.runner-panel,
.pipeline-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color);
  margin: 0 0 8px;
}

.runner-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.empty-pipeline {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--ion-color-step-300);
  border-radius: 8px;
  padding: 32px;
  color: var(--ion-color-medium);
  text-align: center;
  flex: 1;
}

.save-message {
  color: var(--ion-color-success);
}

.save-error {
  color: var(--ion-color-danger);
}

@media (max-width: 640px) {
  .pipeline-container {
    flex-direction: column;
  }
}
</style>
