<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMessagesStore } from '../../stores/messages.store';
import ProtocolBadge from '../../components/shared/ProtocolBadge.vue';
import JsonPayloadViewer from '../../components/shared/JsonPayloadViewer.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { ProtocolMessage } from '../../types';

const messagesStore = useMessagesStore();

const filterTarget = ref('');
const filterStatus = ref('');
const expandedRows = ref<Set<string>>(new Set());

const MOCK_REQUESTS: ProtocolMessage[] = [
  {
    id: 'mp-req-001',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.query',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'x402-usdc',
      encryption: 'envelope',
      trust: 'reputation',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-001',
      method: 'research.query',
      params: { query: 'AI market trends Q1 2026', depth: 'deep', maxSources: 20 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-001',
      result: { articles: 18, categories: ['AI', 'LLM', 'Agents'], confidence: 0.91 },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 1.8).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 1.7).toISOString(),
      durationMs: 312,
    },
    payment: { required: true, amount: 0.002, currency: 'USDC', status: 'paid', transactionHash: '0xabc123' },
    status: 'success',
  },
  {
    id: 'mp-req-002',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    source: 'market-pulse',
    target: 'content-forge',
    method: 'content.generate',
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
      id: 'req-002',
      method: 'content.generate',
      params: { topic: 'DeFi protocol vulnerabilities', format: 'newsletter', wordCount: 800 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-002',
      result: { contentId: 'cnt-789', wordCount: 823, readabilityScore: 0.87 },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 7.5).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 6.9).toISOString(),
      durationMs: 6180,
    },
    payment: { required: true, amount: 0.008, currency: 'USDC', status: 'paid', transactionHash: '0xdef456' },
    status: 'success',
  },
  {
    id: 'mp-req-003',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    source: 'market-pulse',
    target: 'agent-consumer',
    method: 'signal.broadcast',
    protocol: {
      discovery: 'well-known',
      transport: 'websocket',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'allowlist',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-003',
      method: 'signal.broadcast',
      params: { signalType: 'market-alert', severity: 'high', payload: { asset: 'BTC', change: -8.4 } },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-003',
      error: { code: -32001, message: 'Target agent unavailable', data: { retryAfter: 30 } },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 14.9).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 14.8).toISOString(),
      durationMs: 1204,
    },
    payment: { required: false, status: 'free' },
    status: 'error',
  },
  {
    id: 'mp-req-004',
    timestamp: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.trending',
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
      id: 'req-004',
      method: 'research.trending',
      params: { category: 'crypto', window: '24h', limit: 10 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-004',
      result: { topics: ['Ethereum ETF', 'Bitcoin halving', 'Layer 2 scaling'], count: 10 },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 21.9).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 21.85).toISOString(),
      durationMs: 89,
    },
    payment: { required: false, status: 'free' },
    status: 'success',
  },
  {
    id: 'mp-req-005',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    source: 'market-pulse',
    target: 'content-forge',
    method: 'content.summarize',
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
      id: 'req-005',
      method: 'content.summarize',
      params: { articleIds: ['art-101', 'art-102', 'art-103'], maxLength: 200 },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    },
    payment: { required: true, amount: 0.003, currency: 'USD', status: 'pending' },
    status: 'pending',
  },
  {
    id: 'mp-req-006',
    timestamp: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    source: 'market-pulse',
    target: 'research-hub',
    method: 'research.deepdive',
    protocol: {
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'auction',
      identity: 'did',
      payment: 'x402-usdc',
      encryption: 'envelope',
      trust: 'reputation',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-006',
      method: 'research.deepdive',
      params: { topic: 'Regulatory impact on stablecoin markets', depth: 'expert', includeHistorical: true },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-006',
      error: { code: -32008, message: 'Request timeout after 30000ms' },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 47.5).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 47.5).toISOString(),
      durationMs: 30000,
    },
    payment: { required: true, amount: 0.012, currency: 'USDC', status: 'failed' },
    status: 'timeout',
  },
  {
    id: 'mp-req-007',
    timestamp: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
    source: 'market-pulse',
    target: 'agent-consumer',
    method: 'consumer.push',
    protocol: {
      discovery: 'well-known',
      transport: 'websocket',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'first-contact',
    },
    request: {
      jsonrpc: '2.0',
      id: 'req-007',
      method: 'consumer.push',
      params: { reportId: 'rpt-456', deliveryMode: 'push', subscribers: 142 },
    },
    response: {
      jsonrpc: '2.0',
      id: 'req-007',
      result: { delivered: 138, failed: 4, deliveryRate: 0.972 },
    },
    timing: {
      sentAt: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
      receivedAt: new Date(Date.now() - 1000 * 60 * 61.9).toISOString(),
      completedAt: new Date(Date.now() - 1000 * 60 * 61.8).toISOString(),
      durationMs: 441,
    },
    payment: { required: false, status: 'free' },
    status: 'success',
  },
];

const TARGET_AGENTS = ['research-hub', 'content-forge', 'agent-consumer'];

onMounted(async () => {
  await loadData();
});

async function loadData(): Promise<void> {
  try {
    await messagesStore.fetchMessages({ source: 'market-pulse', limit: 100 });
  } catch {
    // Error captured in store
  }
}

const sourceRows = computed<ProtocolMessage[]>(() => {
  const storeRows = messagesStore.messages.filter((m) => m.source === 'market-pulse');
  return storeRows.length > 0 ? storeRows : MOCK_REQUESTS;
});

const filteredRows = computed<ProtocolMessage[]>(() => {
  return sourceRows.value.filter((row) => {
    if (filterTarget.value && row.target !== filterTarget.value) return false;
    if (filterStatus.value && row.status !== filterStatus.value) return false;
    return true;
  });
});

function toggleRow(id: string): void {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id);
  } else {
    expandedRows.value.add(id);
  }
}

function isExpanded(id: string): boolean {
  return expandedRows.value.has(id);
}

function handleRetry(row: ProtocolMessage): void {
  console.log('[RequestsView] Retry requested for message', {
    id: row.id,
    method: row.method,
    target: row.target,
    originalTimestamp: row.timestamp,
  });
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatPaymentAmount(row: ProtocolMessage): string {
  if (!row.payment?.required || row.payment.amount == null) return '—';
  return `${row.payment.amount} ${row.payment.currency ?? ''}`.trim();
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success': return 'bg-green-900 text-green-300';
    case 'error': return 'bg-red-900 text-red-300';
    case 'pending': return 'bg-yellow-900 text-yellow-300';
    case 'timeout': return 'bg-orange-900 text-orange-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Outgoing Requests</h1>
      <p class="text-gray-400 text-sm mt-1">Requests sent from MarketPulse to other agents</p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 items-end">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Target Agent</label>
        <select v-model="filterTarget" class="select-field text-sm">
          <option value="">All Agents</option>
          <option v-for="agent in TARGET_AGENTS" :key="agent" :value="agent">{{ agent }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Status</label>
        <select v-model="filterStatus" class="select-field text-sm">
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
          <option value="timeout">Timeout</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="messagesStore.loading" label="Loading requests..." />

    <!-- Error state -->
    <div v-else-if="messagesStore.error" class="p-6">
      <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p class="text-red-300">{{ messagesStore.error }}</p>
        <button class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm" @click="loadData">Retry</button>
      </div>
    </div>

    <!-- Empty state -->
    <EmptyState
      v-else-if="filteredRows.length === 0"
      title="No Outgoing Requests"
      message="No outgoing requests yet"
    />

    <!-- Table -->
    <div v-else class="card overflow-hidden p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 bg-gray-800/80">
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3 w-6"></th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Timestamp</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Target Agent</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Endpoint</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Protocol</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Payment</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Status</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3">Latency</th>
            <th class="text-left text-xs text-gray-400 font-medium px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in filteredRows" :key="row.id">
            <!-- Main row -->
            <tr
              :class="[
                'border-b border-gray-700/50 cursor-pointer transition-colors',
                isExpanded(row.id) ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700',
              ]"
              @click="toggleRow(row.id)"
            >
              <!-- Expand chevron -->
              <td class="px-4 py-3 text-gray-500 w-6">
                <svg
                  :class="['w-3.5 h-3.5 transition-transform', isExpanded(row.id) ? 'rotate-90' : '']"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </td>

              <!-- Timestamp -->
              <td class="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                {{ formatTimestamp(row.timestamp) }}
              </td>

              <!-- Target Agent -->
              <td class="px-4 py-3 text-gray-200 font-medium">
                {{ row.target }}
              </td>

              <!-- Endpoint / method -->
              <td class="px-4 py-3 text-gray-400 font-mono text-xs">
                {{ row.method }}
              </td>

              <!-- Protocol badge (transport layer) -->
              <td class="px-4 py-3">
                <ProtocolBadge layer="transport" :provider="row.protocol.transport" />
              </td>

              <!-- Payment Amount -->
              <td class="px-4 py-3 text-xs text-gray-300 font-mono whitespace-nowrap">
                {{ formatPaymentAmount(row) }}
              </td>

              <!-- Status badge -->
              <td class="px-4 py-3">
                <span :class="['text-xs px-2 py-0.5 rounded font-medium', statusBadgeClass(row.status)]">
                  {{ row.status }}
                </span>
              </td>

              <!-- Latency -->
              <td class="px-4 py-3 text-xs text-gray-400 font-mono">
                {{ row.timing.durationMs != null ? `${row.timing.durationMs}ms` : '—' }}
              </td>

              <!-- Retry button (failed rows only, stop propagation) -->
              <td class="px-4 py-3" @click.stop>
                <button
                  v-if="row.status === 'error' || row.status === 'timeout'"
                  class="btn-secondary text-xs px-2 py-1"
                  @click="handleRetry(row)"
                >
                  Retry
                </button>
              </td>
            </tr>

            <!-- Expanded detail row -->
            <tr v-if="isExpanded(row.id)" :key="`${row.id}-detail`" class="bg-gray-900">
              <td colspan="9" class="px-6 py-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <JsonPayloadViewer
                    :data="row.request"
                    label="Request Payload"
                    :initial-open="true"
                  />
                  <JsonPayloadViewer
                    v-if="row.response"
                    :data="row.response"
                    label="Response Payload"
                    :initial-open="true"
                  />
                  <div v-else class="border border-gray-700 rounded-lg p-3 flex items-center justify-center">
                    <p class="text-xs text-gray-500 italic">No response received yet</p>
                  </div>

                  <!-- Timing & payment metadata -->
                  <div class="border border-gray-700 rounded-lg p-3 space-y-2 md:col-span-2">
                    <p class="text-xs font-medium text-gray-400 mb-2">Metadata</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span class="text-gray-500 block">Sent At</span>
                        <span class="text-gray-300 font-mono">{{ formatTimestamp(row.timing.sentAt) }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block">Completed At</span>
                        <span class="text-gray-300 font-mono">
                          {{ row.timing.completedAt ? formatTimestamp(row.timing.completedAt) : '—' }}
                        </span>
                      </div>
                      <div>
                        <span class="text-gray-500 block">Identity</span>
                        <span class="text-gray-300 font-mono">{{ row.protocol.identity }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block">Encryption</span>
                        <span class="text-gray-300 font-mono">{{ row.protocol.encryption }}</span>
                      </div>
                      <div v-if="row.payment?.required">
                        <span class="text-gray-500 block">Payment Status</span>
                        <span
                          :class="[
                            'font-mono',
                            row.payment.status === 'paid' ? 'text-green-400' :
                            row.payment.status === 'failed' ? 'text-red-400' :
                            row.payment.status === 'pending' ? 'text-yellow-400' : 'text-gray-300',
                          ]"
                        >{{ row.payment.status }}</span>
                      </div>
                      <div v-if="row.payment?.transactionHash">
                        <span class="text-gray-500 block">Tx Hash</span>
                        <span class="text-gray-300 font-mono truncate block max-w-[180px]">
                          {{ row.payment.transactionHash }}
                        </span>
                      </div>
                    </div>
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
