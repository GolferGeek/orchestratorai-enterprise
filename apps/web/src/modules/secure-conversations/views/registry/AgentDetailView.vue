<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useApi } from '../../composables/useApi';
import { parseExternalAgent } from '../../services/response-validation';
import type { ExternalAgent } from '../../types';

const route = useRoute();
const agentId = route.params.id as string;
const { secureConversationsApi } = useApi();

const agent = ref<ExternalAgent | null>(null);
const loading = ref(true);
const error = ref('');

async function loadAgent() {
  try {
    const result = await secureConversationsApi.get<unknown>(
      `/registry/agents/${encodeURIComponent(agentId)}`,
    );
    agent.value = parseExternalAgent(result);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load agent';
  } finally {
    loading.value = false;
  }
}

onMounted(loadAgent);
</script>

<template>
  <ModulePage>
  <div class="p-6">
    <div v-if="loading" class="text-gray-400">Loading...</div>
    <div v-else-if="error" class="text-red-400">{{ error }}</div>
    <div v-else-if="agent">
      <h1 class="text-2xl font-bold text-white mb-2">{{ agent.name }}</h1>
      <p class="text-gray-400 mb-6">{{ agent.description }}</p>
      <pre class="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-auto">{{ JSON.stringify(agent, null, 2) }}</pre>
    </div>
  </div>
  </ModulePage>
</template>
