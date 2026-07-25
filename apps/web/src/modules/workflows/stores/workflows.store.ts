/**
 * Workflows catalog store — workflow definitions for the sidebar.
 */

import { defineStore } from 'pinia';
import { ref, readonly } from 'vue';
import {
  workflowsApiService,
  type WorkflowDefinition,
} from '@/modules/workflows/services/workflows-api.service';

export type { WorkflowDefinition };

export const useWorkflowsStore = defineStore('workflows-catalog', () => {
  const workflows = ref<WorkflowDefinition[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastLoadedOrgSlug = ref<string | null>(null);

  const hasWorkflows = ref(false);

  function setWorkflows(items: WorkflowDefinition[]): void {
    workflows.value = items;
    hasWorkflows.value = items.length > 0;
  }

  function setLoading(value: boolean): void {
    loading.value = value;
  }

  function setError(message: string | null): void {
    error.value = message;
  }

  function setLastLoadedOrgSlug(orgSlug: string | null): void {
    lastLoadedOrgSlug.value = orgSlug;
  }

  function clearError(): void {
    error.value = null;
  }

  async function loadWorkflows(orgSlug?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const items = await workflowsApiService.fetchWorkflows(orgSlug);
      setWorkflows(items);
      setLastLoadedOrgSlug(orgSlug ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    workflows: readonly(workflows),
    loading: readonly(loading),
    error: readonly(error),
    lastLoadedOrgSlug: readonly(lastLoadedOrgSlug),
    hasWorkflows,
    setWorkflows,
    setLoading,
    setError,
    setLastLoadedOrgSlug,
    clearError,
    loadWorkflows,
  };
});
