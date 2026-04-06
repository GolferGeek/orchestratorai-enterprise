<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5600';
const route = useRoute();
const agentId = route.params.id as string;

const agent = ref<Record<string, unknown> | null>(null);
const loading = ref(true);
const error = ref('');

async function loadAgent() {
  try {
    const res = await fetch(`${API_BASE}/registry/agents/${encodeURIComponent(agentId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    agent.value = await res.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load agent';
  } finally {
    loading.value = false;
  }
}

onMounted(loadAgent);
</script>

<template>
  <div class="p-6">
    <div v-if="loading" class="text-gray-400">Loading...</div>
    <div v-else-if="error" class="text-red-400">{{ error }}</div>
    <div v-else-if="agent">
      <h1 class="text-2xl font-bold text-white mb-2">{{ agent.name }}</h1>
      <p class="text-gray-400 mb-6">{{ agent.description }}</p>
      <pre class="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 overflow-auto">{{ JSON.stringify(agent, null, 2) }}</pre>
    </div>
  </div>
</template>
