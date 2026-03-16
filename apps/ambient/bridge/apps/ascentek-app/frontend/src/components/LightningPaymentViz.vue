<script setup lang="ts">
import { computed } from 'vue';
import type { PipelineStep } from '@/services/api';

const props = defineProps<{
  steps: PipelineStep[];
}>();

// Extract the payment step with layer='payment' and provider='lightning-l402'
const paymentStep = computed(() =>
  props.steps.find((s) => s.layer === 'payment' && s.provider === 'lightning-l402') ?? null,
);

const paymentData = computed(() => {
  if (!paymentStep.value) return null;
  return paymentStep.value.data as Record<string, unknown>;
});

const metadata = computed(() => paymentStep.value?.metadata ?? {});

// Derive satoshis from USD amount (1 BTC ~ $65,000 for display)
const satoshis = computed(() => {
  const usd = Number(metadata.value.paymentAmount ?? 0);
  if (!usd) return null;
  return Math.round((usd / 65000) * 1e8);
});

const statusColor = computed(() => {
  const status = String(paymentData.value?.status ?? 'unknown');
  if (status === 'settled' || status === 'paid') return 'text-green-400';
  if (status === 'pending') return 'text-yellow-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-gray-400';
});
</script>

<template>
  <div v-if="paymentStep" class="rounded-xl border border-yellow-700/40 bg-yellow-900/10 p-4 space-y-3">
    <div class="flex items-center gap-2">
      <!-- Lightning bolt icon -->
      <span class="text-yellow-400 text-lg">⚡</span>
      <h3 class="text-yellow-400 font-semibold text-sm">Lightning Network Payment</h3>
      <span class="ml-auto text-xs text-gray-500">{{ paymentStep.provider }}</span>
    </div>

    <!-- Payment channel visualization -->
    <div class="flex items-center gap-2 text-xs">
      <div class="flex-1 text-center bg-gray-800 rounded-lg py-2 border border-gray-700">
        <div class="text-blue-400 font-medium">OEM Partner</div>
        <div class="text-gray-500 text-xs">payer</div>
      </div>
      <div class="flex flex-col items-center gap-0.5">
        <div class="text-yellow-400 text-xs">⚡ channel</div>
        <div class="h-0.5 w-12 bg-gradient-to-r from-blue-500 via-yellow-500 to-amber-500 rounded" />
        <div class="text-xs text-gray-500">L402</div>
      </div>
      <div class="flex-1 text-center bg-gray-800 rounded-lg py-2 border border-gray-700">
        <div class="text-amber-400 font-medium">Ascentek</div>
        <div class="text-gray-500 text-xs">payee</div>
      </div>
    </div>

    <!-- Amount row -->
    <div class="flex gap-4 text-xs">
      <div>
        <div class="text-gray-500 mb-0.5">Amount (USD)</div>
        <div class="text-green-400 font-mono font-medium">
          ${{ Number(metadata.paymentAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
        </div>
      </div>
      <div v-if="satoshis">
        <div class="text-gray-500 mb-0.5">Satoshis</div>
        <div class="text-yellow-400 font-mono font-medium">{{ satoshis.toLocaleString() }} sat</div>
      </div>
      <div v-if="metadata.paymentCurrency">
        <div class="text-gray-500 mb-0.5">Currency</div>
        <div class="text-gray-300 font-mono">{{ metadata.paymentCurrency }}</div>
      </div>
    </div>

    <!-- Invoice + tx hash -->
    <div class="space-y-2 text-xs">
      <div v-if="paymentData?.invoiceString">
        <div class="text-gray-500 mb-0.5">Invoice</div>
        <div class="font-mono text-yellow-300 bg-gray-900 rounded px-2 py-1 truncate border border-gray-700">
          {{ paymentData.invoiceString }}
        </div>
      </div>
      <div v-if="paymentData?.txHash">
        <div class="text-gray-500 mb-0.5">Tx Hash</div>
        <div class="font-mono text-gray-400 bg-gray-900 rounded px-2 py-1 truncate border border-gray-700">
          {{ paymentData.txHash }}
        </div>
      </div>
    </div>

    <!-- Status -->
    <div v-if="paymentData?.status" class="flex items-center gap-2 text-xs">
      <span class="text-gray-500">Status:</span>
      <span :class="statusColor" class="font-medium capitalize">{{ paymentData.status }}</span>
    </div>

    <div class="text-xs text-gray-600 border-t border-gray-700 pt-2">
      Step {{ paymentStep.stepNumber }} · {{ paymentStep.durationMs }}ms
    </div>
  </div>

  <div v-else class="text-sm text-gray-600 text-center py-4">
    No Lightning payment in this trace.<br>
    Run scenario 6 (Purchase Order) to see Lightning viz.
  </div>
</template>
