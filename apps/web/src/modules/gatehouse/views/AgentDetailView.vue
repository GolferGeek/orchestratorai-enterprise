<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { onMounted, ref, watch } from 'vue';
import { gatehouseApi } from '../api';
import A2AAgentForm from '../components/A2AAgentForm.vue';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { describeTarget, errorText, formatTime, runLink } from '../format';
import type { A2AAgent, A2AAgentDraft, A2AAgentStatus, GatehouseTask } from '../types';

const props = defineProps<{ slug: string }>();

const agent = ref<A2AAgent | null>(null);
const tasks = ref<GatehouseTask[]>([]);
const error = ref<string | null>(null);
const editing = ref(false);
const saving = ref(false);

async function load() {
  error.value = null;
  try {
    [agent.value, tasks.value] = await Promise.all([gatehouseApi.agent(props.slug), gatehouseApi.tasks({ agent: props.slug, limit: 50 })]);
  } catch (e) {
    error.value = errorText(e);
  }
}

async function save(draft: A2AAgentDraft) {
  saving.value = true;
  error.value = null;
  try {
    agent.value = await gatehouseApi.updateAgent(props.slug, { name: draft.name, description: draft.description, a2a: draft.a2a });
    editing.value = false;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    saving.value = false;
  }
}

async function setStatus(status: A2AAgentStatus) {
  error.value = null;
  try {
    agent.value = await gatehouseApi.setAgentStatus(props.slug, status);
  } catch (e) {
    error.value = errorText(e);
  }
}

watch(() => props.slug, load);
onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <router-link to="/app/gatehouse/agents" class="text-xs text-gray-400">← A2A agents</router-link>
      <ErrorBanner :message="error" />

      <template v-if="agent">
        <div class="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 class="text-2xl font-bold text-white">{{ agent.name }}</h1>
            <p class="text-gray-500 font-mono text-xs mt-1">{{ agent.slug }} · {{ agent.orgSlug }} · v{{ agent.version }} · changed {{ formatTime(agent.updatedAt) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <StateBadge :state="agent.published ? 'published' : agent.status" />
            <button v-if="agent.status !== 'active'" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" @click="setStatus('active')">
              Publish
            </button>
            <button v-if="agent.status === 'active'" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="setStatus('disabled')">
              Disable
            </button>
            <button v-if="agent.status !== 'archived'" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="setStatus('archived')">
              Archive
            </button>
          </div>
        </div>

        <div v-if="editing" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
          <A2AAgentForm :initial="{ name: agent.name, description: agent.description, a2a: agent.a2a }" :saving="saving" @submit="save" @cancel="editing = false" />
        </div>
        <div v-else class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-3">
          <p class="text-sm text-gray-300">{{ agent.description }}</p>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-xs text-gray-400">A call to it</div>
              <div class="text-gray-300">{{ describeTarget(agent.a2a.target) }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-400">Who may call it</div>
              <div v-if="agent.a2a.callers === 'any'" class="text-gray-300">Any registered caller</div>
              <div v-else class="text-gray-300 font-mono text-xs">
                <div v-for="url in agent.a2a.callers.allow" :key="url">{{ url }}</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-400">Card {{ agent.published ? '' : '(served once published)' }}</div>
            <code class="text-sm text-green-400 font-mono">{{ agent.cardUrl }}</code>
          </div>
          <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="editing = true">Edit</button>
        </div>

        <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
          <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">Recent tasks from callers</div>
          <div v-if="tasks.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No caller has called this agent yet</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                <th class="text-left px-4 py-2">Time</th>
                <th class="text-left px-4 py-2">State</th>
                <th class="text-left px-4 py-2">Result</th>
                <th class="text-left px-4 py-2">Status message</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800">
              <tr v-for="task in tasks" :key="task.id">
                <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(task.createdAt) }}</td>
                <td class="px-4 py-2"><StateBadge :state="task.state" /></td>
                <td class="px-4 py-2 text-xs">
                  <router-link v-if="task.runId && agent.a2a.target.kind === 'workflow'" :to="runLink(agent.a2a.target.workflowSlug, task.runId)" class="text-blue-400">
                    Open the run
                  </router-link>
                  <router-link v-else-if="task.eventId" :to="`/app/gatehouse/events?event=${task.eventId}`" class="text-blue-400">Open the event</router-link>
                  <span v-else class="text-gray-500">—</span>
                </td>
                <td class="px-4 py-2 text-gray-300 text-xs">{{ task.statusMessage ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </ModulePage>
</template>
