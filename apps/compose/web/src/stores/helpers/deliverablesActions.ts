/**
 * Deliverables Store Actions/Helpers
 *
 * These functions orchestrate deliverable operations:
 * 1. Call deliverablesService (API)
 * 2. Update deliverablesStore (state) via mutations
 * 3. Return data for component use
 *
 * This separates async operations (service calls) from state management (store).
 *
 * Usage in components:
 * ```typescript
 * import { loadDeliverables, loadDeliverableVersions } from '@/stores/helpers/deliverablesActions';
 *
 * const deliverables = await loadDeliverables();
 * const versions = await loadDeliverableVersions(deliverableId);
 * ```
 */

import {
  DeliverableFormat,
  DeliverableVersionCreationType,
} from '@/services/deliverablesService.types';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import type { Deliverable, DeliverableVersion } from '@/services/deliverablesService.types';
import type { JsonObject } from '@orchestrator-ai/transport-types';
import { invoke } from '@/services/invoke-client';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeError = (error: unknown): Error =>
  (error instanceof Error ? error : new Error(String(error)));

async function getDeliverablesServiceInstance() {
  const { getDeliverablesService } = await import('@/services/deliverablesService.impl');
  return getDeliverablesService();
}

/**
 * Transform snake_case A2A DeliverableVersion to camelCase service DeliverableVersion
 */
const transformA2AVersion = (a2aVersion: Record<string, unknown>): DeliverableVersion => {
  // Map format string to enum
  const formatMap: Record<string, DeliverableFormat> = {
    'markdown': DeliverableFormat.MARKDOWN,
    'json': DeliverableFormat.JSON,
    'text': DeliverableFormat.TEXT,
    'html': DeliverableFormat.HTML,
  };

  // Map created_by_type string to enum
  const createdByTypeMap: Record<string, DeliverableVersionCreationType> = {
    'agent': DeliverableVersionCreationType.AI_RESPONSE,
    'user': DeliverableVersionCreationType.MANUAL_EDIT,
  };

  const format = a2aVersion.format as string;
  const createdByType = a2aVersion.created_by_type as string;

  return {
    id: a2aVersion.id as string,
    deliverableId: a2aVersion.deliverable_id as string,
    versionNumber: a2aVersion.version_number as number,
    content: a2aVersion.content as string,
    format: formatMap[format] || DeliverableFormat.TEXT,
    isCurrentVersion: a2aVersion.is_current_version as boolean,
    createdByType: createdByTypeMap[createdByType] || DeliverableVersionCreationType.MANUAL_EDIT,
    taskId: a2aVersion.task_id as string | undefined,
    metadata: a2aVersion.metadata as JsonObject | undefined,
    createdAt: a2aVersion.created_at as string,
    updatedAt: a2aVersion.created_at as string, // use createdAt as updatedAt
  };
};

/**
 * Load all deliverables for the current user
 * Updates store and returns deliverables
 */
export async function loadDeliverables(): Promise<Deliverable[]> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);
    store.clearError();

    // Call service to get deliverables
    const result = await svc.getDeliverables({
      limit: 100,
      offset: 0,
      latestOnly: true,
    });

    // Clear existing deliverables
    store.clearAll();

    // Fetch full deliverable objects
    const deliverablePromises = result.items.map(async (searchItem) => {
      try {
        return await svc.getDeliverable(searchItem.id);
      } catch (error) {
        console.error(`Failed to load deliverable ${searchItem.id}:`, error);
        return null;
      }
    });

    const deliverables = (await Promise.all(deliverablePromises)).filter(Boolean) as Deliverable[];

    // Update store via mutations
    deliverables.forEach((deliverable) => {
      store.addDeliverable(deliverable);
    });

    return deliverables;
  } catch (error) {
    console.error('Failed to load deliverables:', error);
    store.setError(getErrorMessage(error));
    return [];
  } finally {
    store.setLoading(false);
  }
}

/**
 * Load deliverables for a specific conversation
 * Updates store and returns deliverables
 */
export async function loadDeliverablesByConversation(conversationId: string): Promise<Deliverable[]> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);
    store.clearError();

    // Call service
    const deliverables = await svc.getConversationDeliverables(conversationId);

    // Clear existing deliverables for this conversation
    const existingIds = store.getConversationDeliverableIds(conversationId);
    existingIds.forEach(id => {
      store.removeDeliverable(id);
    });

    // Update store via mutations
    deliverables.forEach((deliverable) => {
      store.addDeliverable(deliverable);
    });

    return deliverables;
  } catch (error) {
    console.error('Failed to load deliverables for conversation:', error);
    store.setError(getErrorMessage(error));
    return [];
  } finally {
    store.setLoading(false);
  }
}

/**
 * Load version history for a deliverable
 * Updates store and returns versions
 */
export async function loadDeliverableVersions(deliverableId: string): Promise<DeliverableVersion[]> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);
    store.clearError();

    // Call service
    const versions = await svc.getVersionHistory(deliverableId);

    // Update store via mutations
    versions.forEach(version => {
      store.addVersion(deliverableId, version);
    });

    return versions;
  } catch (error) {
    console.error('Failed to load deliverable versions:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Create a new version of a deliverable via A2A protocol 'edit' action
 * The backend's saveManualEdit will create a new version
 */
/**
 * Create a new version of a deliverable via A2A protocol
 *
 * @param agentSlug - The agent to use for processing
 * @param deliverableId - The deliverable being edited (for store updates)
 * @param versionId - The version being edited from
 * @param content - The new content
 * @param metadata - Additional metadata (editedFromVersionId will be added automatically)
 */
export async function createDeliverableVersion(
  agentSlug: string,
  deliverableId: string,
  versionId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<DeliverableVersion> {
  const store = useDeliverablesStore();

  try {
    store.setLoading(true);
    store.clearError();

    // Get the deliverable to find its conversationId
    const deliverable = store.getDeliverableById(deliverableId);
    if (!deliverable) {
      throw new Error(`Deliverable ${deliverableId} not found in store`);
    }

    if (!deliverable.conversationId) {
      throw new Error(`Deliverable ${deliverableId} has no associated conversation`);
    }

    // Prepare metadata with version tracking
    const versionMetadata = {
      ...metadata,
      editedFromVersionId: versionId,
      editedAt: new Date().toISOString(),
    };

    // Get ExecutionContext from store — it flows whole, never destructured
    const ctx = useExecutionContextStore().current;
    const baseUrl = getSecureApiBaseUrl();

    // Send deliverable edit request via v2 invoke contract
    // data.content carries the action payload: mode, action, and the edit data
    const invokeResult = await invoke(
      ctx,
      {
        content: JSON.stringify({
          mode: 'build',
          action: 'edit',
          conversationId: deliverable.conversationId,
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

    // Extract the new version from output.content
    const outputContent = invokeResult.output.content as Record<string, unknown> | undefined;

    // Handle both direct response and wrapped response formats
    let a2aVersion: Record<string, unknown> | undefined;
    if (outputContent?.success === true) {
      a2aVersion = (outputContent.data as Record<string, unknown> | undefined)?.version as Record<string, unknown> | undefined;
    } else if (outputContent?.version) {
      a2aVersion = outputContent.version as Record<string, unknown>;
    }

    if (!a2aVersion) {
      throw new Error('No version returned from API');
    }

    // Transform snake_case A2A version to camelCase service version format
    const newVersion = transformA2AVersion(a2aVersion);

    // Update store via mutation
    store.addVersion(deliverableId, newVersion);

    return newVersion;
  } catch (error) {
    console.error('Failed to create deliverable version:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Delete a deliverable
 * Updates store after deletion
 */
export async function deleteDeliverable(deliverableId: string): Promise<void> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);

    // Call service
    await svc.deleteDeliverable(deliverableId);

    // Update store via mutation
    store.removeDeliverable(deliverableId);
  } catch (error) {
    console.error('Failed to delete deliverable:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Set current version for a deliverable
 * Updates store after setting
 */
export async function setDeliverableCurrentVersion(versionId: string): Promise<DeliverableVersion> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);

    // Call service
    const version = await svc.setCurrentVersion(versionId);

    // Update store via mutation
    store.addVersion(version.deliverableId, version);

    return version;
  } catch (error) {
    console.error('Failed to set current version:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Delete a version
 * Updates store after deletion
 */
export async function deleteDeliverableVersion(versionId: string, deliverableId: string): Promise<void> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);

    // Call service
    await svc.deleteVersion(versionId);

    // Update store via mutation
    store.removeVersion(deliverableId, versionId);
  } catch (error) {
    console.error('Failed to delete version:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Create an editing conversation for a deliverable
 * Updates store and returns conversation info
 */
export async function createEditingConversation(
  deliverableId: string,
  options: {
    agentName?: string;
    initialMessage?: string;
    action?: 'edit' | 'enhance' | 'revise' | 'discuss' | 'new-version';
  } = {}
): Promise<{ conversationId: string; deliverableId: string }> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);
    store.clearError();

    // Call service
    const result = await svc.createEditingConversation(deliverableId, options);

    // Update the deliverable in store to reflect the new conversation link
    const deliverable = store.getDeliverableById(deliverableId);
    if (deliverable) {
      deliverable.conversationId = result.conversationId;
      store.addDeliverable(deliverable);
    }

    return {
      conversationId: result.conversationId,
      deliverableId
    };
  } catch (error) {
    console.error('Failed to create editing conversation:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Get a specific version by ID
 * Returns version data (does not update store since it's a one-time fetch)
 */
export async function getDeliverableVersion(versionId: string): Promise<DeliverableVersion> {
  const store = useDeliverablesStore();
  const svc = await getDeliverablesServiceInstance();

  try {
    store.setLoading(true);

    // Call service
    const version = await svc.getVersion(versionId);

    return version;
  } catch (error) {
    console.error('Failed to get version:', error);
    store.setError(getErrorMessage(error));
    throw normalizeError(error);
  } finally {
    store.setLoading(false);
  }
}
