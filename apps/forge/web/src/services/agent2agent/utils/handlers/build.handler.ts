/**
 * Build Response Handler
 * Validates and processes build/deliverable-specific responses
 * Updates the store directly after extracting data
 */

import type {
  // StrictBuildResponse,
  DeliverableData,
  DeliverableVersionData,
} from '@orchestrator-ai/transport-types';
import {
  isStrictBuildResponse,
  validateSuccessResponse,
  extractSuccessPayload,
  StrictResponseValidationError,
} from './response-validation';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import type { Deliverable, DeliverableVersion } from '@/services/deliverablesService';
import { DeliverableVersionCreationType, DeliverableType, DeliverableFormat } from '@/services/deliverablesService';

/**
 * Build response types for different actions
 */
export interface BuildExecuteResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildReadResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildListResult {
  deliverables: DeliverableData[];
}

export interface BuildRerunResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildEditResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildDeleteResult {
  deleted: boolean;
  deliverableId: string;
}

export interface BuildSetCurrentResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildDeleteVersionResult {
  deleted: boolean;
  deliverableId: string;
  versionId: string;
}

export interface BuildMergeVersionsResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

export interface BuildCopyVersionResult {
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

/**
 * Convert DeliverableData to Deliverable for store operations
 */
function convertToDeliverable(data: DeliverableData): Deliverable {
  return {
    id: data.id,
    userId: data.userId,
    conversationId: data.conversationId,
    agentName: data.agentName,
    title: data.title,
    type: data.type as DeliverableType | undefined, // Type is compatible string
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Convert DeliverableVersionData to DeliverableVersion for store operations
 */
function convertToDeliverableVersion(data: DeliverableVersionData): DeliverableVersion {
  return {
    id: data.id,
    deliverableId: data.deliverableId,
    versionNumber: data.versionNumber,
    content: data.content,
    format: data.format as DeliverableFormat | undefined, // Format is compatible
    isCurrentVersion: data.isCurrentVersion,
    createdByType: data.createdByType === 'agent'
      ? DeliverableVersionCreationType.AI_RESPONSE
      : DeliverableVersionCreationType.MANUAL_EDIT,
    metadata: data.metadata,
    createdAt: data.createdAt,
    updatedAt: data.createdAt, // DeliverableVersionData doesn't have updatedAt
  };
}

/**
 * Shared validator/extractor helper
 * Pure function that validates response and extracts typed content
 *
 * @throws StrictResponseValidationError if response is invalid
 */
function validateAndExtract<T>(response: unknown, action: string): T {
  // Validate it's a build response
  if (!isStrictBuildResponse(response)) {
    throw new StrictResponseValidationError(
      `Response is not a valid build response for action: ${action}`,
      response,
    );
  }

  // Validate success response structure
  const validation = validateSuccessResponse(response, 'build');
  if (!validation.valid) {
    throw new StrictResponseValidationError(
      `Invalid build response for ${action}: ${validation.errors.join(', ')}`,
      response,
    );
  }

  // Extract payload
  const { content } = extractSuccessPayload<T>(response);

  // Ensure content exists
  if (!content) {
    throw new StrictResponseValidationError(
      `No content in build response for action: ${action}`,
      response,
    );
  }

  return content;
}

/**
 * Build response handler
 * Validates responses and updates the store directly
 */
export const buildResponseHandler = {
  /**
   * Handle execute build response (create action in build mode)
   * Validates, extracts data, and updates store
   */
  handleExecute(response: unknown, _planId?: string): BuildExecuteResult {
    const result = validateAndExtract<BuildExecuteResult>(response, 'create');
    const store = useDeliverablesStore();

    // Update store
    store.addDeliverable(convertToDeliverable(result.deliverable));
    if (result.version) {
      store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));
    }
    // TODO: Add plan-deliverable association to deliverablesStore if needed
    // if (planId) {
    //   store.associateDeliverableWithPlan(result.deliverable.id, planId);
    // }
    if (result.version) {
      store.setCurrentVersion(result.deliverable.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle read deliverable response
   * Validates, extracts data, and updates store
   */
  handleRead(response: unknown): BuildReadResult {
    const result = validateAndExtract<BuildReadResult>(response, 'read');
    const store = useDeliverablesStore();

    // Update store
    store.addDeliverable(convertToDeliverable(result.deliverable));
    if (result.version) {
      store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));
    }
    if (result.version) {
      store.setCurrentVersion(result.deliverable.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle list deliverables response
   * Validates, extracts data, and updates store
   */
  handleList(response: unknown, _planId?: string): BuildListResult {
    const result = validateAndExtract<BuildListResult>(response, 'list');
    const store = useDeliverablesStore();

    // Update store with all deliverables
    result.deliverables.forEach(deliverable => {
      store.addDeliverable(convertToDeliverable(deliverable));
      // TODO: Add plan-deliverable association to deliverablesStore if needed
      // if (planId) {
      //   store.associateDeliverableWithPlan(deliverable.id, planId);
      // }
    });

    return result;
  },

  /**
   * Handle rerun build response
   * Validates, extracts data, and updates store
   */
  handleRerun(response: unknown): BuildRerunResult {
    const result = validateAndExtract<BuildRerunResult>(response, 'rerun');
    const store = useDeliverablesStore();

    // Update store with new version
    store.addDeliverable(convertToDeliverable(result.deliverable));
    if (result.version) {
      store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));
    }
    if (result.version) {
      store.setCurrentVersion(result.deliverable.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle edit deliverable response
   * Validates, extracts data, and updates store
   */
  handleEdit(response: unknown): BuildEditResult {
    const result = validateAndExtract<BuildEditResult>(response, 'edit');
    const store = useDeliverablesStore();

    // Update store
    store.addDeliverable(convertToDeliverable(result.deliverable));
    if (result.version) {
      store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));
    }
    if (result.version) {
      store.setCurrentVersion(result.deliverable.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle set current version response
   * Validates, extracts data, and updates store
   */
  handleSetCurrent(response: unknown): BuildSetCurrentResult {
    const result = validateAndExtract<BuildSetCurrentResult>(response, 'set_current');
    const store = useDeliverablesStore();

    // Update store
    store.setCurrentVersion(result.deliverable.id, result.version.id);

    return result;
  },

  /**
   * Handle delete version response
   * Validates, extracts data, and updates store
   */
  handleDeleteVersion(response: unknown): BuildDeleteVersionResult {
    const result = validateAndExtract<BuildDeleteVersionResult>(response, 'delete_version');
    const store = useDeliverablesStore();

    // Update store
    if (result.deleted) {
      store.removeVersion(result.deliverableId, result.versionId);
    }

    return result;
  },

  /**
   * Handle merge versions response
   * Validates, extracts data, and updates store
   */
  handleMergeVersions(response: unknown): BuildMergeVersionsResult {
    const result = validateAndExtract<BuildMergeVersionsResult>(response, 'merge_versions');
    const store = useDeliverablesStore();

    // Update store with merged version
    store.addDeliverable(convertToDeliverable(result.deliverable));
    if (result.version) {
      store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));
    }
    if (result.version) {
      store.setCurrentVersion(result.deliverable.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle copy version response
   * Validates, extracts data, and updates store
   */
  handleCopyVersion(response: unknown): BuildCopyVersionResult {
    const result = validateAndExtract<BuildCopyVersionResult>(response, 'copy_version');
    const store = useDeliverablesStore();

    // Update store with copied version
    store.addVersion(result.deliverable.id, convertToDeliverableVersion(result.version));

    return result;
  },

  /**
   * Handle delete deliverable response
   * Validates, extracts data, and updates store
   */
  handleDelete(response: unknown): BuildDeleteResult {
    const result = validateAndExtract<BuildDeleteResult>(response, 'delete');
    const store = useDeliverablesStore();

    // Update store
    if (result.deleted) {
      store.removeDeliverable(result.deliverableId);
    }

    return result;
  },

  /**
   * Generic handler that auto-detects action
   * Validates and returns typed data
   */
  handle(response: unknown): unknown {
    return validateAndExtract(response, 'unknown');
  },
};
