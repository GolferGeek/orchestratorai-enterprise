<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMessagesStore } from '../../stores/messages.store';
import JsonPayloadViewer from '../../components/shared/JsonPayloadViewer.vue';
import ProtocolBadge from '../../components/shared/ProtocolBadge.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { ProtocolMessage, MessageFilter } from '../../types';

const messagesStore = useMessagesStore();

const filterAgent = ref('');
const filterEndpoint = ref('');
const filterPaymentStatus = ref('');

const expandedRows = ref<Set<string>>(new Set());

const MOCK_REQUESTS: ProtocolMessage[] = [
  {
    id: 'req-001',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.articles.query',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'acp',
      identity: 'did',
      payment: 'x402-usdc',
      encryption: 'envelope',
      trust: 'reputation',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-001',
      method: 'research.articles.query',
      params: { category: 'ai-ml', limit: 10, signalThreshold: 0.7 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-001',
      result: { articles: [], total: 0, cached: false },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(), durationMs: 142 },
    payment: { required: true, amount: 0.005, currency: 'USDC', status: 'paid', transactionHash: '0xabc123' },
    status: 'success',
  },
  {
    id: 'req-002',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    source: 'content-forge',
    target: 'research-hub',
    method: 'research.narratives.generate',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'allowlist',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-002',
      method: 'research.narratives.generate',
      params: { topic: 'quantum-computing', personality: 'analyst', maxLength: 500 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-002',
      result: { narrative: 'Quantum computing milestones...', wordCount: 487 },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), durationMs: 2310 },
    payment: { required: false, status: 'free' },
    status: 'success',
  },
  {
    id: 'req-003',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    source: 'agent-consumer',
    target: 'research-hub',
    method: 'research.scout.signals',
    protocol: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'allowlist',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-003',
      method: 'research.scout.signals',
      params: { category: 'fintech', minStrength: 0.6 },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
    payment: { required: true, amount: 0.002, currency: 'USDC', status: 'pending' },
    status: 'pending',
  },
  {
    id: 'req-004',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.categories.list',
    protocol: {
      discovery: 'well-known',
      transport: 'grpc',
      negotiation: 'acp',
      identity: 'x509',
      payment: 'stripe-fiat',
      encryption: 'tls-mutual',
      trust: 'reputation',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-004',
      method: 'research.categories.list',
      params: {},
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-004',
      error: { code: 403, message: 'Insufficient trust score for endpoint', data: { requiredScore: 0.8, currentScore: 0.62 } },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(), durationMs: 18 },
    payment: { required: true, amount: 0.001, currency: 'USD', status: 'failed' },
    status: 'error',
  },
  {
    id: 'req-005',
    timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    source: 'content-forge',
    target: 'research-hub',
    method: 'research.articles.query',
    protocol: {
      discovery: 'well-known',
      transport: 'websocket',
      negotiation: 'auction',
      identity: 'did',
      payment: 'x402-usdc',
      encryption: 'envelope',
      trust: 'first-contact',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-005',
      method: 'research.articles.query',
      params: { category: 'biotech', limit: 5 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-005',
      result: { articles: [], total: 0, cached: true },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(), durationMs: 67 },
    payment: { required: true, amount: 0.003, currency: 'USDC', status: 'paid', transactionHash: '0xdef456' },
    status: 'success',
  },
  {
    id: 'req-006',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    source: 'agent-consumer',
    target: 'research-hub',
    method: 'research.topics.trending',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'allowlist',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-006',
      method: 'research.topics.trending',
      params: { limit: 20, window: '24h' },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-006',
      result: { topics: [], windowStart: new Date(Date.now() - 86400000).toISOString() },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(), durationMs: 389 },
    payment: { required: false, status: 'free' },
    status: 'success',
  },
  {
    id: 'req-007',
    timestamp: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.narratives.generate',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'acp',
      identity: 'did',
      payment: 'x402-usdc',
      encryption: 'envelope',
      trust: 'reputation',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-007',
      method: 'research.narratives.generate',
      params: { topic: 'central-bank-policy', personality: 'skeptic' },
    },
    timing: { sentAt: new Date(Date.now() - 1000 * 60 * 48).toISOString() },
    payment: { required: true, amount: 0.008, currency: 'USDC', status: 'pending' },
    status: 'timeout',
  },
];

async function retry() {
  const filter: MessageFilter = { target: 'research-hub', limit: 100 };
  if (filterAgent.value) filter.source = filterAgent.value;
  await messagesStore.fetchMessages(filter);
}

onMounted(async () => {
  await messagesStore.fetchMessages({ target: 'research-hub', limit: 100 });
});

const hubMessages = computed<ProtocolMessage[]>(() => {
  const live = messagesStore.messages.filter((m) => m.target === 'research-hub');
  const source = live.length > 0 ? live : MOCK_REQUESTS;

  return source.filter((m) => {
    if (filterAgent.value && m.source !== filterAgent.value) return false;
    if (filterEndpoint.value && m.method !== filterEndpoint.value) return false;
    if (filterPaymentStatus.value) {
      const ps = m.payment?.status ?? 'free';
      if (ps !== filterPaymentStatus.value) return false;
    }
    return true;
  });
});

const uniqueAgents = computed<string[]>(() => {
  const live = messagesStore.messages.filter((m) => m.target === 'research-hub');
  const source = live.length > 0 ? live : MOCK_REQUESTS;
  return [...new Set(source.map((m) => m.source))].sort();
});

const uniqueEndpoints = computed<string[]>(() => {
  const live = messagesStore.messages.filter((m) => m.target === 'research-hub');
  const source = live.length > 0 ? live : MOCK_REQUESTS;
  return [...new Set(source.map((m) => m.method))].sort();
});

function toggleRow(id: string) {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id);
  } else {
    expandedRows.value.add(id);
  }
}

function isExpanded(id: string): boolean {
  return expandedRows.value.has(id);
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatPayment(msg: ProtocolMessage): string {
  if (!msg.payment || !msg.payment.required) return '—';
  if (msg.payment.amount !== undefined) {
    return `${msg.payment.amount} ${msg.payment.currency ?? ''}`.trim();
  }
  return '—';
}

function statusBgClass(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-900/60 text-green-300';
    case 'error':   return 'bg-red-900/60 text-red-300';
    case 'pending': return 'bg-yellow-900/60 text-yellow-300';
    case 'timeout': return 'bg-orange-900/60 text-orange-300';
    default:        return 'bg-gray-700 text-gray-300';
  }
}

function paymentStatusBgClass(status: string | undefined): string {
  switch (status) {
    case 'paid':    return 'bg-green-900/60 text-green-300';
    case 'failed':  return 'bg-red-900/60 text-red-300';
    case 'pending': return 'bg-yellow-900/60 text-yellow-300';
    case 'free':    return 'bg-gray-700 text-gray-400';
    default:        return 'bg-gray-700 text-gray-400';
  }
}

function applyFilters() {
  const filter: MessageFilter = { target: 'research-hub', limit: 100 };
  if (filterAgent.value) filter.source = filterAgent.value;
  messagesStore.fetchMessages(filter).catch(() => {
    // Error captured in store
  });
}

function clearFilters() {
  filterAgent.value = '';
  filterEndpoint.value = '';
  filterPaymentStatus.value = '';
  applyFilters();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Incoming Requests</h1>
        <p class="text-sm text-gray-400 mt-0.5">Requests received by ResearchHub from external agents</p>
      </div>
      <span class="text-sm text-gray-400">{{ hubMessages.length }} request{{ hubMessages.length !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Filters -->
    <div class="card flex flex-wrap gap-3 items-end">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Requesting Agent</label>
        <select v-model="filterAgent" class="select-field text-sm">
          <option value="">All agents</option>
          <option v-for="agent in uniqueAgents" :key="agent" :value="agent">{{ agent }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Endpoint</label>
        <select v-model="filterEndpoint" class="select-field text-sm">
          <option value="">All endpoints</option>
          <option v-for="ep in uniqueEndpoints" :key="ep" :value="ep">{{ ep }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Payment Status</label>
        <select v-model="filterPaymentStatus" class="select-field text-sm">
          <option value="">All</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="free">Free</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary text-sm" @click="applyFilters">Apply</button>
        <button class="btn-secondary text-sm" @click="clearFilters">Clear</button>
      </div>
    </div>

    <LoadingSpinner v-if="messagesStore.loading" label="Loading requests..." class="py-16" />

    <div v-else-if="messagesStore.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ messagesStore.error }}</p>
        <button
          class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          @click="retry"
        >
          Retry
        </button>
      </div>
    </div>

    <EmptyState
      v-else-if="hubMessages.length === 0"
      title="No Incoming Requests"
      message="No incoming requests yet. Send a request from another app to see it here."
      icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />

    <!-- Table -->
    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 bg-gray-800/80">
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-6"></th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Timestamp</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Requesting Agent</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Endpoint</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Protocol</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Payment</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
            <th class="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Latency</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-700/60">
          <template v-for="msg in hubMessages" :key="msg.id">
            <!-- Main row -->
            <tr
              class="bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"
              @click="toggleRow(msg.id)"
            >
              <!-- Expand chevron -->
              <td class="px-4 py-3">
                <svg
                  :class="['w-3.5 h-3.5 text-gray-500 transition-transform', isExpanded(msg.id) ? 'rotate-90' : '']"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </td>

              <!-- Timestamp -->
              <td class="px-4 py-3 text-gray-300 font-mono whitespace-nowrap">
                {{ formatTimestamp(msg.timestamp) }}
              </td>

              <!-- Requesting Agent -->
              <td class="px-4 py-3">
                <span class="font-medium text-gray-200">{{ msg.source }}</span>
              </td>

              <!-- Endpoint -->
              <td class="px-4 py-3">
                <span class="font-mono text-gray-300 text-xs bg-gray-700/60 px-1.5 py-0.5 rounded">
                  {{ msg.method }}
                </span>
              </td>

              <!-- Protocol -->
              <td class="px-4 py-3">
                <ProtocolBadge layer="transport" :provider="msg.protocol.transport" />
              </td>

              <!-- Payment -->
              <td class="px-4 py-3">
                <div class="flex flex-col gap-0.5">
                  <span class="text-gray-300">{{ formatPayment(msg) }}</span>
                  <span
                    v-if="msg.payment"
                    :class="[
                      'inline-flex items-center px-2 py-0.5 rounded text-xs w-fit',
                      paymentStatusBgClass(msg.payment.status),
                    ]"
                  >
                    {{ msg.payment.status ?? 'free' }}
                  </span>
                </div>
              </td>

              <!-- Status -->
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                    statusBgClass(msg.status),
                  ]"
                >
                  {{ msg.status }}
                </span>
              </td>

              <!-- Latency -->
              <td class="px-4 py-3 text-gray-300 font-mono">
                <span v-if="msg.timing.durationMs !== undefined">{{ msg.timing.durationMs }}ms</span>
                <span v-else class="text-gray-500">—</span>
              </td>
            </tr>

            <!-- Expanded row -->
            <tr v-if="isExpanded(msg.id)" class="bg-gray-900">
              <td colspan="8" class="px-6 py-4">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <!-- Left: metadata -->
                  <div class="space-y-3">
                    <div>
                      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Protocol Layers</p>
                      <div class="flex flex-wrap gap-1.5">
                        <ProtocolBadge
                          v-for="(value, layer) in msg.protocol"
                          :key="layer"
                          :layer="layer"
                          :provider="value"
                        />
                      </div>
                    </div>

                    <div v-if="msg.payment">
                      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payment Details</p>
                      <div class="bg-gray-800 rounded-lg px-3 py-2 space-y-1 text-xs">
                        <div class="flex justify-between">
                          <span class="text-gray-400">Required</span>
                          <span class="text-gray-200">{{ msg.payment.required ? 'Yes' : 'No' }}</span>
                        </div>
                        <div v-if="msg.payment.amount !== undefined" class="flex justify-between">
                          <span class="text-gray-400">Amount</span>
                          <span class="text-gray-200">{{ msg.payment.amount }} {{ msg.payment.currency }}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-400">Status</span>
                          <span
                            :class="[
                              'inline-flex items-center px-1.5 py-0.5 rounded text-xs',
                              paymentStatusBgClass(msg.payment.status),
                            ]"
                          >
                            {{ msg.payment.status ?? 'free' }}
                          </span>
                        </div>
                        <div v-if="msg.payment.transactionHash" class="flex justify-between">
                          <span class="text-gray-400">Tx Hash</span>
                          <span class="text-gray-200 font-mono">{{ msg.payment.transactionHash }}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Timing</p>
                      <div class="bg-gray-800 rounded-lg px-3 py-2 space-y-1 text-xs">
                        <div class="flex justify-between">
                          <span class="text-gray-400">Sent At</span>
                          <span class="text-gray-200 font-mono">{{ formatTimestamp(msg.timing.sentAt) }}</span>
                        </div>
                        <div v-if="msg.timing.completedAt" class="flex justify-between">
                          <span class="text-gray-400">Completed</span>
                          <span class="text-gray-200 font-mono">{{ formatTimestamp(msg.timing.completedAt) }}</span>
                        </div>
                        <div v-if="msg.timing.durationMs !== undefined" class="flex justify-between">
                          <span class="text-gray-400">Duration</span>
                          <span class="text-gray-200 font-mono">{{ msg.timing.durationMs }}ms</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Right: request / response payloads -->
                  <div class="space-y-3">
                    <JsonPayloadViewer
                      :data="msg.request"
                      label="Request Payload"
                      :initial-open="true"
                    />
                    <JsonPayloadViewer
                      v-if="msg.response"
                      :data="msg.response"
                      label="Response Payload"
                      :initial-open="true"
                    />
                    <div v-else class="text-xs text-gray-500 italic">No response yet</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
