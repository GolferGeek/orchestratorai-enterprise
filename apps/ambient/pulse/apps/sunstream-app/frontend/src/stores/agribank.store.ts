import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ExaminationCriteria, CapitalRequirement, AssociationRating, RiskConcentrationLimit } from '@/types';
import {
  fetchAgribankExaminationCriteria,
  fetchAgribankCapitalRequirements,
  fetchAgribankRatings,
  fetchAgribankRiskLimits,
} from '@/services/api';

export const useAgribankStore = defineStore('agribank', () => {
  const examinationCriteria = ref<ExaminationCriteria[]>([]);
  const capitalRequirements = ref<CapitalRequirement[]>([]);
  const ratings = ref<AssociationRating[]>([]);
  const riskLimits = ref<RiskConcentrationLimit[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Trust toward SunStream — AgriBank has maximum trust as the regulator
  const trustTowardSunstream = ref({ level: 'MAXIMUM' as const, score: 95 });

  // Circuit breaker toward SunStream
  const circuitBreakerSunstream = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');

  async function loadData() {
    loading.value = true;
    error.value = null;
    try {
      const [criteriaResult, requirementsResult, ratingsResult, limitsResult] = await Promise.all([
        fetchAgribankExaminationCriteria(),
        fetchAgribankCapitalRequirements(),
        fetchAgribankRatings(),
        fetchAgribankRiskLimits(),
      ]);
      examinationCriteria.value = criteriaResult;
      capitalRequirements.value = requirementsResult;
      ratings.value = ratingsResult;
      riskLimits.value = limitsResult;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function updateCircuitBreaker(state: 'CLOSED' | 'HALF-OPEN' | 'OPEN') {
    circuitBreakerSunstream.value = state;
  }

  return {
    examinationCriteria,
    capitalRequirements,
    ratings,
    riskLimits,
    loading,
    error,
    trustTowardSunstream,
    circuitBreakerSunstream,
    loadData,
    updateCircuitBreaker,
  };
});
