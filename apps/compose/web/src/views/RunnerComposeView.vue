<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/agents" />
        </ion-buttons>
        <ion-title>Build Custom Pipeline</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="pipeline.length === 0 || isSaving" @click="handleSave">
            {{ isSaving ? 'Saving...' : 'Save Pipeline' }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="compose-container">
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
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonSpinner,
} from '@ionic/vue';
import { useAgentsStore } from '@/stores/agents.store';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { composeApiService, type ComposeRunner } from '@/services/compose-api.service';
import RunnerCard from '@/components/runner-selector/RunnerCard.vue';
import RunnerPipeline from '@/components/runner-selector/RunnerPipeline.vue';

const agentsStore = useAgentsStore();
const executionContextStore = useExecutionContextStore();

const pipeline = ref<ComposeRunner[]>([]);
const isSaving = ref(false);

function isPipelineRunner(runnerId: string): boolean {
  return pipeline.value.some((r) => r.id === runnerId);
}

function handleAddRunner(runner: ComposeRunner): void {
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

function handleReorder(reordered: ComposeRunner[]): void {
  pipeline.value = reordered;
}

async function handleSave(): Promise<void> {
  if (pipeline.value.length === 0) return;

  isSaving.value = true;

  // ExecutionContext comes from store — never created inline
  const ctx = executionContextStore.current;

  await composeApiService.savePipeline(
    {
      name: `Custom Pipeline ${new Date().toLocaleDateString()}`,
      runners: pipeline.value.map((r) => ({ runnerId: r.id })),
    },
    ctx
  );

  isSaving.value = false;
}

async function loadRunners(): Promise<void> {
  agentsStore.setLoading(true);
  agentsStore.clearError();
  const runners = await composeApiService.fetchRunners();
  agentsStore.setRunners(runners);
  agentsStore.setLoading(false);
}

onMounted(() => {
  loadRunners();
});
</script>

<style scoped>
.compose-container {
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

@media (max-width: 640px) {
  .compose-container {
    flex-direction: column;
  }
}
</style>
