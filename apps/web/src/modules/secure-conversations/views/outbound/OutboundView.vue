<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAgentsStore } from '../../stores/agents.store';
import { useApi } from '../../composables/useApi';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

const store = useAgentsStore();
const { secureConversationsApi } = useApi();
const rbac = useRbacStore();

// Send-form state
const targetAgentId = ref('');
const paramsJson = ref('{}');
const sending = ref(false);
const result = ref<unknown>(null);
const sendError = ref('');

// Computed: outbound messages from store
const outboundMessages = computed(() => store.messages);

const agents = computed(() => store.agents);

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-900 text-green-300';
    case 'error': return 'bg-red-900 text-red-300';
    case 'rejected': return 'bg-orange-900 text-orange-300';
    case 'rate_limited': return 'bg-yellow-900 text-yellow-300';
    case 'pending': return 'bg-blue-900 text-blue-300';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function formatTime(ts?: string): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

async function sendRequest() {
  sending.value = true;
  result.value = null;
  sendError.value = '';

  let params: Record<string, unknown>;
  try {
    const parsed = JSON.parse(paramsJson.value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Params must be a JSON object');
    }
    params = parsed as Record<string, unknown>;
  } catch {
    sendError.value = 'Invalid JSON in params field';
    sending.value = false;
    return;
  }

  try {
    await rbac.initialize();
    const user = rbac.user;
    const orgSlug = await resolveConcreteOrganization(rbac);
    if (!user) {
      throw new Error('Authentication is required to send an A2A request');
    }
    if (typeof crypto.randomUUID !== 'function') {
      throw new Error('Secure UUID generation is unavailable');
    }
    const requestId = crypto.randomUUID();
    const context: ExecutionContext = Object.freeze({
      orgSlug,
      userId: user.id,
      conversationId: requestId,
      agentSlug: 'secure-conversations',
      agentType: 'secure-conversations',
      provider: 'platform',
      model: 'external-a2a',
    });
    const response = await secureConversationsApi.post<unknown>('/invoke', {
      jsonrpc: '2.0',
      id: requestId,
      method: 'invoke',
      params: {
        context,
        data: { content: params, contentType: 'json' },
        metadata: {
          direction: 'outbound',
          targetAgentId: targetAgentId.value,
        },
      },
    });
    if (typeof response !== 'object' || response === null || Array.isArray(response)) {
      throw new Error('Secure Conversations invoke response was malformed');
    }
    const jsonRpc = response as Record<string, unknown>;
    if (jsonRpc.jsonrpc !== '2.0' || jsonRpc.id !== requestId) {
      throw new Error('Secure Conversations invoke response was malformed');
    }
    if (typeof jsonRpc.error === 'object' && jsonRpc.error !== null) {
      const message = (jsonRpc.error as Record<string, unknown>).message;
      throw new Error(
        typeof message === 'string'
          ? message
          : 'Secure Conversations invocation failed',
      );
    }
    if (typeof jsonRpc.result !== 'object' || jsonRpc.result === null) {
      throw new Error('Secure Conversations invoke response was malformed');
    }
    result.value = response;
    // Refresh outbound history after sending
    await store.fetchMessages({ direction: 'outbound', limit: 50 });
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Failed to send';
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  await Promise.all([
    store.fetchAgents(),
    store.fetchMessages({ direction: 'outbound', limit: 50 }),
  ]);
  store.startAutoRefresh();
});

onUnmounted(() => {
  store.stopAutoRefresh();
});
</script>

<template>
  <ModulePage>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">Outbound A2A</h1>
      <p class="text-gray-400 text-sm mt-1">
        Send signed A2A requests to registered external agents and view message history
      </p>
    </div>

    <!-- Send form -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-300 mb-4">Send Request</h2>

      <div class="space-y-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Target Agent</label>
          <select
            v-model="targetAgentId"
            class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select external agent...</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.name }} ({{ agent.id }})
            </option>
          </select>
          <p v-if="store.loading" class="text-xs text-gray-500 mt-1">Loading agents...</p>
          <p v-else-if="agents.length === 0" class="text-xs text-yellow-500 mt-1">
            No agents registered. Go to Registry to discover external agents first.
          </p>
        </div>

        <div>
          <label class="block text-xs text-gray-400 mb-1">Method (JSON-RPC 2.0)</label>
          <input
            value="invoke"
            type="text"
            readonly
            class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400"
          />
        </div>

        <div>
          <label class="block text-xs text-gray-400 mb-1">Params (JSON)</label>
          <textarea
            v-model="paramsJson"
            rows="4"
            class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium disabled:opacity-50"
          :disabled="sending || !targetAgentId"
          @click="sendRequest"
        >
          {{ sending ? 'Sending...' : 'Send (Signed)' }}
        </button>

        <p v-if="sendError" class="text-sm text-red-400">{{ sendError }}</p>
      </div>
    </div>

    <!-- Response panel -->
    <div v-if="result" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-300 mb-2">Response</h2>
      <pre class="text-sm text-gray-300 overflow-auto">{{ JSON.stringify(result, null, 2) }}</pre>
    </div>

    <!-- Outbound message history -->
    <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div class="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <span class="text-xs text-gray-400">Outbound Message History (newest first)</span>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500">{{ outboundMessages.length }} records</span>
          <button
            class="text-xs text-gray-500 hover:text-gray-300"
            @click="store.fetchMessages({ direction: 'outbound', limit: 50 })"
          >
            Refresh
          </button>
        </div>
      </div>

      <div v-if="store.messagesLoading" class="px-4 py-8 text-center text-gray-500 text-sm">
        Loading...
      </div>

      <div v-else-if="outboundMessages.length === 0" class="px-4 py-8 text-center text-gray-600 text-sm italic">
        No outbound messages recorded yet
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Time</th>
              <th class="text-left px-4 py-2">Target Agent</th>
              <th class="text-left px-4 py-2">Method</th>
              <th class="text-left px-4 py-2">Status</th>
              <th class="text-left px-4 py-2">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr
              v-for="msg in outboundMessages"
              :key="msg.id ?? msg.created_at"
              class="hover:bg-gray-800/50 transition-colors"
            >
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">
                {{ formatTime(msg.created_at) }}
              </td>
              <td class="px-4 py-2 text-gray-300 text-xs">
                {{ msg.external_agent_id ?? '—' }}
              </td>
              <td class="px-4 py-2 text-gray-300 font-mono text-xs">
                {{ msg.method ?? '—' }}
              </td>
              <td class="px-4 py-2">
                <span :class="['text-xs px-2 py-0.5 rounded-full font-medium', statusBadgeClass(msg.status)]">
                  {{ msg.status }}
                </span>
              </td>
              <td class="px-4 py-2 text-gray-400 text-xs">
                {{ msg.duration_ms != null ? `${msg.duration_ms}ms` : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- How it works -->
    <div class="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 class="text-sm font-medium text-gray-300 mb-2">How It Works</h2>
      <ol class="text-xs text-gray-500 space-y-1 list-decimal list-inside">
        <li>Secure Conversations looks up the target agent in the external registry</li>
        <li>HMAC-SHA256 security envelope generated (nonce + timestamp + signature)</li>
        <li>JSON-RPC 2.0 request sent with X-Agent-Id and X-Security-Envelope headers</li>
        <li>External agent's trust score updated based on response outcome</li>
        <li>Message is persisted to the audit trail</li>
      </ol>
    </div>
  </div>
  </ModulePage>
</template>
