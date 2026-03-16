/**
 * Observability Store
 * State management for observability events and metrics — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ObservabilityEvent, ObservabilityMetrics } from '@/services/admin-api.service';

export const useObservabilityStore = defineStore('observability', () => {
  // ===================== State =====================
  const events = ref<ObservabilityEvent[]>([]);
  const metrics = ref<ObservabilityMetrics | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Mutations =====================
  function setEvents(data: ObservabilityEvent[]) {
    events.value = data;
  }

  function setMetrics(data: ObservabilityMetrics | null) {
    metrics.value = data;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    events.value = [];
    metrics.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    events,
    metrics,
    loading,
    error,
    setEvents,
    setMetrics,
    setLoading,
    setError,
    reset,
  };
});
