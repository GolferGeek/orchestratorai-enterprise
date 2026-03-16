/**
 * Plan Response Handler
 * Validates and processes plan-specific responses
 * Updates the store directly after extracting data
 */

import type {
  // StrictPlanResponse,
  PlanData,
  PlanVersionData,
} from '@orchestrator-ai/transport-types';
import {
  isStrictPlanResponse,
  validateSuccessResponse,
  extractSuccessPayload,
  StrictResponseValidationError,
} from './response-validation';
import { usePlanStore } from '@/stores/planStore';

/**
 * Plan response types for different actions
 */
export interface PlanCreateResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanReadResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanListResult {
  plans: PlanData[];
}

export interface PlanEditResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanRerunResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanDeleteResult {
  deleted: boolean;
  planId: string;
}

export interface PlanSetCurrentResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanDeleteVersionResult {
  deleted: boolean;
  planId: string;
  versionId: string;
}

export interface PlanMergeVersionsResult {
  plan: PlanData;
  version: PlanVersionData;
}

export interface PlanCopyVersionResult {
  plan: PlanData;
  version: PlanVersionData;
}

/**
 * Shared validator/extractor helper
 * Pure function that validates response and extracts typed content
 *
 * @throws StrictResponseValidationError if response is invalid
 */
function validateAndExtract<T>(response: unknown, action: string): T {
  // Validate it's a plan response
  if (!isStrictPlanResponse(response)) {
    throw new StrictResponseValidationError(
      `Response is not a valid plan response for action: ${action}`,
      response,
    );
  }

  // Validate success response structure
  const validation = validateSuccessResponse(response, 'plan');
  if (!validation.valid) {
    throw new StrictResponseValidationError(
      `Invalid plan response for ${action}: ${validation.errors.join(', ')}`,
      response,
    );
  }

  // Extract payload
  const { content } = extractSuccessPayload<T>(response);

  // Ensure content exists
  if (!content) {
    throw new StrictResponseValidationError(
      `No content in plan response for action: ${action}`,
      response,
    );
  }

  return content;
}

/**
 * Plan response handler
 * Validates responses and updates the store directly
 */
export const planResponseHandler = {
  /**
   * Handle create plan response
   * Validates, extracts data, and updates store
   */
  handleCreate(response: unknown, conversationId: string): PlanCreateResult {
    const result = validateAndExtract<PlanCreateResult>(response, 'create');
    const store = usePlanStore();

    // Update store
    store.addPlan(result.plan, result.version);
    store.associatePlanWithConversation(result.plan.id, conversationId);
    if (result.version) {
      store.setCurrentVersion(result.plan.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle read plan response
   * Validates, extracts data, and updates store
   */
  handleRead(response: unknown): PlanReadResult {
    const result = validateAndExtract<PlanReadResult>(response, 'read');
    const store = usePlanStore();

    // Update store
    store.addPlan(result.plan, result.version);
    if (result.version) {
      store.setCurrentVersion(result.plan.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle list plans response
   * Validates, extracts data, and updates store
   */
  handleList(response: unknown, conversationId?: string): PlanListResult {
    const result = validateAndExtract<PlanListResult>(response, 'list');
    const store = usePlanStore();

    // Update store with all plans
    result.plans.forEach(plan => {
      store.addPlan(plan);
      if (conversationId) {
        store.associatePlanWithConversation(plan.id, conversationId);
      }
    });

    return result;
  },

  /**
   * Handle edit plan response
   * Validates, extracts data, and updates store
   */
  handleEdit(response: unknown): PlanEditResult {
    const result = validateAndExtract<PlanEditResult>(response, 'edit');
    const store = usePlanStore();

    // Update store
    store.addPlan(result.plan, result.version);
    if (result.version) {
      store.setCurrentVersion(result.plan.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle rerun plan response
   * Validates, extracts data, and updates store
   */
  handleRerun(response: unknown): PlanRerunResult {
    const result = validateAndExtract<PlanRerunResult>(response, 'rerun');
    const store = usePlanStore();

    // Update store with new version
    store.addPlan(result.plan, result.version);
    if (result.version) {
      store.setCurrentVersion(result.plan.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle set current version response
   * Validates, extracts data, and updates store
   */
  handleSetCurrent(response: unknown): PlanSetCurrentResult {
    const result = validateAndExtract<PlanSetCurrentResult>(response, 'set_current');
    const store = usePlanStore();

    // Update store
    store.setCurrentVersion(result.plan.id, result.version.id);

    return result;
  },

  /**
   * Handle delete version response
   * Validates, extracts data, and updates store
   */
  handleDeleteVersion(response: unknown): PlanDeleteVersionResult {
    const result = validateAndExtract<PlanDeleteVersionResult>(response, 'delete_version');
    const store = usePlanStore();

    // Update store
    if (result.deleted) {
      store.deleteVersion(result.planId, result.versionId);
    }

    return result;
  },

  /**
   * Handle merge versions response
   * Validates, extracts data, and updates store
   */
  handleMergeVersions(response: unknown): PlanMergeVersionsResult {
    const result = validateAndExtract<PlanMergeVersionsResult>(response, 'merge_versions');
    const store = usePlanStore();

    // Update store with merged version
    store.addPlan(result.plan, result.version);
    if (result.version) {
      store.setCurrentVersion(result.plan.id, result.version.id);
    }

    return result;
  },

  /**
   * Handle copy version response
   * Validates, extracts data, and updates store
   */
  handleCopyVersion(response: unknown): PlanCopyVersionResult {
    const result = validateAndExtract<PlanCopyVersionResult>(response, 'copy_version');
    const store = usePlanStore();

    // Update store with copied version
    store.addVersion(result.plan.id, result.version);

    return result;
  },

  /**
   * Handle delete plan response
   * Validates, extracts data, and updates store
   */
  handleDelete(response: unknown): PlanDeleteResult {
    const result = validateAndExtract<PlanDeleteResult>(response, 'delete');
    const store = usePlanStore();

    // Update store
    if (result.deleted) {
      store.deletePlan(result.planId);
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
