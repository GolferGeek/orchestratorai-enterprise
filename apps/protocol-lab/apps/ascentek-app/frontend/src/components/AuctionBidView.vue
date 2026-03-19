<script setup lang="ts">
import { computed } from 'vue';
import type { PipelineStep } from '@/services/api';

const props = defineProps<{
  steps: PipelineStep[];
  result?: Record<string, unknown>;
}>();

// Look for auction step
const auctionStep = computed(() =>
  props.steps.find((s) => s.provider === 'auction') ?? null,
);

const auctionData = computed(() => {
  if (!auctionStep.value) return null;
  return auctionStep.value.data as Record<string, unknown>;
});

// Look for the bid deposit payment step (lightning)
const depositStep = computed(() =>
  props.steps.find((s) => s.provider === 'lightning-l402') ?? null,
);

const depositData = computed(() => {
  if (!depositStep.value) return null;
  return depositStep.value.data as Record<string, unknown>;
});

const depositMetadata = computed(() => depositStep.value?.metadata ?? {});

// Extract bid parameters from result if available
const bidParams = computed(() => {
  const r = props.result;
  if (!r) return null;
  return r.bidParameters as Record<string, unknown> | null;
});

const bidResult = computed(() => {
  const r = props.result;
  if (!r) return null;
  return r.bidResult as Record<string, unknown> | null;
});

const winningBid = computed(() => {
  const r = props.result;
  if (!r) return null;
  return r.winningBid as Record<string, unknown> | null;
});

const satoshis = computed(() => {
  const usd = Number(depositMetadata.value.paymentAmount ?? 0);
  if (!usd) return null;
  return Math.round((usd / 65000) * 1e8);
});
</script>

<template>
  <div v-if="auctionStep || bidParams" class="space-y-3">
    <!-- Bid parameters -->
    <div class="rounded-xl border border-amber-700/40 bg-amber-900/10 p-4 space-y-3">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🏷</span>
        <div>
          <h3 class="font-bold text-amber-400 text-sm">Competitive Bid / Auction</h3>
          <div class="text-xs text-gray-500">OEM puts large order out for bid</div>
        </div>
      </div>

      <div v-if="bidParams" class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-gray-500 mb-0.5">Spec Code</div>
          <div class="font-mono font-medium text-gray-200">{{ bidParams.specCode }}</div>
        </div>
        <div>
          <div class="text-gray-500 mb-0.5">Quantity</div>
          <div class="text-gray-200">{{ Number(bidParams.quantityGallons).toLocaleString() }} gal</div>
        </div>
        <div>
          <div class="text-gray-500 mb-0.5">Max Price / Gal</div>
          <div class="text-red-400 font-mono">${{ Number(bidParams.maxPricePerGallon).toFixed(2) }}</div>
        </div>
      </div>
    </div>

    <!-- Ascentek response -->
    <div v-if="bidResult || winningBid" class="rounded-xl border border-green-700/40 bg-green-900/10 p-4 space-y-3">
      <h4 class="text-xs font-medium text-green-400 uppercase tracking-wide">Ascentek Matching Formulation</h4>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div v-if="winningBid?.productCode">
          <div class="text-gray-500 mb-0.5">Product Code</div>
          <div class="font-mono font-medium text-gray-200">{{ winningBid.productCode }}</div>
        </div>
        <div v-if="winningBid?.formulation">
          <div class="text-gray-500 mb-0.5">Formulation</div>
          <div class="text-gray-200">{{ winningBid.formulation }}</div>
        </div>
        <div v-if="winningBid?.bidPricePerGallon">
          <div class="text-gray-500 mb-0.5">Bid Price / Gal</div>
          <div class="text-green-400 font-mono font-bold">${{ Number(winningBid.bidPricePerGallon).toFixed(2) }}</div>
        </div>
        <div v-if="winningBid?.bidTotalPrice">
          <div class="text-gray-500 mb-0.5">Total Bid</div>
          <div class="text-green-400 font-mono">${{ Number(winningBid.bidTotalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</div>
        </div>
        <div v-if="winningBid?.leadTimeDays">
          <div class="text-gray-500 mb-0.5">Lead Time</div>
          <div class="text-gray-200">{{ winningBid.leadTimeDays }} days</div>
        </div>
        <div v-if="winningBid?.marginBelowMax">
          <div class="text-gray-500 mb-0.5">Below Max</div>
          <div class="text-green-400">${{ Number(winningBid.marginBelowMax).toFixed(2) }}/gal</div>
        </div>
      </div>
    </div>

    <!-- Auction pipeline step details -->
    <div v-if="auctionData" class="rounded-xl border border-gray-700 bg-gray-800 p-3 space-y-2">
      <h4 class="text-xs font-medium text-gray-400 uppercase tracking-wide">Auction Protocol</h4>
      <pre class="text-xs text-gray-300 bg-gray-900 rounded-lg p-2 overflow-x-auto max-h-32 overflow-y-auto">{{ JSON.stringify(auctionData, null, 2) }}</pre>
    </div>

    <!-- Bid deposit via Lightning -->
    <div v-if="depositStep" class="rounded-xl border border-yellow-700/40 bg-yellow-900/10 p-3 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-yellow-400">⚡</span>
        <h4 class="text-xs font-medium text-yellow-400 uppercase tracking-wide">Bid Deposit — Lightning</h4>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-gray-500 mb-0.5">Amount</div>
          <div class="text-green-400 font-mono">${{ Number(depositMetadata.paymentAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</div>
        </div>
        <div v-if="satoshis">
          <div class="text-gray-500 mb-0.5">Satoshis</div>
          <div class="text-yellow-400 font-mono">{{ satoshis.toLocaleString() }} sat</div>
        </div>
        <div v-if="depositData?.status">
          <div class="text-gray-500 mb-0.5">Status</div>
          <div class="text-gray-300 capitalize">{{ depositData.status }}</div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-sm text-gray-600 text-center py-4">
    No auction bid in this trace.<br>
    Run scenario 9 (Competitive Bid) to see this view.
  </div>
</template>
