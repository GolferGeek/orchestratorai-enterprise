import { defineStore } from 'pinia';
import { ref } from 'vue';
import { buildwellApi, transactionsApi } from '@/services/api';

export interface OrgMessage {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  method: string;
  layer: string;
  provider: string;
  summary: string;
}

export const useBuildwellStore = defineStore('buildwell', () => {
  const formulations = ref<unknown[]>([]);
  const specs = ref<unknown[]>([]);
  const pricing = ref<unknown[]>([]);
  const partners = ref<unknown[]>([]);
  const transactions = ref<unknown[]>([]);
  const messages = ref<OrgMessage[]>([]);
  const trustScore = ref(85);
  const trustLevel = ref('TRUSTED');
  const circuitBreakerState = ref<'CLOSED' | 'OPEN' | 'HALF_OPEN'>('CLOSED');
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [f, s, p, pa, tx] = await Promise.all([
        buildwellApi.getFormulations(),
        buildwellApi.getSpecs(),
        buildwellApi.getPricing(),
        buildwellApi.getPartners(),
        transactionsApi.getBuildwellTransactions().catch(() => ({ records: [] })),
      ]);
      formulations.value = f;
      specs.value = s;
      pricing.value = p;
      partners.value = pa;
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
    formulations,
    specs,
    pricing,
    partners,
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
