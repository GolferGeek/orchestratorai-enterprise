import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ServiceItem, Association } from '@/types';
import { fetchPrairieRidgeServices, fetchPrairieRidgeAssociations } from '@/services/api';

export const usePrairieRidgeStore = defineStore('prairie-ridge', () => {
  const services = ref<ServiceItem[]>([]);
  const associations = ref<Association[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Trust info toward FCS and Central Farm Bank
  const trustTowardFcs = ref({ level: 'TRUSTED' as const, score: 80 });
  const trustTowardCentralFarmBank = ref({ level: 'MAXIMUM' as const, score: 95 });

  // Circuit breaker states toward clients
  const circuitBreakerFcs = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');
  const circuitBreakerCentralFarmBank = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');

  async function loadData() {
    loading.value = true;
    error.value = null;
    try {
      const [servicesResult, associationsResult] = await Promise.all([
        fetchPrairieRidgeServices(),
        fetchPrairieRidgeAssociations(),
      ]);
      services.value = servicesResult;
      associations.value = associationsResult;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function updateCircuitBreaker(target: 'fcs' | 'central-farm-bank', state: 'CLOSED' | 'HALF-OPEN' | 'OPEN') {
    if (target === 'fcs') circuitBreakerFcs.value = state;
    else circuitBreakerCentralFarmBank.value = state;
  }

  return {
    services,
    associations,
    loading,
    error,
    trustTowardFcs,
    trustTowardCentralFarmBank,
    circuitBreakerFcs,
    circuitBreakerCentralFarmBank,
    loadData,
    updateCircuitBreaker,
  };
});
