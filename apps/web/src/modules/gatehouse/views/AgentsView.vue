<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRbacStore } from '@/stores/rbacStore';
import { gatehouseApi } from '../api';
import A2AAgentForm from '../components/A2AAgentForm.vue';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { describeTarget, errorText, formatTime } from '../format';
import type { A2AAgent, A2AAgentDraft } from '../types';

const router = useRouter();
const rbac = useRbacStore();
const agents = ref<A2AAgent[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const creating = ref(false);
const saving = ref(false);
const showRetired = ref(false);

const allOrgs = computed(() => rbac.currentOrganization === '*');
const frontDoor = ref<string | null>(null);
const frontDoorChoice = ref('');
const savingDoor = ref(false);
const publishedAgents = computed(() => agents.value.filter((a) => a.published));
/** Where outside agents find this company, for its own domain to point at. */
const discovery = computed(() => {
  const org = rbac.currentOrganization;
  const base = `${window.location.origin}/api/gatehouse/orgs/${org}`;
  return { card: `${base}/agent-card.json`, catalog: `${base}/agents.json`, mcp: `${window.location.origin}/api/mcp/${org}` };
});

async function loadFrontDoor() {
  if (allOrgs.value) return;
  const answer = await gatehouseApi.frontDoor();
  frontDoor.value = answer.frontDoor;
  frontDoorChoice.value = answer.frontDoor ?? '';
}

async function saveFrontDoor() {
  savingDoor.value = true;
  error.value = null;
  try {
    frontDoor.value = (await gatehouseApi.setFrontDoor(frontDoorChoice.value || null)).frontDoor;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    savingDoor.value = false;
  }
}
const shown = computed(() => agents.value.filter((a) => showRetired.value || a.status !== 'archived'));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    agents.value = await gatehouseApi.agents();
    await loadFrontDoor();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function create(draft: A2AAgentDraft & { slug?: string; orgSlug?: string }) {
  saving.value = true;
  error.value = null;
  try {
    const created = await gatehouseApi.createAgent({ ...draft, slug: draft.slug ?? '' });
    creating.value = false;
    await router.push(`/app/gatehouse/agents/${created.slug}`);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">A2A agents</h1>
          <p class="text-gray-400 text-sm mt-1">
            What partners can call. Each agent says what a call does: raise an ambient event, call one of our agents, start a workflow, or forward to a partner.
          </p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
          <button v-if="!creating" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" @click="creating = true">
            New A2A agent
          </button>
        </div>
      </div>

      <ErrorBanner :message="error" />

      <div v-if="!allOrgs && !loading" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-3" data-test="discovery">
        <div>
          <h2 class="text-sm font-medium text-gray-300">How outside agents find this company</h2>
          <p class="text-xs text-gray-400 mt-1">
            The front door is the agent a stranger reaches first: its card is the company card. The catalog lists every published agent, the MCP endpoint and how to sign in.
            Point your own domain's <span class="font-mono">/.well-known/agent-card.json</span> and <span class="font-mono">/.well-known/agents.json</span> at these.
          </p>
        </div>
        <div class="flex items-end gap-3">
          <div class="flex-1 max-w-sm">
            <label class="block text-xs text-gray-400 mb-1">Front door</label>
            <select v-model="frontDoorChoice" class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white" data-test="front-door">
              <option value="">None</option>
              <option v-for="a in publishedAgents" :key="a.slug" :value="a.slug">{{ a.name }}</option>
            </select>
          </div>
          <button
            class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium disabled:opacity-50"
            :disabled="savingDoor || frontDoorChoice === (frontDoor ?? '')"
            data-test="save-front-door"
            @click="saveFrontDoor"
          >
            Save
          </button>
        </div>
        <dl class="text-xs grid grid-cols-[8rem_1fr] gap-y-1">
          <dt class="text-gray-500">Company card</dt>
          <dd class="font-mono text-gray-300 break-all">{{ frontDoor ? discovery.card : 'Choose a front door first' }}</dd>
          <dt class="text-gray-500">Catalog</dt>
          <dd class="font-mono text-gray-300 break-all">{{ discovery.catalog }}</dd>
          <dt class="text-gray-500">MCP endpoint</dt>
          <dd class="font-mono text-gray-300 break-all">{{ discovery.mcp }}</dd>
        </dl>
      </div>

      <div v-if="creating" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <h2 class="text-sm font-medium text-gray-300 mb-3">New A2A agent</h2>
        <A2AAgentForm creating :ask-org="allOrgs" :saving="saving" @submit="create" @cancel="creating = false" />
      </div>

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span class="text-xs text-gray-400">{{ shown.length }} agents</span>
          <label class="text-xs text-gray-400"><input v-model="showRetired" type="checkbox" /> Show archived</label>
        </div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="shown.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">No A2A agents in this organization yet</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Agent</th>
              <th v-if="allOrgs" class="text-left px-4 py-2">Org</th>
              <th class="text-left px-4 py-2">A call to it</th>
              <th class="text-left px-4 py-2">Callers</th>
              <th class="text-left px-4 py-2">Status</th>
              <th class="text-left px-4 py-2">Changed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="agent in shown" :key="agent.slug" class="hover:bg-gray-800/50 transition-colors cursor-pointer" @click="router.push(`/app/gatehouse/agents/${agent.slug}`)">
              <td class="px-4 py-2">
                <div class="text-white">{{ agent.name }}</div>
                <div class="text-gray-500 font-mono text-xs">{{ agent.slug }} · v{{ agent.version }}</div>
              </td>
              <td v-if="allOrgs" class="px-4 py-2 text-gray-300 font-mono text-xs">{{ agent.orgSlug }}</td>
              <td class="px-4 py-2 text-gray-300 text-xs">{{ describeTarget(agent.a2a.target) }}</td>
              <td class="px-4 py-2 text-gray-300 text-xs">
                {{ agent.a2a.callers === 'any' ? 'Any registered caller' : `${agent.a2a.callers.allow.length} allowed` }}
              </td>
              <td class="px-4 py-2"><StateBadge :state="agent.published ? 'published' : agent.status" /></td>
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(agent.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
