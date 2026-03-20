import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ExaminationCriteria, CapitalRequirement, AssociationRating, RiskConcentrationLimit } from '@/types';
import {
  fetchCentralFarmBankExaminationCriteria,
  fetchCentralFarmBankCapitalRequirements,
  fetchCentralFarmBankRatings,
  fetchCentralFarmBankRiskLimits,
} from '@/services/api';

export const useCentralFarmBankStore = defineStore('central-farm-bank', () => {
  const examinationCriteria = ref<ExaminationCriteria[]>([]);
  const capitalRequirements = ref<CapitalRequirement[]>([]);
  const ratings = ref<AssociationRating[]>([]);
  const riskLimits = ref<RiskConcentrationLimit[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Trust toward Prairie Ridge Credit — Central Farm Bank has maximum trust as the regulator
  const trustTowardPrairieRidge = ref({ level: 'MAXIMUM' as const, score: 95 });

  // Circuit breaker toward Prairie Ridge Credit
  const circuitBreakerPrairieRidge = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');

  async function loadData() {
    loading.value = true;
    error.value = null;
    try {
      const [criteriaResult, requirementsResult, ratingsResult, limitsResult] = await Promise.all([
        fetchCentralFarmBankExaminationCriteria(),
        fetchCentralFarmBankCapitalRequirements(),
        fetchCentralFarmBankRatings(),
        fetchCentralFarmBankRiskLimits(),
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
    circuitBreakerPrairieRidge.value = state;
  }

  return {
    examinationCriteria,
    capitalRequirements,
    ratings,
    riskLimits,
    loading,
    error,
    trustTowardPrairieRidge,
    circuitBreakerPrairieRidge,
    loadData,
    updateCircuitBreaker,
  };
});
