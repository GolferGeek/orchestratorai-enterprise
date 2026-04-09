/**
 * Plan Store Actions/Helpers
 *
 * These functions orchestrate plan operations:
 * 1. Call invoke-client (v2 contract) to send plan management requests
 * 2. Update planStore (state) via mutations
 * 3. Return data for component use
 *
 * This separates async operations (service calls) from state management (store).
 *
 * Usage in components:
 * ```typescript
 * import { createPlanVersion } from '@/stores/helpers/planActions';
 *
 * const newVersion = await createPlanVersion(agentSlug, planId, versionData);
 * ```
 */

import { invoke } from '@/services/invoke-client';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { usePlanStore } from '@/stores/planStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import type { PlanVersionData } from '@/types/plan';
import type { JsonObject } from '@/types';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeError = (error: unknown): Error =>
  (error instanceof Error ? error : new Error(String(error)));

/**
 * Create a new version of a plan via the v2 invoke contract
 * Updates store and returns the new version
 *
 * @param agentSlug - The agent to use for processing (unused — agentSlug is in ExecutionContext)
 * @param planId - The plan being edited (for store updates)
 * @param versionId - The version being edited from
 * @param content - The new content
 * @param metadata - Additional metadata (editedFromVersionId will be added automatically)
 */
export async function createPlanVersion(
  agentSlug: string,
  planId: string,
  versionId: string,
  content: string,
  metadata?: JsonObject
): Promise<PlanVersionData> {
  const store = usePlanStore();

  try {
    store.setLoading(true);
    store.clearError();

    // Get the plan to find its conversationId
    const plan = store.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found in store`);
    }

    // Prepare metadata with version tracking
    const versionMetadata: JsonObject = {
      ...metadata,
      editedFromVersionId: versionId,
      editedAt: new Date().toISOString(),
    };

    // Get ExecutionContext from store — it flows whole, never destructured
    const ctx = useExecutionContextStore().current;
    const baseUrl = getSecureApiBaseUrl();

    // Send plan edit request via v2 invoke contract
    // data.content carries the action payload: mode, action, and the edit data
    const invokeResult = await invoke(
      ctx,
      {
        content: JSON.stringify({
          mode: 'plan',
          action: 'edit',
          conversationId: plan.conversationId,
          content,
          metadata: versionMetadata,
        }),
        contentType: 'application/json',
      },
      { baseUrl },
    );

    if (!invokeResult.success) {
      throw new Error(invokeResult.error.message || 'Failed to create version');
    }

    // The backend returns the new version in output.content.version
    const outputContent = invokeResult.output.content as Record<string, unknown> | undefined;
    const newVersion = (outputContent?.version ?? outputContent?.data?.version) as PlanVersionData | undefined;

    if (!newVersion) {
      throw new Error('No version returned from API');
    }

    // Update store via mutation
    store.addVersion(planId, newVersion);

    return newVersion;
  } catch (error) {
    console.error('Failed to create plan version:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Load plan versions for a specific plan via the v2 invoke contract
 * Updates store and returns versions
 */
export async function loadPlanVersions(
  agentSlug: string,
  planId: string
): Promise<PlanVersionData[]> {
  const store = usePlanStore();

  try {
    store.setLoading(true);
    store.clearError();

    // Get ExecutionContext from store — it flows whole, never destructured
    const ctx = useExecutionContextStore().current;
    const baseUrl = getSecureApiBaseUrl();

    // Send plan list request via v2 invoke contract
    const invokeResult = await invoke(
      ctx,
      {
        content: JSON.stringify({
          mode: 'plan',
          action: 'list',
          planId,
        }),
        contentType: 'application/json',
      },
      { baseUrl },
    );

    if (!invokeResult.success) {
      throw new Error(invokeResult.error.message || 'Failed to load versions');
    }

    const outputContent = invokeResult.output.content as Record<string, unknown> | undefined;
    const versions = (outputContent?.versions ?? outputContent?.data?.versions ?? []) as PlanVersionData[];

    // Update store via mutations
    versions.forEach((version: PlanVersionData) => {
      store.addVersion(planId, version);
    });

    return versions;
  } catch (error) {
    console.error('Failed to load plan versions:', error);
    store.setError(getErrorMessage(error));
    return [];
  } finally {
    store.setLoading(false);
  }
}
