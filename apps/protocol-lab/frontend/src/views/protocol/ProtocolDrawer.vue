<script setup lang="ts">
import { ref, watch } from 'vue';
import { useProtocolStore } from '../../stores/protocol.store';
import { PROTOCOL_LAYERS, LAYER_TEXT_COLORS } from '../../types';
import type { ProtocolConfig, ProtocolLayer } from '../../types';

const protocolStore = useProtocolStore();

const localConfig = ref<ProtocolConfig>({ ...protocolStore.currentConfig });
const applyError = ref<string | null>(null);

watch(() => protocolStore.currentConfig, (newConfig) => {
  localConfig.value = { ...newConfig };
}, { deep: true });

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
  observability: [
    { value: 'file-log', label: 'File Logger' },
    { value: 'opentelemetry', label: 'OpenTelemetry (OTLP)' },
  ],
  orchestration: [{ value: 'pipeline', label: 'Pipeline' }],
  audit: [{ value: 'hash-chain', label: 'Hash-Chain (Tamper-Proof)' }],
};

function formatLayerName(layer: string): string {
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}

async function applyConfig() {
  applyError.value = null;
  try {
    await protocolStore.updateConfig(localConfig.value);
    protocolStore.toggleDrawer();
  } catch (e) {
    applyError.value = e instanceof Error ? e.message : String(e);
  }
}

function handlePresetSelect(event: Event) {
  const target = event.target as HTMLSelectElement;
  if (target.value) {
    const preset = protocolStore.presets.find((p) => p.id === target.value);
    if (preset) {
      localConfig.value = { ...preset.config };
    }
  }
}

function formatTestResult(result: any): string {
  if (!result) return '';
  try {
    return JSON.stringify(result.result, null, 2);
  } catch {
    return String(result.result);
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="protocolStore.drawerOpen"
        class="fixed inset-0 z-[60]"
      >
        <div
          class="absolute inset-0 bg-black/50"
          @click="protocolStore.toggleDrawer()"
        />
        <div class="absolute right-0 top-0 bottom-0 w-[480px] bg-gray-800 border-l border-gray-700 overflow-y-auto shadow-2xl">
          <div class="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Protocol Stack Configuration</h2>
            <button
              class="text-gray-400 hover:text-white"
              @click="protocolStore.toggleDrawer()"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Preset</label>
              <select class="select-field w-full" @change="handlePresetSelect">
                <option value="">Custom</option>
                <option
                  v-for="preset in protocolStore.presets"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }} - {{ preset.description }}
                </option>
              </select>
            </div>

            <div class="border-t border-gray-700 pt-4 space-y-3">
              <div
                v-for="layer in PROTOCOL_LAYERS"
                :key="layer"
                class="bg-gray-900 rounded-lg p-3"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <label
                    :class="['block text-sm font-medium', LAYER_TEXT_COLORS[layer]]"
                  >
                    {{ formatLayerName(layer) }}
                  </label>
                  <button
                    class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
                    :disabled="protocolStore.testingLayer === layer"
                    @click="protocolStore.testLayer(layer)"
                  >
                    <template v-if="protocolStore.testingLayer === layer">
                      Testing...
                    </template>
                    <template v-else>
                      Test
                    </template>
                  </button>
                </div>
                <select
                  v-model="localConfig[layer]"
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

                <!-- Test Result -->
                <div
                  v-if="protocolStore.testResults[layer]"
                  class="mt-2"
                >
                  <div
                    :class="[
                      'text-xs px-2 py-1 rounded inline-flex items-center gap-1',
                      protocolStore.testResults[layer].success
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-red-900/40 text-red-400'
                    ]"
                  >
                    <span>{{ protocolStore.testResults[layer].success ? 'PASS' : 'FAIL' }}</span>
                    <span class="text-gray-500">|</span>
                    <span>{{ protocolStore.testResults[layer].provider }}</span>
                    <span class="text-gray-500">|</span>
                    <span>{{ protocolStore.testResults[layer].durationMs }}ms</span>
                  </div>
                  <pre class="mt-1 text-xs text-gray-400 bg-gray-950 p-2 rounded max-h-32 overflow-auto font-mono">{{ formatTestResult(protocolStore.testResults[layer]) }}</pre>
                </div>
              </div>
            </div>

            <div v-if="applyError" class="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
              {{ applyError }}
            </div>

            <div class="flex gap-3 pt-2">
              <button class="btn-primary flex-1" @click="applyConfig">
                Apply Configuration
              </button>
              <button class="btn-secondary" @click="protocolStore.toggleDrawer()">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
