<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { useRoute, useRouter } from 'vue-router';
import { useApi } from '../composables/useApi';

interface ScenarioStep {
  id: string;
  name: string;
  description: string;
  action: string;
  expected?: string;
}

interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  steps: ScenarioStep[];
  trainingNotes?: string;
  outcomeVerification?: string;
}

const route = useRoute();
const router = useRouter();
const { pulseApi } = useApi();

const scenario = ref<ScenarioDefinition | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const currentStep = ref(0);
const completedSteps = ref<Set<string>>(new Set());

onMounted(async () => {
  loading.value = true;
  error.value = null;
  try {
    scenario.value = await pulseApi.get<ScenarioDefinition>(`/scenarios/${route.params.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

function markComplete(stepId: string) {
  completedSteps.value.add(stepId);
  if (scenario.value && currentStep.value < scenario.value.steps.length - 1) {
    currentStep.value++;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'observe': return 'text-blue-400';
    case 'trigger': return 'text-yellow-400';
    case 'verify': return 'text-green-400';
    default: return 'text-gray-400';
  }
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <button class="text-gray-400 hover:text-white text-sm transition-colors" @click="router.back()">
          &larr; Back to Scenarios
        </button>

        <div v-if="loading" class="text-gray-400 text-sm">Loading scenario...</div>
        <div v-else-if="error" class="card border border-red-500 text-red-400 text-sm">{{ error }}</div>
        <div v-else-if="scenario">
          <div class="mb-6">
            <h1 class="text-2xl font-bold text-white">{{ scenario.name }}</h1>
            <p class="text-gray-400 text-sm mt-2">{{ scenario.description }}</p>
          </div>

          <!-- Training notes -->
          <div v-if="scenario.trainingNotes" class="card bg-purple-950/30 border-purple-700 mb-6">
            <h3 class="text-sm font-semibold text-purple-300 mb-2">Training Notes</h3>
            <p class="text-sm text-gray-300">{{ scenario.trainingNotes }}</p>
          </div>

          <!-- Steps -->
          <div class="space-y-4">
            <div
              v-for="(step, idx) in scenario.steps"
              :key="step.id"
              :class="[
                'card transition-all',
                idx === currentStep ? 'border-purple-500' : completedSteps.has(step.id) ? 'border-green-700 opacity-60' : 'opacity-40',
              ]"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-xs font-mono text-gray-500">Step {{ idx + 1 }}</span>
                    <span :class="['text-xs font-medium', actionColor(step.action)]">{{ step.action }}</span>
                    <h3 class="text-sm font-medium text-gray-200">{{ step.name }}</h3>
                  </div>
                  <p class="text-xs text-gray-400">{{ step.description }}</p>
                  <div v-if="step.expected" class="mt-2 text-xs text-gray-500">
                    Expected: <span class="text-gray-300">{{ step.expected }}</span>
                  </div>
                </div>
                <button
                  v-if="idx === currentStep && !completedSteps.has(step.id)"
                  class="btn-primary text-xs ml-4"
                  @click="markComplete(step.id)"
                >
                  Done
                </button>
                <span v-else-if="completedSteps.has(step.id)" class="text-green-400 text-xs ml-4">
                  Completed
                </span>
              </div>
            </div>
          </div>

          <!-- Outcome verification -->
          <div v-if="scenario.outcomeVerification && completedSteps.size === scenario.steps.length" class="card bg-green-950/30 border-green-700 mt-6">
            <h3 class="text-sm font-semibold text-green-300 mb-2">Outcome Verification</h3>
            <p class="text-sm text-gray-300">{{ scenario.outcomeVerification }}</p>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
