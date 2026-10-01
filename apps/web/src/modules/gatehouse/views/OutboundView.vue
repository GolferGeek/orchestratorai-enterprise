<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { onMounted, ref } from 'vue';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { errorText, formatDuration, formatTime } from '../format';
import type { OutboundCall } from '../types';

const calls = ref<OutboundCall[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    calls.value = await gatehouseApi.outbound(200);
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
          <h1 class="text-2xl font-bold text-white">Outbound</h1>
          <p class="text-gray-400 text-sm mt-1">
            Every call our A2A agents made to a partner: an agent forwarding a message to its partner, or a reply sent back to a caller once ambient had an answer. Replies are signed with our key.
          </p>
        </div>
        <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
      </div>

      <ErrorBanner :message="error" />

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span class="text-xs text-gray-400">Calls (newest first)</span>
          <span class="text-xs text-gray-500">{{ calls.length }} records</span>
        </div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="calls.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No outbound calls yet</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Time</th>
              <th class="text-left px-4 py-2">Our agent</th>
              <th class="text-left px-4 py-2">Kind</th>
              <th class="text-left px-4 py-2">Partner</th>
              <th class="text-left px-4 py-2">State</th>
              <th class="text-left px-4 py-2">Partner's answer</th>
              <th class="text-left px-4 py-2">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="call in calls" :key="call.id">
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(call.createdAt) }}</td>
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ call.agentSlug }}</td>
              <td class="px-4 py-2 text-gray-300 text-xs">{{ call.kind === 'reply' ? 'Reply to a caller' : 'Call' }}</td>
              <td class="px-4 py-2 text-xs">
                <div class="text-gray-300">{{ call.remoteName ?? '—' }}</div>
                <div class="text-gray-500 font-mono">{{ call.remoteCardUrl }}</div>
                <div v-if="call.contextId" class="text-gray-500">Conversation {{ call.contextId }}</div>
              </td>
              <td class="px-4 py-2"><StateBadge :state="call.state" /></td>
              <td class="px-4 py-2 text-xs">
                <span v-if="call.error" class="text-red-400">{{ call.error }}</span>
                <span v-else class="text-gray-300">{{ call.remoteState ?? '—' }}<span v-if="call.remoteTaskId" class="text-gray-500 font-mono"> · task {{ call.remoteTaskId }}</span></span>
              </td>
              <td class="px-4 py-2 text-gray-400 text-xs">{{ formatDuration(call.durationMs) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
