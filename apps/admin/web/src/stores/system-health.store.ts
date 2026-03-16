/**
 * System Health Store
 * State management for system health status — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SystemHealthReport } from '@/services/admin-api.service';

export const useSystemHealthStore = defineStore('system-health', () => {
  // ===================== State =====================
  const report = ref<SystemHealthReport | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Mutations =====================
  function setReport(data: SystemHealthReport | null) {
    report.value = data;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    report.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    report,
    loading,
    error,
    setReport,
    setLoading,
    setError,
    reset,
  };
});
