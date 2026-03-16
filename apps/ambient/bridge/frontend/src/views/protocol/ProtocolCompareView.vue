<script setup lang="ts">
import { ref, computed } from 'vue';
import { PROTOCOL_LAYERS, LAYER_TEXT_COLORS, LAYER_COLORS } from '../../types';
import type { ProtocolConfig, ProtocolLayer } from '../../types';

const layerOptions: Record<ProtocolLayer, { value: string; label: string }[]> = {
  discovery: [{ value: 'well-known', label: 'Well-Known (.well-known/agent.json)' }],
  transport: [
    { value: 'http-rest', label: 'HTTP REST' },
    { value: 'a2a-jsonrpc', label: 'A2A JSON-RPC 2.0' },
    { value: 'websocket', label: 'WebSocket' },
    { value: 'grpc', label: 'gRPC (Protobuf)' },
    { value: 'mcp', label: 'MCP (Model Context Protocol)' },
  ],
  negotiation: [
    { value: 'capability-card', label: 'Capability Card Exchange' },
    { value: 'acp', label: 'ACP (Semantic Negotiation)' },
    { value: 'auction', label: 'Auction (Bid-Based)' },
  ],
  identity: [
    { value: 'local-keys', label: 'Local Key Pairs' },
    { value: 'did', label: 'DID (Decentralized Identifiers)' },
    { value: 'x509', label: 'X.509 Certificates' },
    { value: 'oauth-jwt', label: 'OAuth2 / JWT' },
  ],
  payment: [
    { value: 'mock', label: 'Mock Payments' },
    { value: 'x402-usdc', label: 'x402 USDC (Base Sepolia)' },
    { value: 'lightning-l402', label: 'Lightning L402 (Sats)' },
    { value: 'stripe-fiat', label: 'Stripe (Fiat USD)' },
  ],
  wallet: [
    { value: 'local-keypair', label: 'Local Keypair Wallet' },
    { value: 'coinbase-cdp', label: 'Coinbase CDP (MPC)' },
  ],
  trust: [
    { value: 'allowlist', label: 'Allowlist' },
    { value: 'reputation', label: 'Reputation Score' },
    { value: 'first-contact', label: 'First Contact (Challenge)' },
  ],
  encryption: [
    { value: 'none', label: 'None (Plaintext)' },
    { value: 'envelope', label: 'Envelope (AES + ECDH)' },
    { value: 'tls-mutual', label: 'Mutual TLS (mTLS)' },
  ],
  resilience: [
    { value: 'retry', label: 'Retry with Backoff' },
    { value: 'circuit-breaker', label: 'Circuit Breaker' },
    { value: 'bulkhead', label: 'Bulkhead (Isolation)' },
  ],
  observability: [{ value: 'file-log', label: 'File Logger' }],
  orchestration: [{ value: 'pipeline', label: 'Pipeline' }],
  audit: [
    { value: 'hash-chain', label: 'Hash Chain' },
    { value: 'merkle', label: 'Merkle Tree' },
  ],
};

const stackA = ref<ProtocolConfig>({
  discovery: 'well-known',
  transport: 'http-rest',
  negotiation: 'capability-card',
  identity: 'local-keys',
  payment: 'mock',
  wallet: 'local-keypair',
  trust: 'allowlist',
  encryption: 'none',
  resilience: 'retry',
  observability: 'file-log',
  orchestration: 'pipeline',
  audit: 'hash-chain',
});

const stackB = ref<ProtocolConfig>({
  discovery: 'well-known',
  transport: 'a2a-jsonrpc',
  negotiation: 'acp',
  identity: 'did',
  payment: 'x402-usdc',
  wallet: 'coinbase-cdp',
  trust: 'reputation',
  encryption: 'envelope',
  resilience: 'circuit-breaker',
  observability: 'file-log',
  orchestration: 'pipeline',
  audit: 'hash-chain',
});

const differences = computed(() => {
  return PROTOCOL_LAYERS.filter((layer) => stackA.value[layer] !== stackB.value[layer]);
});

function formatLayerName(layer: string): string {
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}

function getLabel(layer: ProtocolLayer, value: string): string {
  const opt = layerOptions[layer].find((o) => o.value === value);
  return opt ? opt.label : value;
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Protocol Stack Compare</h1>
      <p class="text-gray-400 text-sm mt-1">Compare two protocol stack configurations side by side</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Stack A -->
      <div class="card">
        <h2 class="text-lg font-semibold text-blue-400 mb-4">Stack A</h2>
        <div class="space-y-3">
          <div
            v-for="layer in PROTOCOL_LAYERS"
            :key="`a-${layer}`"
            :class="[
              'bg-gray-900 rounded-lg p-3',
              differences.includes(layer) ? 'ring-1 ring-yellow-500/50' : '',
            ]"
          >
            <label :class="['block text-sm font-medium mb-1.5', LAYER_TEXT_COLORS[layer]]">
              {{ formatLayerName(layer) }}
            </label>
            <select
              v-model="stackA[layer]"
              class="select-field w-full text-sm"
            >
              <option
                v-for="opt in layerOptions[layer]"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Stack B -->
      <div class="card">
        <h2 class="text-lg font-semibold text-purple-400 mb-4">Stack B</h2>
        <div class="space-y-3">
          <div
            v-for="layer in PROTOCOL_LAYERS"
            :key="`b-${layer}`"
            :class="[
              'bg-gray-900 rounded-lg p-3',
              differences.includes(layer) ? 'ring-1 ring-yellow-500/50' : '',
            ]"
          >
            <label :class="['block text-sm font-medium mb-1.5', LAYER_TEXT_COLORS[layer]]">
              {{ formatLayerName(layer) }}
            </label>
            <select
              v-model="stackB[layer]"
              class="select-field w-full text-sm"
            >
              <option
                v-for="opt in layerOptions[layer]"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison summary -->
    <div class="card">
      <h2 class="text-lg font-semibold text-gray-200 mb-4">Comparison Summary</h2>

      <div v-if="differences.length === 0" class="text-center py-4">
        <p class="text-green-400 text-sm">Both stacks are identical.</p>
      </div>

      <div v-else class="space-y-3">
        <p class="text-xs text-gray-400 mb-3">{{ differences.length }} of {{ PROTOCOL_LAYERS.length }} layers differ</p>

        <div
          v-for="layer in differences"
          :key="`diff-${layer}`"
          class="bg-gray-900 rounded-lg p-3 border border-yellow-500/30"
        >
          <div class="flex items-center gap-2 mb-2">
            <div :class="['w-2 h-2 rounded-full', LAYER_COLORS[layer]]" />
            <span :class="['text-sm font-medium', LAYER_TEXT_COLORS[layer]]">{{ formatLayerName(layer) }}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-xs text-gray-400">Stack A:</span>
              <p class="text-sm text-blue-400">{{ getLabel(layer, stackA[layer]) }}</p>
            </div>
            <div>
              <span class="text-xs text-gray-400">Stack B:</span>
              <p class="text-sm text-purple-400">{{ getLabel(layer, stackB[layer]) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
