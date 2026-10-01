<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { computed, onMounted, ref } from 'vue';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { errorText, formatTime } from '../format';
import type { A2AAgent, GatehouseTask, OutboundCall } from '../types';

const agents = ref<A2AAgent[]>([]);
const tasks = ref<GatehouseTask[]>([]);
const outbound = ref<OutboundCall[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const jwksUrl = `${window.location.origin}/api/gatehouse/jwks.json`;
const dayAgo = () => Date.now() - 24 * 60 * 60 * 1000;

const published = computed(() => agents.value.filter((a) => a.published).length);
const inboundToday = computed(() => tasks.value.filter((t) => Date.parse(t.createdAt) > dayAgo()));
const outboundToday = computed(() => outbound.value.filter((c) => Date.parse(c.createdAt) > dayAgo()));
const failedToday = computed(
  () => inboundToday.value.filter((t) => t.state === 'failed' || t.state === 'rejected').length + outboundToday.value.filter((c) => c.state === 'failed').length,
);

/** The latest crossings either way, newest first. */
const recent = computed(() =>
  [
    ...tasks.value.map((t) => ({ id: `in-${t.id}`, at: t.createdAt, direction: 'In' as const, agent: t.agentSlug, what: `${t.target} task`, state: t.state })),
    ...outbound.value.map((c) => ({
      id: `out-${c.id}`,
      at: c.createdAt,
      direction: 'Out' as const,
      agent: c.agentSlug,
      what: `${c.kind === 'reply' ? 'reply to' : 'call to'} ${c.remoteName ?? c.remoteCardUrl}`,
      state: c.state,
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    [agents.value, tasks.value, outbound.value] = await Promise.all([gatehouseApi.agents(), gatehouseApi.tasks({ limit: 200 }), gatehouseApi.outbound(200)]);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Gatehouse</h1>
          <p class="text-gray-400 text-sm mt-1">
            The platform's A2A boundary. Partner agents call our published A2A agents here, and our agents call partners from here. Every call is checked, recorded and answered under the A2A v1.0 standard.
          </p>
        </div>
        <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
      </div>

      <ErrorBanner :message="error" />

      <div class="grid grid-cols-2 gap-4 mb-6">
        <router-link to="/app/gatehouse/agents" class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-400">A2A agents</div>
          <div class="text-2xl font-bold text-white">{{ published }} <span class="text-sm text-gray-500">of {{ agents.length }} published</span></div>
        </router-link>
        <router-link to="/app/gatehouse/inbound" class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-400">Inbound tasks, last 24 hours</div>
          <div class="text-2xl font-bold text-white">{{ inboundToday.length }}</div>
        </router-link>
        <router-link to="/app/gatehouse/outbound" class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-400">Outbound calls, last 24 hours</div>
          <div class="text-2xl font-bold text-white">{{ outboundToday.length }}</div>
        </router-link>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-400">Failed or refused, last 24 hours</div>
          <div class="text-2xl font-bold text-white">{{ failedToday }}</div>
        </div>
      </div>

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden mb-6">
        <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">Latest crossings (newest first)</div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="recent.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">Nothing has crossed the Gatehouse yet</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Time</th>
              <th class="text-left px-4 py-2">Direction</th>
              <th class="text-left px-4 py-2">Our agent</th>
              <th class="text-left px-4 py-2">What</th>
              <th class="text-left px-4 py-2">State</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="row in recent" :key="row.id">
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(row.at) }}</td>
              <td class="px-4 py-2 text-gray-300 text-xs">{{ row.direction }}</td>
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ row.agent }}</td>
              <td class="px-4 py-2 text-gray-300 text-xs">{{ row.what }}</td>
              <td class="px-4 py-2"><StateBadge :state="row.state" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 class="text-sm font-medium text-gray-300 mb-2">For partners</h2>
        <p class="text-xs text-gray-400 mb-2">
          Each published A2A agent has a card at <code class="text-green-400 font-mono">/api/a2a/&lt;agent&gt;/.well-known/agent-card.json</code>.
          A partner registers as a caller with its own public keys and signs each call (ES256 JWT). Our replies are signed with the key published here:
        </p>
        <code class="text-sm text-green-400 font-mono">{{ jwksUrl }}</code>
      </div>
    </div>
  </ModulePage>
</template>
