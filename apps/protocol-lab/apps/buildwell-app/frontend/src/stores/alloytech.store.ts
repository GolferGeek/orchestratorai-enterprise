import { defineStore } from 'pinia';
import { ref } from 'vue';
import { alloytechApi, transactionsApi } from '@/services/api';
import type { OrgMessage } from './buildwell.store';

export const useAlloytechStore = defineStore('alloytech', () => {
  const production = ref<unknown[]>([]);
  const inventory = ref<unknown[]>([]);
  const batches = ref<unknown[]>([]);
  const qualityStandards = ref<unknown[]>([]);
  const transactions = ref<unknown[]>([]);
  const messages = ref<OrgMessage[]>([]);
  const trustScore = ref(100);
  const trustLevel = ref('INTERNAL');
  const circuitBreakerState = ref<'CLOSED' | 'OPEN' | 'HALF_OPEN'>('CLOSED');
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Track which batch IDs were involved in the last quality hold
  const qualityHoldBatches = ref<string[]>([]);

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [p, i, b, qs, tx] = await Promise.all([
        alloytechApi.getProduction(),
        alloytechApi.getInventory(),
        alloytechApi.getBatches(),
        alloytechApi.getQualityStandards(),
        transactionsApi.getAlloytechTransactions().catch(() => ({ records: [] })),
      ]);
      production.value = p;
      inventory.value = i;
      batches.value = b;
      qualityStandards.value = qs;
      const txData = tx as { records?: unknown[] };
      transactions.value = txData.records ?? [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function addMessage(msg: OrgMessage): void {
    messages.value.unshift(msg);
    if (messages.value.length > 20) {
      messages.value = messages.value.slice(0, 20);
    }
  }

  function updateTrust(score: number, level: string): void {
    trustScore.value = score;
    trustLevel.value = level;
  }

  function setCircuitBreaker(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    circuitBreakerState.value = state;
  }

  function markQualityHold(batchNumbers: string[]): void {
    qualityHoldBatches.value = batchNumbers;
  }

  function clearMessages(): void {
    messages.value = [];
  }

  return {
    production,
    inventory,
    batches,
    qualityStandards,
    transactions,
    messages,
    trustScore,
    trustLevel,
    circuitBreakerState,
    qualityHoldBatches,
    loading,
    error,
    fetchAll,
    addMessage,
    updateTrust,
    setCircuitBreaker,
    markQualityHold,
    clearMessages,
  };
});
