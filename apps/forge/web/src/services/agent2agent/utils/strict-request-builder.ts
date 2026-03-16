/**
 * Strict Request Builder
 * Creates fully-typed, validated requests for the A2A protocol
 * Ensures all required fields are set before sending to the backend
 */

import type {
  StrictA2ARequest,
  StrictPlanRequest,
  StrictBuildRequest,
  StrictConverseRequest,
  AgentTaskMode,
  PlanAction,
  BuildAction,
  StrictTaskMessage,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Base metadata for all requests
 */
interface RequestMetadata {
  context: ExecutionContext;
  userMessage?: string;
  messages?: StrictTaskMessage[];
  metadata?: Record<string, unknown>;
}

/**
 * Validation error
 */
export class StrictRequestValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(`Validation failed for field '${field}': ${message}`);
    this.name = 'StrictRequestValidationError';
  }
}

/**
 * Plan request builders
 */
export const buildPlanRequest = {
  /**
   * Create a new plan
   */
  create: (
    metadata: RequestMetadata & { userMessage: string },
    planData?: Record<string, unknown>,
  ): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.create',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'create' as PlanAction,
          ...planData,
        },
      },
    };
  },

  /**
   * Read current plan
   */
  read: (metadata: RequestMetadata, planId?: string): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.read',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'read' as PlanAction,
          ...(planId ? { planId } : {}),
        },
      },
    };
  },

  /**
   * Edit plan
   */
  edit: (
    metadata: RequestMetadata & { userMessage: string },
    editData: { versionId?: string; content?: string },
  ): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.edit',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'edit' as PlanAction,
          ...editData,
        },
      },
    };
  },

  /**
   * List all plans in conversation
   */
  list: (metadata: RequestMetadata): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.list',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'list' as PlanAction,
        },
      },
    };
  },

  /**
   * Delete plan
   */
  delete: (metadata: RequestMetadata, planId: string): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(planId, 'planId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.delete',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'delete' as PlanAction,
          planId,
        },
      },
    };
  },

  /**
   * Set current plan version
   */
  setCurrent: (metadata: RequestMetadata, versionId: string): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.set_current',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'set_current' as PlanAction,
          versionId,
        },
      },
    };
  },

  /**
   * Delete plan version
   */
  deleteVersion: (metadata: RequestMetadata, versionId: string): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.delete_version',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'delete_version' as PlanAction,
          versionId,
        },
      },
    };
  },

  /**
   * Merge plan versions
   */
  mergeVersions: (
    metadata: RequestMetadata & { userMessage: string },
    mergeData: { versionIds: string[]; mergePrompt: string },
  ): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');
    validateRequired(mergeData.versionIds, 'versionIds');
    validateRequired(mergeData.mergePrompt, 'mergePrompt');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.merge_versions',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'merge_versions' as PlanAction,
          ...mergeData,
        },
      },
    };
  },

  /**
   * Copy plan version
   */
  copyVersion: (metadata: RequestMetadata, versionId: string): StrictPlanRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'plan.copy_version',
      params: {
        context: metadata.context,
        mode: 'plan' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'copy_version' as PlanAction,
          versionId,
        },
      },
    };
  },
};

/**
 * Build request builders
 */
export const buildBuildRequest = {
  /**
   * Execute build (create deliverable)
   */
  execute: (
    metadata: RequestMetadata & { userMessage: string },
    buildData?: { planId?: string; [key: string]: unknown },
  ): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.execute',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        planId: buildData?.planId,
        payload: {
          action: 'create' as BuildAction,  // Backend expects 'create' for new deliverables
          ...buildData,
        },
      },
    };
  },

  /**
   * Read current deliverable
   */
  read: (
    metadata: RequestMetadata,
    deliverableId?: string,
  ): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.read',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'read' as BuildAction,
          ...(deliverableId ? { deliverableId } : {}),
        },
      },
    };
  },

  /**
   * List all deliverables in conversation
   */
  list: (metadata: RequestMetadata): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.list',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'list' as BuildAction,
        },
      },
    };
  },

  /**
   * Rerun a build
   */
  rerun: (
    metadata: RequestMetadata & { userMessage: string },
    rerunData: { versionId: string; config?: Record<string, unknown> },
  ): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');
    validateRequired(rerunData.versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.rerun',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'rerun' as BuildAction,
          ...rerunData,
        },
      },
    };
  },

  /**
   * Edit deliverable
   */
  edit: (
    metadata: RequestMetadata & { userMessage: string },
    editData: { versionId?: string; content?: string },
  ): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.edit',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'edit' as BuildAction,
          ...editData,
        },
      },
    };
  },

  /**
   * Set current deliverable version
   */
  setCurrent: (metadata: RequestMetadata, versionId: string): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.set_current',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'set_current' as BuildAction,
          versionId,
        },
      },
    };
  },

  /**
   * Delete deliverable version
   */
  deleteVersion: (metadata: RequestMetadata, versionId: string): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.delete_version',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'delete_version' as BuildAction,
          versionId,
        },
      },
    };
  },

  /**
   * Merge deliverable versions
   */
  mergeVersions: (
    metadata: RequestMetadata & { userMessage: string },
    mergeData: { versionIds: string[]; mergePrompt: string },
  ): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');
    validateRequired(mergeData.versionIds, 'versionIds');
    validateRequired(mergeData.mergePrompt, 'mergePrompt');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.merge_versions',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'merge_versions' as BuildAction,
          ...mergeData,
        },
      },
    };
  },

  /**
   * Copy deliverable version
   */
  copyVersion: (metadata: RequestMetadata, versionId: string): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(versionId, 'versionId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.copy_version',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'copy_version' as BuildAction,
          versionId,
        },
      },
    };
  },

  /**
   * Delete deliverable
   */
  delete: (metadata: RequestMetadata, deliverableId: string): StrictBuildRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(deliverableId, 'deliverableId');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'build.delete',
      params: {
        context: metadata.context,
        mode: 'build' as AgentTaskMode,
        userMessage: metadata.userMessage || '',
        messages: metadata.messages || [],
        payload: {
          action: 'delete' as BuildAction,
          deliverableId,
        },
      },
    };
  },
};

/**
 * Converse request builder
 */
export const buildConverseRequest = {
  /**
   * Send a conversation message
   */
  send: (
    metadata: RequestMetadata & { userMessage: string },
  ): StrictConverseRequest => {
    validateRequired(metadata.context, 'context');
    validateRequired(metadata.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'converse',
      params: {
        context: metadata.context,
        mode: 'converse' as AgentTaskMode,
        userMessage: metadata.userMessage,
        messages: metadata.messages || [],
        payload: {
          action: 'send',
        },
      },
    };
  },
};

/**
 * Unified request builder
 * Provides a single entry point for all request types
 */
export const buildRequest = {
  plan: buildPlanRequest,
  build: buildBuildRequest,
  converse: buildConverseRequest,
};

/**
 * Validation helper
 */
function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new StrictRequestValidationError(
      fieldName,
      'This field is required and cannot be empty',
    );
  }
}

/**
 * Type guard to check if a value is a strict request
 */
export function isStrictRequest(value: unknown): value is StrictA2ARequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    obj.jsonrpc === '2.0' &&
    obj.id !== undefined &&
    obj.method !== undefined &&
    obj.params !== undefined
  );
}

/**
 * Validate a strict request before sending
 */
export function validateStrictRequest(
  request: StrictA2ARequest,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate JSON-RPC envelope
  if (request.jsonrpc !== '2.0') {
    errors.push('Invalid jsonrpc version');
  }
  if (!request.id) {
    errors.push('Missing request id');
  }
  if (!request.method) {
    errors.push('Missing method');
  }
  if (!request.params) {
    errors.push('Missing params');
  }

  // Validate params
  if (request.params) {
    const params = request.params as unknown as Record<string, unknown>;
    if (!params.mode) {
      errors.push('Missing mode in params');
    }
    if (!params.context) {
      errors.push('Missing context in params');
    }
  }

  return { valid: errors.length === 0, errors };
}
