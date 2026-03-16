import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ServiceItem, Association } from '@/types';
import { fetchSunstreamServices, fetchSunstreamAssociations } from '@/services/api';

export const useSunstreamStore = defineStore('sunstream', () => {
  const services = ref<ServiceItem[]>([]);
  const associations = ref<Association[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Trust info toward FCS and AgriBank
  const trustTowardFcs = ref({ level: 'TRUSTED' as const, score: 80 });
  const trustTowardAgribank = ref({ level: 'MAXIMUM' as const, score: 95 });

  // Circuit breaker states toward clients
  const circuitBreakerFcs = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');
  const circuitBreakerAgribank = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');

  async function loadData() {
    loading.value = true;
    error.value = null;
    try {
      const [servicesResult, associationsResult] = await Promise.all([
        fetchSunstreamServices(),
        fetchSunstreamAssociations(),
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

  function updateCircuitBreaker(target: 'fcs' | 'agribank', state: 'CLOSED' | 'HALF-OPEN' | 'OPEN') {
    if (target === 'fcs') circuitBreakerFcs.value = state;
    else circuitBreakerAgribank.value = state;
  }

  return {
    services,
    associations,
    loading,
    error,
    trustTowardFcs,
    trustTowardAgribank,
    circuitBreakerFcs,
    circuitBreakerAgribank,
    loadData,
    updateCircuitBreaker,
  };
});
