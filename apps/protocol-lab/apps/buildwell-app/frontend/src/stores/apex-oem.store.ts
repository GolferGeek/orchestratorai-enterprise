import { defineStore } from 'pinia';
import { ref } from 'vue';
import { oemApi, transactionsApi } from '@/services/api';
import type { OrgMessage } from './buildwell.store';

export const useApexOemStore = defineStore('apexOem', () => {
  const purchaseOrders = ref<unknown[]>([]);
  const specRequirements = ref<unknown[]>([]);
  const orderHistory = ref<unknown[]>([]);
  const qualityComplaints = ref<unknown[]>([]);
  const approvedSuppliers = ref<unknown[]>([]);
  const transactions = ref<unknown[]>([]);
  const messages = ref<OrgMessage[]>([]);
  const trustScore = ref(72);
  const trustLevel = ref('ESTABLISHED');
  const circuitBreakerState = ref<'CLOSED' | 'OPEN' | 'HALF_OPEN'>('CLOSED');
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [po, sr, oh, qc, as_, tx] = await Promise.all([
        oemApi.getPurchaseOrders(),
        oemApi.getSpecRequirements(),
        oemApi.getOrderHistory(),
        oemApi.getQualityComplaints(),
        oemApi.getApprovedSuppliers(),
        transactionsApi.getOemTransactions().catch(() => ({ records: [] })),
      ]);
      purchaseOrders.value = po;
      specRequirements.value = sr;
      orderHistory.value = oh;
      qualityComplaints.value = qc;
      approvedSuppliers.value = as_;
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

  function clearMessages(): void {
    messages.value = [];
  }

  return {
    purchaseOrders,
    specRequirements,
    orderHistory,
    qualityComplaints,
    approvedSuppliers,
    transactions,
    messages,
    trustScore,
    trustLevel,
    circuitBreakerState,
    loading,
    error,
    fetchAll,
    addMessage,
    updateTrust,
    setCircuitBreaker,
    clearMessages,
  };
});
