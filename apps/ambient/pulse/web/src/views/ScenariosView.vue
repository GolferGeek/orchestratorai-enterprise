<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { useApi } from '../composables/useApi';
import { useRouter } from 'vue-router';

interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  steps: Array<{ id: string; name: string; description: string; action: string }>;
}

const { pulseApi } = useApi();
const router = useRouter();
const scenarios = ref<ScenarioDefinition[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  loading.value = true;
  error.value = null;
  try {
    scenarios.value = await pulseApi.get<ScenarioDefinition[]>('/scenarios');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

function difficultyClass(difficulty: string): string {
  switch (difficulty) {
    case 'beginner': return 'text-green-400';
    case 'intermediate': return 'text-yellow-400';
    case 'advanced': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function viewScenario(id: string) {
  router.push({ name: 'scenario-detail', params: { id } });
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Training Scenarios</h1>
          <p class="text-gray-400 text-sm mt-1">
            Guided walkthroughs for understanding Pulse's ambient automation patterns.
          </p>
        </div>

        <div v-if="loading" class="text-gray-400 text-sm">Loading scenarios...</div>
        <div v-else-if="error" class="card border border-red-500 bg-red-950/20 text-red-400 text-sm">{{ error }}</div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="scenario in scenarios"
            :key="scenario.id"
            class="card hover:border-purple-500 transition-colors cursor-pointer"
            @click="viewScenario(scenario.id)"
          >
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm font-medium text-gray-200">{{ scenario.name }}</h3>
              <span :class="['text-xs font-medium', difficultyClass(scenario.difficulty)]">
                {{ scenario.difficulty }}
              </span>
            </div>
            <p class="text-xs text-gray-400 mb-3">{{ scenario.description }}</p>
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>Category: {{ scenario.category }}</span>
              <span>{{ scenario.steps.length }} steps</span>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
