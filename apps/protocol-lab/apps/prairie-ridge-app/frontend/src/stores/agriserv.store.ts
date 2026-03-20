import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LoanApplication, BorrowerRecord, CollateralItem, PortfolioSummary } from '@/types';
import {
  fetchAgriservLoans,
  fetchAgriservBorrowers,
  fetchAgriservRates,
  fetchAgriservCollateral,
  fetchAgriservPortfolio,
} from '@/services/api';

export const useAgriservStore = defineStore('agriserv', () => {
  const loans = ref<LoanApplication[]>([]);
  const borrowers = ref<BorrowerRecord[]>([]);
  const rates = ref<unknown>(null);
  const collateral = ref<CollateralItem[]>([]);
  const portfolio = ref<PortfolioSummary | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Trust toward Prairie Ridge Credit
  const trustTowardPrairieRidge = ref({ level: 'TRUSTED' as const, score: 80 });

  // Circuit breaker toward Prairie Ridge Credit
  const circuitBreakerPrairieRidge = ref<'CLOSED' | 'HALF-OPEN' | 'OPEN'>('CLOSED');

  async function loadData() {
    loading.value = true;
    error.value = null;
    try {
      const [loansResult, borrowersResult, ratesResult, collateralResult, portfolioResult] =
        await Promise.all([
          fetchAgriservLoans(),
          fetchAgriservBorrowers(),
          fetchAgriservRates(),
          fetchAgriservCollateral(),
          fetchAgriservPortfolio(),
        ]);
      loans.value = loansResult;
      borrowers.value = borrowersResult;
      rates.value = ratesResult;
      collateral.value = collateralResult;
      portfolio.value = portfolioResult;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadLoans() {
    try {
      loans.value = await fetchAgriservLoans();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  function updateCircuitBreaker(state: 'CLOSED' | 'HALF-OPEN' | 'OPEN') {
    circuitBreakerPrairieRidge.value = state;
  }

  return {
    loans,
    borrowers,
    rates,
    collateral,
    portfolio,
    loading,
    error,
    trustTowardPrairieRidge,
    circuitBreakerPrairieRidge,
    loadData,
    loadLoans,
    updateCircuitBreaker,
  };
});
