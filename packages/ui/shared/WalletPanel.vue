<script setup lang="ts">
import { computed } from 'vue';
import type { WalletState } from '../../types';

const props = defineProps<{
  wallet: WalletState;
}>();

const truncatedAddress = computed(() => {
  const addr = props.wallet.address;
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
});
</script>

<template>
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-medium text-gray-400">Wallet</h3>
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-green-500"></span>
        <span class="text-xs text-gray-400">{{ props.wallet.network }}</span>
      </div>
    </div>

    <div class="mb-4">
      <p class="text-xs text-gray-400 mb-1">Address</p>
      <div class="flex items-center gap-2">
        <span class="text-sm font-mono text-gray-300">{{ truncatedAddress }}</span>
        <button
          class="text-xs text-gray-400 hover:text-gray-300 transition-colors"
          title="Copy address"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="mb-3">
      <p class="text-xs text-gray-400 mb-1">Balance</p>
      <div class="flex items-baseline gap-1.5">
        <span class="text-3xl font-bold text-white">{{ props.wallet.balance }}</span>
        <span class="text-lg text-gray-400">{{ props.wallet.currency }}</span>
      </div>
    </div>

    <div class="text-xs text-gray-400">
      Provider: {{ props.wallet.provider }}
    </div>
  </div>
</template>
