/**
 * Plan Store Actions/Helpers
 *
 * These functions orchestrate plan operations:
 * 1. Call invoke-client directly via the v2 invoke contract
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
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import { usePlanStore } from '@/stores/planStore';
import type { PlanVersionData } from '@/types/forge-types';
import type { JsonObject } from '@/types';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeError = (error: unknown): Error =>
  (error instanceof Error ? error : new Error(String(error)));

interface _CreatePlanVersionDto {
  content: string;
  createdByType?: 'agent' | 'user' | 'manual_edit';
  taskId?: string;
  metadata?: JsonObject;
}

/**
 * Create a new version of a plan via A2A protocol
 * Updates store and returns the new version
 *
 * @param agentSlug - The agent to use for processing
 * @param planId - The plan being edited (for store updates)
 * @param versionId - The version being edited from
 * @param content - The new content
 * @param metadata - Additional metadata (editedFromVersionId will be added automatically)
 */
export async function createPlanVersion(
  _agentSlug: string,
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

    // Call invoke directly with the plan edit payload
    const ctx = useExecutionContextStore().current;
    const result = await invoke(
      ctx,
      {
        content: {
          mode: 'plan',
          userMessage: 'Edit plan',
          payload: { action: 'edit', content, metadata: versionMetadata },
        },
      },
      { baseUrl: getSecureApiBaseUrl() },
      { trigger: 'plan.edit' },
    );

    if (!result.success) {
      console.error('❌ [Plan Create Version Action] Failed:', result.error);
      throw new Error(result.error.message || 'Failed to create version');
    }

    // Extract the new version from invoke output
    const outputContent = result.output.content as Record<string, unknown> | undefined;
    const newVersion = (outputContent?.version as PlanVersionData | undefined) ||
      ((outputContent?.plan as Record<string, unknown> | undefined)?.version as PlanVersionData | undefined);

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
 * Load plan versions for a specific plan via A2A protocol
 * Updates store and returns versions
 */
export async function loadPlanVersions(
  _agentSlug: string,
  planId: string
): Promise<PlanVersionData[]> {
  const store = usePlanStore();

  try {
    store.setLoading(true);
    store.clearError();

    // Call invoke directly with the plan list payload
    const ctx = useExecutionContextStore().current;
    const result = await invoke(
      ctx,
      {
        content: {
          mode: 'plan',
          payload: { action: 'list', planId },
        },
      },
      { baseUrl: getSecureApiBaseUrl() },
      { trigger: 'plan.list' },
    );

    if (!result.success) {
      console.error('❌ [Plan Load Versions] Failed:', result.error);
      throw new Error(result.error.message || 'Failed to load versions');
    }

    const outputContent = result.output.content as Record<string, unknown> | undefined;
    const versions = (outputContent?.versions as PlanVersionData[] | undefined) || [];

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
