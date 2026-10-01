<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { computed, onMounted, ref } from 'vue';
import { useRbacStore } from '@/stores/rbacStore';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { errorText, formatTime, runLink } from '../format';
import type { A2AAgent, Caller, GatehouseTask, TaskState } from '../types';

const STATES: TaskState[] = ['working', 'completed', 'failed', 'rejected', 'canceled'];

const rbac = useRbacStore();
const tasks = ref<GatehouseTask[]>([]);
const agents = ref<A2AAgent[]>([]);
const callers = ref<Caller[]>([]);
const agentFilter = ref('');
const stateFilter = ref<TaskState | ''>('');
const selected = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const agentsBySlug = computed(() => new Map(agents.value.map((a) => [a.slug, a])));
const callerNames = computed(() => new Map(callers.value.map((c) => [c.id, c.name])));

/** Where a task's work went: its workflow run, or the event it raised. */
function resultLink(task: GatehouseTask): { to: string; label: string } | null {
  const target = agentsBySlug.value.get(task.agentSlug)?.a2a.target;
  if (task.runId && target?.kind === 'workflow') return { to: runLink(target.workflowSlug, task.runId), label: 'Open the run' };
  if (task.eventId) return { to: `/app/gatehouse/events?event=${task.eventId}`, label: 'Open the event' };
  return null;
}

async function loadTasks() {
  tasks.value = await gatehouseApi.tasks({ agent: agentFilter.value || undefined, state: stateFilter.value, limit: 200 });
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // Callers are readable by an admin of every organization only.
    const [agentList, callerList] = await Promise.all([gatehouseApi.agents(), rbac.currentOrganization === '*' ? gatehouseApi.callers() : Promise.resolve([])]);
    agents.value = agentList;
    callers.value = callerList;
    await loadTasks();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function applyFilters() {
  error.value = null;
  try {
    await loadTasks();
  } catch (e) {
    error.value = errorText(e);
  }
}

onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Inbound</h1>
          <p class="text-gray-400 text-sm mt-1">Every call a partner made to one of our A2A agents, as the A2A task it became.</p>
        </div>
        <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
      </div>

      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
        <div class="flex gap-3 items-end flex-wrap">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Agent</label>
            <select v-model="agentFilter" class="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">All</option>
              <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">State</label>
            <select v-model="stateFilter" class="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">All</option>
              <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <button class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" @click="applyFilters">Apply</button>
        </div>
      </div>

      <ErrorBanner :message="error" />

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span class="text-xs text-gray-400">Tasks (newest first)</span>
          <span class="text-xs text-gray-500">{{ tasks.length }} records</span>
        </div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="tasks.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No inbound tasks</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Time</th>
              <th class="text-left px-4 py-2">Caller</th>
              <th class="text-left px-4 py-2">Our agent</th>
              <th class="text-left px-4 py-2">Target</th>
              <th class="text-left px-4 py-2">State</th>
              <th class="text-left px-4 py-2">Result</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <template v-for="task in tasks" :key="task.id">
              <tr class="hover:bg-gray-800/50 transition-colors cursor-pointer" @click="selected = selected === task.id ? null : task.id">
                <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(task.createdAt) }}</td>
                <td class="px-4 py-2 text-gray-300 text-xs">{{ callerNames.get(task.callerId) ?? task.callerId }}</td>
                <td class="px-4 py-2 text-gray-300 font-mono text-xs">{{ task.agentSlug }}</td>
                <td class="px-4 py-2 text-gray-300 text-xs">{{ task.target }}</td>
                <td class="px-4 py-2"><StateBadge :state="task.state" /></td>
                <td class="px-4 py-2 text-xs">
                  <router-link v-if="resultLink(task)" :to="resultLink(task)!.to" class="text-blue-400" @click.stop>{{ resultLink(task)!.label }}</router-link>
                  <span v-else class="text-gray-500">—</span>
                </td>
              </tr>
              <tr v-if="selected === task.id">
                <td colspan="6" class="px-4 py-3 bg-gray-800">
                  <div class="grid grid-cols-2 gap-4 text-xs">
                    <div><span class="text-gray-400">Task</span> <span class="text-gray-300 font-mono">{{ task.id }}</span></div>
                    <div><span class="text-gray-400">Caller's conversation</span> <span class="text-gray-300 font-mono">{{ task.contextId }}</span></div>
                    <div><span class="text-gray-400">Told the caller</span> <span class="text-gray-300">{{ task.statusMessage ?? '—' }}</span></div>
                    <div><span class="text-gray-400">Last change</span> <span class="text-gray-300">{{ formatTime(task.updatedAt) }}</span></div>
                  </div>
                  <p v-if="task.error" class="mt-2 text-xs text-red-400">Internal error (not shown to the caller): {{ task.error }}</p>
                  <pre v-if="task.artifact" class="mt-2 text-xs text-gray-300 font-mono overflow-x-auto">{{ JSON.stringify(task.artifact, null, 2) }}</pre>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
