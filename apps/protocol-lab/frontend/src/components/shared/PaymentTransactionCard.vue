<script setup lang="ts">
import { computed } from 'vue';
import type { PaymentTransaction } from '../../types';

const props = defineProps<{
  transaction: PaymentTransaction;
}>();

const statusConfig = computed(() => {
  switch (props.transaction.status) {
    case 'verified':
      return { color: 'border-green-500', badge: 'bg-green-900 text-green-300', label: 'VERIFIED' };
    case 'pending':
      return { color: 'border-yellow-500', badge: 'bg-yellow-900 text-yellow-300', label: 'PENDING' };
    case 'failed':
      return { color: 'border-red-500', badge: 'bg-red-900 text-red-300', label: 'FAILED' };
  }
});

const truncatedHash = computed(() => {
  const hash = props.transaction.transactionHash;
  if (!hash) return null;
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
});

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}
</script>

<template>
  <div :class="['card border-l-4', statusConfig.color]">
    <div class="flex items-start justify-between mb-3">
      <div>
        <span class="text-2xl font-bold text-white">{{ props.transaction.amount }}</span>
        <span class="text-lg font-semibold text-gray-300 ml-1">{{ props.transaction.currency }}</span>
      </div>
      <span :class="['text-xs font-medium px-2 py-1 rounded', statusConfig.badge]">
        {{ statusConfig.label }}
      </span>
    </div>

    <div class="flex items-center gap-2 text-sm text-gray-300 mb-3">
      <span class="font-medium">{{ props.transaction.fromAgent }}</span>
      <span class="text-gray-400">&rarr;</span>
      <span class="font-medium">{{ props.transaction.toAgent }}</span>
    </div>

    <div class="flex items-center gap-2 mb-3">
      <span class="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{{ props.transaction.provider }}</span>
    </div>

    <div v-if="truncatedHash" class="mb-3">
      <p class="text-xs text-gray-400 mb-0.5">Transaction Hash</p>
      <p class="text-sm font-mono text-gray-400">{{ truncatedHash }}</p>
    </div>

    <div class="flex items-center justify-between text-xs text-gray-400">
      <span>Created: {{ formatTimestamp(props.transaction.createdAt) }}</span>
      <span v-if="props.transaction.settledAt">Settled: {{ formatTimestamp(props.transaction.settledAt) }}</span>
    </div>
  </div>
</template>
