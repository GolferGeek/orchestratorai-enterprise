/**
 * Privacy Store — Sovereign Mode State
 *
 * Manages sovereign mode settings and organization privacy policy.
 * Sovereign mode restricts AI processing to local providers only (Ollama).
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface SovereignPolicy {
  enforced: boolean;
  allowedProviders?: string[];
  reason?: string;
}

export const usePrivacyStore = defineStore('privacy', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Whether the user has manually enabled sovereign mode */
  const userSovereignMode = ref<boolean>(false);

  /** Organization-level sovereign policy (set by admin/org config) */
  const sovereignPolicy = ref<SovereignPolicy | null>(null);

  // ============================================================================
  // COMPUTED
  // ============================================================================

  /**
   * Effective sovereign mode — true if either user-enabled or org-enforced
   */
  const effectiveSovereignMode = computed((): boolean => {
    return userSovereignMode.value || (sovereignPolicy.value?.enforced ?? false);
  });

  // ============================================================================
  // ACTIONS
  // ============================================================================

  function setSovereignMode(enabled: boolean): void {
    userSovereignMode.value = enabled;
  }

  function setSovereignPolicy(policy: SovereignPolicy | null): void {
    sovereignPolicy.value = policy;
  }

  function clear(): void {
    userSovereignMode.value = false;
    sovereignPolicy.value = null;
  }

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    userSovereignMode,
    sovereignPolicy,
    effectiveSovereignMode,
    setSovereignMode,
    setSovereignPolicy,
    clear,
  };
});
