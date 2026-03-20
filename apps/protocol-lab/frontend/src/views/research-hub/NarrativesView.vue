<script setup lang="ts">
import { computed, ref } from 'vue';
import { useResearchHubStore } from '../../stores/research-hub.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const store = useResearchHubStore();

const personalities = ['analyst', 'optimist', 'skeptic', 'pragmatist'];
const selectedPersonality = ref('');

async function loadNarrative(personality: string) {
  selectedPersonality.value = personality;
  await store.fetchNarrative(personality);
}

async function retry() {
  if (selectedPersonality.value) {
    await store.fetchNarrative(selectedPersonality.value);
  }
}

const isEmpty = computed(
  () => !store.loading && !store.error && store.narratives.length === 0,
);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Personality Narratives</h1>
      <p class="text-gray-400 text-sm mt-1">AI-generated research narratives from different personality perspectives</p>
    </div>

    <div class="flex gap-3">
      <button
        v-for="p in personalities"
        :key="p"
        :class="[
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
          selectedPersonality === p
            ? 'bg-protocol-primary text-white'
            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700',
        ]"
        @click="loadNarrative(p)"
      >
        {{ p }}
      </button>
    </div>

    <LoadingSpinner v-if="store.loading" label="Generating narrative..." class="py-16" />

    <div v-else-if="store.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ store.error }}</p>
        <button
          class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          @click="retry"
        >
          Retry
        </button>
      </div>
    </div>

    <EmptyState
      v-else-if="isEmpty"
      title="No Narratives"
      message="No narratives generated yet. Select a personality above to generate one."
    />

    <div v-else class="space-y-4">
      <div
        v-for="narrative in store.narratives"
        :key="narrative.personality"
        class="card"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold text-white capitalize">{{ narrative.personality }}: {{ narrative.title }}</h3>
          <span class="text-xs text-gray-400">{{ new Date(narrative.generatedAt).toLocaleString() }}</span>
        </div>
        <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{{ narrative.content }}</p>
      </div>
    </div>
  </div>
</template>
