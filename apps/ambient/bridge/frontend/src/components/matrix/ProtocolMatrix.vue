<script setup lang="ts">
import { PROTOCOL_LAYERS, type ProtocolLayer } from '../../types';

type Status = 'implemented' | 'na';

interface SuiteColumn {
  id: string;
  label: string;
  presetId?: string;
  providers: Partial<Record<ProtocolLayer, string>>;
}

const suites: SuiteColumn[] = [
  {
    id: 'generic',
    label: 'Your Generics',
    providers: {
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
    },
  },
  {
    id: 'a2a',
    label: 'A2A',
    presetId: 'a2a-full',
    providers: {
      discovery: 'a2a-agent-card',
      transport: 'a2a-jsonrpc',
      negotiation: 'a2a-skill-negotiation',
      identity: 'oauth-jwt',
      trust: 'a2a-jws-trust',
      encryption: 'tls-mutual',
      resilience: 'circuit-breaker',
      observability: 'opentelemetry',
      orchestration: 'a2a-task-lifecycle',
      audit: 'hash-chain',
    },
  },
  {
    id: 'agntcy',
    label: 'AGNTCY ACP',
    presetId: 'agntcy-full',
    providers: {
      discovery: 'agntcy-oasf',
      transport: 'http-rest',
      identity: 'agntcy-crypto-identity',
      trust: 'reputation',
      encryption: 'agntcy-slim',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    },
  },
  {
    id: 'commerce',
    label: 'Commerce ACP',
    presetId: 'commerce-acp',
    providers: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'commerce-cart-negotiation',
      identity: 'oauth-jwt',
      payment: 'commerce-checkout',
      trust: 'allowlist',
      encryption: 'tls-mutual',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'commerce-checkout-fsm',
      audit: 'hash-chain',
    },
  },
  {
    id: 'coinbase',
    label: 'Coinbase',
    presetId: 'a2a-ap2',
    providers: {
      discovery: 'a2a-agent-card',
      transport: 'a2a-jsonrpc',
      negotiation: 'a2a-skill-negotiation',
      identity: 'oauth-jwt',
      payment: 'x402-usdc',
      wallet: 'coinbase-cdp',
      trust: 'a2a-jws-trust',
      encryption: 'tls-mutual',
      resilience: 'circuit-breaker',
      observability: 'opentelemetry',
      orchestration: 'a2a-task-lifecycle',
      audit: 'hash-chain',
    },
  },
];

const bundleProviders = [
  ['a2a-agent-card', 'oauth-jwt', 'a2a-task-lifecycle'],
  ['commerce-cart-negotiation', 'commerce-checkout', 'commerce-checkout-fsm'],
  ['x402-usdc', 'coinbase-cdp'],
];

const emit = defineEmits<{
  (e: 'select-cell', payload: { layer: ProtocolLayer; suiteId: string; provider: string; status: Status }): void;
  (e: 'load-preset', presetId: string): void;
}>();

function statusFor(provider: string | undefined): Status {
  return provider ? 'implemented' : 'na';
}

function cellClasses(provider: string | undefined): string {
  const base = 'border px-2 py-2 text-xs rounded-md transition-colors';
  if (!provider) {
    return `${base} border-slate-700 bg-slate-900/50 text-slate-500`;
  }
  const isBundled = bundleProviders.some((bundle) => bundle.includes(provider));
  if (isBundled) {
    return `${base} border-cyan-600/60 bg-cyan-900/20 text-cyan-200`;
  }
  return `${base} border-emerald-600/40 bg-emerald-900/20 text-emerald-200`;
}

function onCellClick(layer: ProtocolLayer, suite: SuiteColumn): void {
  const provider = suite.providers[layer];
  if (!provider) return;
  emit('select-cell', {
    layer,
    suiteId: suite.id,
    provider,
    status: statusFor(provider),
  });
}

function onHeaderClick(suite: SuiteColumn): void {
  if (!suite.presetId) return;
  emit('load-preset', suite.presetId);
}

function layerLabel(layer: string): string {
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-slate-700">
    <table class="min-w-full border-collapse">
      <thead>
        <tr class="bg-slate-900/80">
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 border-b border-slate-700">Layer</th>
          <th
            v-for="suite in suites"
            :key="suite.id"
            class="px-3 py-2 text-left text-xs font-semibold text-slate-300 border-b border-slate-700"
          >
            <button class="hover:text-white" :data-testid="`matrix-header-${suite.id}`" @click="onHeaderClick(suite)">
              {{ suite.label }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="layer in PROTOCOL_LAYERS" :key="layer" class="border-b border-slate-800">
          <td class="px-3 py-2 text-xs text-slate-300 font-medium">
            {{ layerLabel(layer) }}
          </td>
          <td v-for="suite in suites" :key="`${layer}-${suite.id}`" class="px-2 py-2">
            <button
              :class="cellClasses(suite.providers[layer])"
              :disabled="!suite.providers[layer]"
              :data-testid="`matrix-cell-${layer}-${suite.id}`"
              @click="onCellClick(layer, suite)"
            >
              {{ suite.providers[layer] ?? 'N/A' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
