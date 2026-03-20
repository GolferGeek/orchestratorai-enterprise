<script setup lang="ts">
import { computed } from 'vue';
import type { PipelineStep } from '@/services/api';

const props = defineProps<{
  steps: PipelineStep[];
  result?: Record<string, unknown>;
}>();

// Detect quality hold scenario: look for capability-card step with holdInitiated=true
const qualityStep = computed(() =>
  props.steps.find((s) => {
    const d = s.data as Record<string, unknown>;
    return d?.holdInitiated === true;
  }) ?? null,
);

const qualityData = computed(() => {
  if (!qualityStep.value) return null;
  return qualityStep.value.data as Record<string, unknown>;
});

// Find the first data/websocket step which has the inspection result
const inspectionStep = computed(() =>
  props.steps.find((s) => s.layer === 'data') ?? null,
);

const inspectionData = computed(() => {
  if (!inspectionStep.value) return null;
  return inspectionStep.value.data as Record<string, unknown>;
});

const failedTests = computed(() => {
  const d = inspectionData.value;
  if (!d) return [];
  return (d.failedTests as Array<Record<string, unknown>>) ?? [];
});

// Payment step for the Stripe refund
const refundStep = computed(() =>
  props.steps.find((s) => s.layer === 'payment' && s.provider === 'stripe-fiat') ?? null,
);

const refundData = computed(() => {
  if (!refundStep.value) return null;
  return refundStep.value.data as Record<string, unknown>;
});

const severity = computed(() => {
  const d = (props.steps.find((s) => s.layer === 'transport')?.data as Record<string, unknown>);
  return d?.severity ?? 'HIGH';
});

const severityColor = computed(() => {
  if (severity.value === 'HIGH') return 'bg-red-800/40 border-red-600 text-red-200';
  if (severity.value === 'MEDIUM') return 'bg-amber-800/40 border-amber-600 text-amber-200';
  return 'bg-yellow-800/40 border-yellow-600 text-yellow-200';
});
</script>

<template>
  <div v-if="qualityStep || inspectionStep" class="space-y-3">
    <!-- Main alert banner -->
    <div class="rounded-xl border p-4 space-y-3" :class="severityColor">
      <div class="flex items-center gap-2">
        <span class="text-2xl">⚠</span>
        <div>
          <h3 class="font-bold text-base">Quality Hold — Out-of-Spec Batch</h3>
          <div class="text-xs opacity-75">Severity: {{ severity }}</div>
        </div>
      </div>

      <div v-if="inspectionData" class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="opacity-60">Batch: </span>
          <span class="font-mono font-medium">{{ inspectionData.batchNumber }}</span>
        </div>
        <div>
          <span class="opacity-60">Product: </span>
          <span class="font-medium">{{ inspectionData.productCode }}</span>
        </div>
        <div>
          <span class="opacity-60">Facility: </span>
          <span>{{ inspectionData.facility }}</span>
        </div>
        <div>
          <span class="opacity-60">Disposition: </span>
          <span class="font-medium">{{ inspectionData.disposition }}</span>
        </div>
      </div>
    </div>

    <!-- Failed test parameters -->
    <div v-if="failedTests.length > 0" class="rounded-xl border border-red-700/40 bg-gray-800 p-3 space-y-2">
      <h4 class="text-xs font-medium text-red-400 uppercase tracking-wide">Failed Test Parameters</h4>
      <div
        v-for="(test, idx) in failedTests"
        :key="idx"
        class="flex items-center gap-3 text-xs bg-red-900/20 rounded-lg px-3 py-2"
      >
        <span class="text-red-300 font-medium w-24 truncate">{{ test.parameter }}</span>
        <span class="text-red-400 font-mono">{{ test.value }}{{ test.unit }}</span>
        <span class="text-gray-500">vs max</span>
        <span class="text-gray-400 font-mono">{{ test.maxSpec }}{{ test.unit }}</span>
        <span class="ml-auto text-red-400 text-xs">+{{ Number(Number(test.value) - Number(test.maxSpec)).toFixed(0) }} over</span>
      </div>
    </div>

    <!-- Notification chain visualization -->
    <div class="rounded-xl border border-gray-700 bg-gray-800 p-3 space-y-2">
      <h4 class="text-xs font-medium text-gray-400 uppercase tracking-wide">Notification Chain</h4>
      <div class="flex items-center gap-2 text-xs">
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-green-500/20 border border-green-600 flex items-center justify-center text-green-400 text-xs font-bold">LT</div>
          <span class="text-gray-500 text-xs">AlloyTech Supply</span>
          <span class="text-green-400 text-xs">Detected</span>
        </div>
        <div class="flex-1 h-0.5 bg-gradient-to-r from-green-600 via-amber-500 to-amber-600" />
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-600 flex items-center justify-center text-amber-400 text-xs font-bold">AS</div>
          <span class="text-gray-500 text-xs">Buildwell</span>
          <span class="text-amber-400 text-xs">Hold Issued</span>
        </div>
        <div class="flex-1 h-0.5 bg-gradient-to-r from-amber-600 via-blue-500 to-blue-600" />
        <div class="flex flex-col items-center gap-1">
          <div class="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-600 flex items-center justify-center text-blue-400 text-xs font-bold">OEM</div>
          <span class="text-gray-500 text-xs">OEM</span>
          <span class="text-blue-400 text-xs">Notified</span>
        </div>
      </div>
    </div>

    <!-- Stripe refund card -->
    <div v-if="refundData" class="rounded-xl border border-green-700/40 bg-green-900/10 p-3 space-y-2">
      <h4 class="text-xs font-medium text-green-400 uppercase tracking-wide">Stripe Credit Initiated</h4>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-gray-500">Amount: </span>
          <span class="text-green-400 font-mono">
            ${{ Number(refundData.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }} {{ refundData.currency }}
          </span>
        </div>
        <div>
          <span class="text-gray-500">Type: </span>
          <span class="text-gray-300">{{ refundData.creditType }}</span>
        </div>
        <div>
          <span class="text-gray-500">Order: </span>
          <span class="font-mono text-gray-300">{{ refundData.orderId }}</span>
        </div>
        <div>
          <span class="text-gray-500">Status: </span>
          <span class="text-yellow-400">{{ refundData.status }}</span>
        </div>
        <div class="col-span-2">
          <span class="text-gray-500">Settlement: </span>
          <span class="text-gray-300">{{ refundData.estimatedSettlement }}</span>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-sm text-gray-600 text-center py-4">
    No quality hold in this trace.<br>
    Run scenario 8 (Quality Hold) to see this view.
  </div>
</template>
