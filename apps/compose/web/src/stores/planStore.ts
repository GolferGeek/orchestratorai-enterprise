/**
 * Plan Store
 * Manages plans and their versions with strict A2A protocol types
 * Pure state management - handlers call actions, Vue reactivity updates UI
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import type { PlanData, PlanVersionData } from '@orchestrator-ai/transport-types';

export const usePlanStore = defineStore('plan', () => {
  // State - using Maps for O(1) lookups
  const plans = ref<Map<string, PlanData>>(new Map());
  const planVersions = ref<Map<string, PlanVersionData[]>>(new Map()); // planId -> versions
  const currentVersionId = ref<Map<string, string>>(new Map()); // planId -> versionId
  const plansByConversation = ref<Map<string, string[]>>(new Map()); // conversationId -> planIds
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const planById = (id: string): PlanData | undefined => {
    return plans.value.get(id);
  };

  const currentVersion = (planId: string): PlanVersionData | undefined => {
    const versionId = currentVersionId.value.get(planId);
    if (!versionId) return undefined;

    const versions = planVersions.value.get(planId) || [];
    return versions.find(v => v.id === versionId);
  };

  const versionsByPlanId = (planId: string): PlanVersionData[] => {
    return planVersions.value.get(planId) || [];
  };

  const plansByConversationId = (conversationId: string): PlanData[] => {
    const planIds = plansByConversation.value.get(conversationId) || [];
    return planIds
      .map(id => plans.value.get(id))
      .filter((plan): plan is PlanData => plan !== undefined)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  };

  const allPlans = computed(() => {
    return Array.from(plans.value.values())
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  });

  // Actions - ONLY way to mutate state

  /**
   * Add or update a plan
   * Called by plan handler after create/read/edit responses
   */
  function addPlan(plan: PlanData, version?: PlanVersionData): void {
    plans.value.set(plan.id, plan);

    // Add version if provided
    if (version) {
      addVersion(plan.id, version);
    }
  }

  // Orchestration methods removed - now handled by plan.actions.ts
  // - handlePlanCreate → createPlan action
  // - handlePlanRead → readPlan action
  // - handlePlanEdit → editPlan action
  // - handlePlanList → listPlans action

  /**
   * Update plan data
   */
  function updatePlan(planId: string, updates: Partial<PlanData>): void {
    const existing = plans.value.get(planId);
    if (existing) {
      plans.value.set(planId, {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Delete plan
   * Called by delete handler
   */
  function deletePlan(planId: string): void {
    plans.value.delete(planId);
    planVersions.value.delete(planId);
    currentVersionId.value.delete(planId);

    // Remove from conversation associations
    plansByConversation.value.forEach((planIds, conversationId) => {
      const filtered = planIds.filter(id => id !== planId);
      if (filtered.length > 0) {
        plansByConversation.value.set(conversationId, filtered);
      } else {
        plansByConversation.value.delete(conversationId);
      }
    });
  }

  /**
   * Add version to a plan
   */
  function addVersion(planId: string, version: PlanVersionData): void {

    const versions = planVersions.value.get(planId) || [];

    // Check if version already exists
    const existingIndex = versions.findIndex(v => v.id === version.id);

    if (existingIndex >= 0) {
      // Update existing version
      versions[existingIndex] = version;
      planVersions.value.set(planId, [...versions]);
    } else {
      // Add new version
      planVersions.value.set(planId, [...versions, version]);
    }

  }

  /**
   * Set current version for a plan
   */
  function setCurrentVersion(planId: string, versionId: string): void {
    currentVersionId.value.set(planId, versionId);

    const existing = plans.value.get(planId);
    if (existing) {
      plans.value.set(planId, {
        ...existing,
        currentVersionId: versionId,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Delete a version
   */
  function deleteVersion(planId: string, versionId: string): void {
    const versions = planVersions.value.get(planId) || [];
    const filtered = versions.filter(v => v.id !== versionId);
    planVersions.value.set(planId, filtered);

    // Clear current version if it was deleted
    if (currentVersionId.value.get(planId) === versionId) {
      currentVersionId.value.delete(planId);

      // Set to latest version if available
      if (filtered.length > 0) {
        const latest = filtered.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        setCurrentVersion(planId, latest.id);
      }
    }
  }

  /**
   * Associate plan with conversation
   */
  function associatePlanWithConversation(planId: string, conversationId: string): void {
    const conversationPlans = plansByConversation.value.get(conversationId) || [];
    if (!conversationPlans.includes(planId)) {
      plansByConversation.value.set(conversationId, [...conversationPlans, planId]);
    }
  }

  /**
   * Clear all plans for a conversation
   */
  function clearPlansByConversation(conversationId: string): void {
    const planIds = plansByConversation.value.get(conversationId) || [];
    planIds.forEach(planId => deletePlan(planId));
    plansByConversation.value.delete(conversationId);
  }

  /**
   * Clear all plans (logout)
   */
  function clearAll(): void {
    plans.value.clear();
    planVersions.value.clear();
    currentVersionId.value.clear();
    plansByConversation.value.clear();
  }

  /**
   * Set loading state
   */
  function setLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  /**
   * Set error message
   */
  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  /**
   * Clear error message
   */
  function clearError(): void {
    error.value = null;
  }

  // Return public API
  return {
    // State (read-only exposure)
    plans: readonly(plans),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Getters
    planById,
    currentVersion,
    versionsByPlanId,
    plansByConversationId,
    allPlans,

    // Simple mutations only (orchestration moved to plan.actions.ts)
    addPlan,
    updatePlan,
    deletePlan,
    addVersion,
    setCurrentVersion,
    deleteVersion: deleteVersion as (planId: string, versionId: string) => void,
    removeVersion: deleteVersion as (planId: string, versionId: string) => void, // Alias for consistency with deliverables
    associatePlanWithConversation,
    clearPlansByConversation,
    clearAll,
    setLoading,
    setError,
    clearError,
  };
});
