/**
 * Workflows Nav Store
 *
 * Run history for the Workflows sidebar (marketing swarm tasks, etc.).
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import {
  workflowsApiService,
  type WorkflowRunNavItem,
} from '@/modules/workflows/services/workflows-api.service';

export type { WorkflowRunNavItem };

export const useWorkflowsNavStore = defineStore('workflows-nav', () => {
  const runs = ref<WorkflowRunNavItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const runsForWorkflow = computed(() => (workflowSlug: string) =>
    runs.value.filter((r) => r.workflowSlug === workflowSlug),
  );

  async function fetchRuns(orgSlug?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const marketingRuns = await workflowsApiService.fetchWorkflowRuns(
        'marketing-swarm',
        orgSlug,
      );
      runs.value = marketingRuns;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function removeRun(conversationId: string): void {
    runs.value = runs.value.filter((r) => r.conversationId !== conversationId);
  }

  function clearAll(): void {
    runs.value = [];
    error.value = null;
  }

  return {
    runs: readonly(runs),
    loading: readonly(loading),
    error: readonly(error),
    runsForWorkflow,
    fetchRuns,
    removeRun,
    clearAll,
  };
});
