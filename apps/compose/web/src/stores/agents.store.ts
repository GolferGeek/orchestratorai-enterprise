/**
 * agents.store.ts
 *
 * Compose-specific agents state store.
 * State ONLY — no async, no API calls, no business logic.
 * agentsService calls mutations after API success.
 *
 * Three-layer architecture:
 *   Component → Store (state only) → agentsService → Compose API
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import type { ComposeAgent, ComposeRunner } from '@/services/compose-api.service';

// ============================================================================
// Store
// ============================================================================

export const useAgentsStore = defineStore('compose-agents', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const agents = ref<ComposeAgent[]>([]);
  const runners = ref<ComposeRunner[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastLoadedOrgSlug = ref<string | null>(null);

  // ============================================================================
  // COMPUTED GETTERS
  // ============================================================================

  const hasAgents = computed(() => agents.value.length > 0);

  const agentBySlug = (slug: string): ComposeAgent | undefined =>
    agents.value.find((a) => a.slug === slug);

  const runnerById = (id: string): ComposeRunner | undefined =>
    runners.value.find((r) => r.id === id);

  const runnersByType = (
    type: ComposeRunner['type']
  ): ComposeRunner[] => runners.value.filter((r) => r.type === type);

  // ============================================================================
  // MUTATIONS — synchronous only
  // ============================================================================

  function setAgents(agentList: ComposeAgent[]): void {
    agents.value = agentList;
  }

  function setRunners(runnerList: ComposeRunner[]): void {
    runners.value = runnerList;
  }

  function setLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  function clearError(): void {
    error.value = null;
  }

  function setLastLoadedOrgSlug(orgSlug: string | null): void {
    lastLoadedOrgSlug.value = orgSlug;
  }

  function reset(): void {
    agents.value = [];
    runners.value = [];
    isLoading.value = false;
    error.value = null;
    lastLoadedOrgSlug.value = null;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // State (read-only)
    agents: readonly(agents),
    runners: readonly(runners),
    isLoading: readonly(isLoading),
    error: readonly(error),
    lastLoadedOrgSlug: readonly(lastLoadedOrgSlug),

    // Computed
    hasAgents,

    // Getter functions
    agentBySlug,
    runnerById,
    runnersByType,

    // Mutations
    setAgents,
    setRunners,
    setLoading,
    setError,
    clearError,
    setLastLoadedOrgSlug,
    reset,
  };
});
