<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { errorText, formatDuration, formatTime } from '../format';
import type { AmbientEvent, EventDetail, StorageWatch } from '../types';

const route = useRoute();
const router = useRouter();
const events = ref<AmbientEvent[]>([]);
const watches = ref<StorageWatch[]>([]);
const detail = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const adding = ref(false);
const bucket = ref('');
const prefix = ref('');
const eventName = ref('');

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';

/** Where an event came from, in words. */
function sourceText(event: AmbientEvent): string {
  if (event.source.startsWith('a2a:')) return `A2A agent ${event.source.slice(4)}`;
  if (event.source.startsWith('storage:')) return `File in ${event.source.slice(8)}`;
  if (event.source.startsWith('api:')) return 'Pushed through the API';
  return event.source;
}

async function openEvent(id: string | null) {
  detail.value = null;
  if (!id) return;
  try {
    detail.value = await gatehouseApi.event(id);
  } catch (e) {
    error.value = errorText(e);
  }
}

function select(id: string) {
  void router.replace({ query: route.query.event === id ? {} : { event: id } });
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    [events.value, watches.value] = await Promise.all([gatehouseApi.events(100), gatehouseApi.watches()]);
    await openEvent(typeof route.query.event === 'string' ? route.query.event : null);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function addWatch() {
  error.value = null;
  try {
    await gatehouseApi.createWatch({ bucket: bucket.value.trim(), prefix: prefix.value.trim(), event: eventName.value.trim() });
    adding.value = false;
    bucket.value = prefix.value = eventName.value = '';
    watches.value = await gatehouseApi.watches();
  } catch (e) {
    error.value = errorText(e);
  }
}

async function removeWatch(watchRow: StorageWatch) {
  if (!window.confirm(`Stop watching ${watchRow.bucket}/${watchRow.prefix}?`)) return;
  error.value = null;
  try {
    await gatehouseApi.deleteWatch(watchRow.id);
    watches.value = watches.value.filter((w) => w.id !== watchRow.id);
  } catch (e) {
    error.value = errorText(e);
  }
}

watch(() => route.query.event, (id) => void openEvent(typeof id === 'string' ? id : null));
onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Events and watches</h1>
          <p class="text-gray-400 text-sm mt-1">
            Events pushed to ambient, by an A2A agent or a file landing in a watched folder, and the triggers each one fired. Ambient answers an A2A caller through the agent the event came in on.
          </p>
        </div>
        <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
      </div>

      <ErrorBanner :message="error" />

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden mb-6">
        <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">Events (newest first)</div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="events.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No events in this organization yet</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Received</th>
              <th class="text-left px-4 py-2">Event</th>
              <th class="text-left px-4 py-2">From</th>
              <th class="text-left px-4 py-2">Caller's conversation</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <template v-for="event in events" :key="event.id">
              <tr class="hover:bg-gray-800/50 transition-colors cursor-pointer" @click="select(event.id)">
                <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(event.received_at) }}</td>
                <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ event.name }}</td>
                <td class="px-4 py-2 text-gray-300 text-xs">{{ sourceText(event) }}</td>
                <td class="px-4 py-2 text-gray-500 font-mono text-xs">{{ event.origin?.contextId ?? '—' }}</td>
              </tr>
              <tr v-if="detail && detail.event.id === event.id">
                <td colspan="4" class="px-4 py-3 bg-gray-800">
                  <div class="text-xs text-gray-400 mb-1">Triggers it fired</div>
                  <div v-if="detail.executions.length === 0" class="text-xs text-gray-500 italic mb-2">No trigger matched this event</div>
                  <table v-else class="w-full text-xs mb-2">
                    <tbody class="divide-y divide-gray-800">
                      <tr v-for="execution in detail.executions" :key="execution.id">
                        <td class="py-1 text-gray-300">{{ execution.trigger_name }}</td>
                        <td class="py-1"><StateBadge :state="execution.status" /></td>
                        <td class="py-1 text-gray-400">{{ execution.action_taken ? 'acted' : (execution.skip_reason ?? 'skipped') }}</td>
                        <td class="py-1">
                          <StateBadge v-if="execution.reply_state" :state="execution.reply_state" :label="`reply ${execution.reply_state}`" />
                        </td>
                        <td class="py-1 text-gray-400">{{ formatDuration(execution.duration_ms) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <pre class="text-xs text-gray-300 font-mono overflow-x-auto">{{ JSON.stringify(detail.event.payload, null, 2) }}</pre>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span class="text-xs text-gray-400">Watched storage folders: a new file raises the event</span>
          <button v-if="!adding" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium" @click="adding = true">Watch a folder</button>
        </div>
        <form v-if="adding" class="p-4 border-b border-gray-700 space-y-3" @submit.prevent="addWatch">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Bucket</label>
              <input v-model="bucket" :class="inputClass" placeholder="intake" required />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Folder (ending in /; empty for the whole bucket)</label>
              <input v-model="prefix" :class="inputClass" placeholder="invoices/" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Event</label>
              <input v-model="eventName" :class="inputClass" placeholder="invoice.received" required />
            </div>
          </div>
          <div class="flex gap-3">
            <button type="submit" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium">Watch</button>
            <button type="button" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="adding = false">Cancel</button>
          </div>
        </form>
        <div v-if="!loading && watches.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No folders watched</div>
        <table v-else-if="watches.length > 0" class="w-full text-sm">
          <tbody class="divide-y divide-gray-800">
            <tr v-for="w in watches" :key="w.id">
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ w.bucket }}/{{ w.prefix }}</td>
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ w.event }}</td>
              <td class="px-4 py-2"><StateBadge :state="w.enabled ? 'active' : 'disabled'" /></td>
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">since {{ formatTime(w.created_at) }}</td>
              <td class="px-4 py-2 text-right">
                <button class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-medium" @click="removeWatch(w)">Stop watching</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
