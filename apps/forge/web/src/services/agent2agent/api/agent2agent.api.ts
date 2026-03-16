/**
 * Agent2Agent API Client
 * Unified client for all mode × action operations
 */

import {
  PlanRequest,
  PlanResponse,
  DeliverableRequest,
  DeliverableResponse,
  TaskMode,
  // CreatePlanRequest,
  // EditPlanRequest,
  // ReadPlanRequest,
} from '../types';
import { useAuthStore } from '@/stores/rbacStore';
import type {
  // A2ATaskRequest,
  // A2ATaskResponse,
  // AgentTaskMode,
  // isJsonRpcSuccessResponse,
  // isJsonRpcErrorResponse,
  StrictA2ARequest,
  StrictA2ASuccessResponse,
  StrictA2AErrorResponse,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import {
  buildRequest,
  validateStrictRequest,
  StrictRequestValidationError,
} from '../utils/builders';
import {
  handleResponse,
  validateJsonRpcEnvelope,
  isStrictError,
  extractErrorDetails,
  StrictResponseValidationError,
} from '../utils/handlers';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

// Get API base URL from environment
const API_BASE_URL = getSecureApiBaseUrl();

/**
 * Base API client configuration
 */
interface ApiConfig {
  agentSlug: string;
  headers?: Record<string, string>;
}

/**
 * Agent2Agent API Client
 * Handles all plan and deliverable operations through mode × action architecture
 */
export class Agent2AgentApi {
  private agentSlug: string;
  private headers: Record<string, string>;
  private authStore: ReturnType<typeof useAuthStore>;

  constructor(config: ApiConfig) {
    this.agentSlug = config.agentSlug;
    this.authStore = useAuthStore();
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * Get current organization slug from authStore
   */
  private getOrgSlug(): string {
    const org = this.authStore.currentOrganization;
    if (!org) {
      throw new Error('No organization context available');
    }
    return org;
  }

  /**
   * Get auth headers with current access token
   */
  private getAuthHeaders(): Record<string, string> {
    const token = this.authStore.token;
    return {
      ...this.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Get execution context from the store
   * The store is the single source of truth for context - it's initialized when
   * a conversation is selected and updated after every API response.
   */
  private getContext(): ExecutionContext {
    const store = useExecutionContextStore();
    return store.current; // Throws if not initialized
  }

  // ============================================================================
  // PLAN OPERATIONS
  // ============================================================================

  /**
   * Execute a plan operation
   */
  async executePlanAction(request: PlanRequest): Promise<PlanResponse> {
    return this.executeAction(request.mode, request);
  }

  /**
   * Convenience methods for plan operations
   * Uses strict type builders to guarantee all required fields are set
   */
  plans = {
    create: async (conversationId: string, message: string) => {
      const strictRequest = buildRequest.plan.create({
        userMessage: message,
      });
      return this.executeStrictRequest(strictRequest);
    },

    read: async (_conversationId: string) => {
      const strictRequest = buildRequest.plan.read();
      return this.executeStrictRequest(strictRequest);
    },

    list: async (_conversationId: string) => {
      const strictRequest = buildRequest.plan.list();
      return this.executeStrictRequest(strictRequest);
    },

    edit: async (_conversationId: string, editedContent: string, _metadata?: Record<string, unknown>) => {
      const strictRequest = buildRequest.plan.edit({
        userMessage: 'Edit plan',
        content: editedContent,
      });
      return this.executeStrictRequest(strictRequest);
    },

    rerun: async (
      conversationId: string,
      versionId: string,
      config: Record<string, unknown>,
      userMessage?: string
    ) => {
      const strictRequest = buildRequest.plan.rerun({
        versionId,
        config,
        userMessage: userMessage || 'Please regenerate this plan with the same requirements',
      });
      return this.executeStrictRequest(strictRequest);
    },

    setCurrent: async (conversationId: string, versionId: string) => {
      return this.executePlanAction({
        mode: TaskMode.PLAN,
        action: 'set_current',
        conversationId,
        params: { versionId },
      });
    },

    deleteVersion: async (conversationId: string, versionId: string) => {
      return this.executePlanAction({
        mode: TaskMode.PLAN,
        action: 'delete_version',
        conversationId,
        params: { versionId },
      });
    },

    mergeVersions: async (
      conversationId: string,
      versionIds: string[],
      mergePrompt: string,
    ) => {
      return this.executePlanAction({
        mode: TaskMode.PLAN,
        action: 'merge_versions',
        conversationId,
        params: { versionIds, mergePrompt },
      });
    },

    copyVersion: async (conversationId: string, versionId: string) => {
      return this.executePlanAction({
        mode: TaskMode.PLAN,
        action: 'copy_version',
        conversationId,
        params: { versionId },
      });
    },

    delete: async (conversationId: string) => {
      return this.executePlanAction({
        mode: TaskMode.PLAN,
        action: 'delete',
        conversationId,
        params: {},
      });
    },
  };

  // ============================================================================
  // DELIVERABLE OPERATIONS
  // ============================================================================

  /**
   * Execute a deliverable operation
   */
  async executeDeliverableAction(
    request: DeliverableRequest,
  ): Promise<DeliverableResponse> {
    return this.executeAction(request.mode, request);
  }

  /**
   * Convenience methods for deliverable operations
   * Uses strict type builders to guarantee all required fields are set
   */
  deliverables = {
    create: async (conversationId: string, message: string) => {
      const strictRequest = buildRequest.build.execute({
        userMessage: message,
      });
      return this.executeStrictRequest(strictRequest);
    },

    read: async (_conversationId: string) => {
      const strictRequest = buildRequest.build.read();
      return this.executeStrictRequest(strictRequest);
    },

    list: async (_conversationId: string) => {
      const strictRequest = buildRequest.build.list();
      return this.executeStrictRequest(strictRequest);
    },

    edit: async (conversationId: string, editedContent: string, metadata?: Record<string, unknown>) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'edit',
        conversationId,
        params: {
          content: editedContent,
          metadata,
        },
      });
    },

    rerun: async (conversationId: string, versionId: string, config: Record<string, unknown>, userMessage?: string) => {
      const strictRequest = buildRequest.build.rerun({
        versionId,
        config,
        userMessage: userMessage || 'Please regenerate this deliverable with the same requirements',
      });
      return this.executeStrictRequest(strictRequest);
    },

    setCurrent: async (conversationId: string, versionId: string) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'set_current',
        conversationId,
        params: { versionId },
      });
    },

    deleteVersion: async (conversationId: string, versionId: string) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'delete_version',
        conversationId,
        params: { versionId },
      });
    },

    mergeVersions: async (
      conversationId: string,
      versionIds: string[],
      mergePrompt: string,
    ) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'merge_versions',
        conversationId,
        params: { versionIds, mergePrompt },
      });
    },

    copyVersion: async (conversationId: string, versionId: string) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'copy_version',
        conversationId,
        params: { versionId },
      });
    },

    delete: async (conversationId: string) => {
      return this.executeDeliverableAction({
        mode: TaskMode.BUILD,
        action: 'delete',
        conversationId,
        params: {},
      });
    },
  };

  // ============================================================================
  // REMOVED: Orchestrate operations - no longer supported in Orchestrator V2

  // ============================================================================
  // CORE EXECUTION METHODS
  // ============================================================================

  /**
   * Execute a strict A2A request with full validation
   * This is the preferred method that guarantees all required fields are set
   */
  private async executeStrictRequest<T = unknown>(
    request: StrictA2ARequest,
  ): Promise<T> {
    // Validate request before sending
    const validation = validateStrictRequest(request);
    if (!validation.valid) {
      throw new StrictRequestValidationError(
        'request',
        `Request validation failed: ${validation.errors.join(', ')}`
      );
    }

    // Get execution context from store - single source of truth
    const context = this.getContext();

    const enrichedRequest = {
      ...request,
      params: {
        ...request.params,
        context,
      },
    };

    const org = this.getOrgSlug();
    const endpoint = `${API_BASE_URL}/agent-to-agent/${encodeURIComponent(org)}/${encodeURIComponent(this.agentSlug)}/tasks`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(enrichedRequest),
      });

      if (!response.ok) {
        let errorPayload: unknown;
        try {
          errorPayload = await response.json();
        } catch {
          errorPayload = undefined;
        }

        const errorRecord = this.asRecord(errorPayload) ?? {};
        const jsonrpc =
          typeof errorRecord['jsonrpc'] === 'string'
            ? (errorRecord['jsonrpc'] as string)
            : undefined;
        const errorDetails = this.asRecord(errorRecord['error']);

        if (jsonrpc === '2.0' && errorDetails) {
          const message =
            typeof errorDetails.message === 'string'
              ? errorDetails.message
              : response.statusText;
          throw new Error(message || 'JSON-RPC error');
        }

        const message =
          typeof errorRecord['message'] === 'string'
            ? (errorRecord['message'] as string)
            : response.statusText;

        throw new Error(message || 'API request failed');
      }

      const envelopePayload = await this.readJsonSafe(response);
      const envelopeRecord = this.asRecord(envelopePayload);

      if (!envelopeRecord) {
        throw new Error('Agent2Agent API returned an invalid JSON payload');
      }

      const data = envelopeRecord as unknown as StrictA2ASuccessResponse | StrictA2AErrorResponse;

      // Validate JSON-RPC envelope
      const envelopeValidation = validateJsonRpcEnvelope(data);
      if (!envelopeValidation.valid) {
        throw new StrictResponseValidationError(
          `Invalid JSON-RPC envelope: ${envelopeValidation.errors.join(', ')}`,
          data,
        );
      }

      // Handle error response
      if (isStrictError(data)) {
        const errorDetails = extractErrorDetails(data);
        throw new Error(errorDetails.message);
      }

      // Handle success response with mode-specific handler
      const mode = request.method.split('.')[0]; // Extract mode from method (e.g., 'plan.create' -> 'plan')

      let content;
      if (mode === 'plan') {
        content = handleResponse.plan.handle(data);
      } else if (mode === 'build') {
        content = handleResponse.build.handle(data);
      } else if (mode === 'converse') {
        content = handleResponse.converse.handle(data);
      } else {
        // Fallback for other modes
        const taskResponse = data.result;
        content = taskResponse.payload?.content || taskResponse;
      }

      // Return in frontend format
      return {
        success: true,
        data: content,
      } as T;
    } catch (error) {
      console.error(`Agent2Agent strict request error (${request.method}):`, error);
      throw error;
    }
  }

  /**
   * Core method to execute any mode × action request (legacy)
   * @deprecated Use executeStrictRequest instead
   */
  private async executeAction<T = unknown>(
    mode: TaskMode,
    request: PlanRequest | DeliverableRequest,
  ): Promise<T> {
    const org = this.getOrgSlug();
    const endpoint = `${API_BASE_URL}/agent-to-agent/${encodeURIComponent(org)}/${encodeURIComponent(this.agentSlug)}/tasks`;

    try {
      // Extract message and other params
      const params = (request.params || {}) as Record<string, unknown>;
      const { message, userMessage, ...otherParams } = params;

      // Get execution context from store - single source of truth
      const context = this.getContext();

      const requestBody = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: mode,
        params: {
          context,
          userMessage: userMessage || message,
          conversationId: request.conversationId,
          payload: {
            action: request.action,
            ...otherParams,
          },
        },
      };


      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorPayload: unknown;
        try {
          errorPayload = await response.json();
        } catch {
          errorPayload = undefined;
        }

        const errorRecord = this.asRecord(errorPayload) ?? {};
        const jsonrpc =
          typeof errorRecord['jsonrpc'] === 'string'
            ? (errorRecord['jsonrpc'] as string)
            : undefined;
        const errorDetails = this.asRecord(errorRecord['error']);

        if (jsonrpc === '2.0' && errorDetails) {
          const message =
            typeof errorDetails.message === 'string'
              ? errorDetails.message
              : response.statusText;
          throw new Error(message || 'JSON-RPC error');
        }

        const message =
          typeof errorRecord['message'] === 'string'
            ? (errorRecord['message'] as string)
            : response.statusText;

        throw new Error(message || 'API request failed');
      }

      const payload = await this.readJsonSafe(response);
      const dataRecord = this.asRecord(payload);

      if (!dataRecord) {
        throw new Error('Agent2Agent API returned invalid JSON payload');
      }

      // Handle JSON-RPC 2.0 response format
      // Backend returns: { jsonrpc: "2.0", id: "...", result: TaskResponseDto }
      // Handlers expect: { jsonrpc: "2.0", id: "...", result: { success, mode, payload } }

      if (dataRecord['jsonrpc'] === '2.0') {
        // Already in JSON-RPC format - return as is
        if (dataRecord['error']) {
          const errorInfo = this.asRecord(dataRecord['error']);
          const message =
            errorInfo && typeof errorInfo.message === 'string'
              ? errorInfo.message
              : 'JSON-RPC error';
          throw new Error(message);
        }
        return dataRecord as T;
      } else {
        // Direct TaskResponseDto - wrap it in JSON-RPC format for handlers
        return {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          result: dataRecord,
        } as T;
      }
    } catch (error) {
      console.error(`Agent2Agent API error (${mode}/${request.action}):`, error);
      throw error;
    }
  }

  private async readJsonSafe(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse Agent2Agent response JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }

  /**
   * Set custom headers (e.g., auth token)
   */
  setHeaders(headers: Record<string, string>) {
    this.headers = {
      ...this.headers,
      ...headers,
    };
  }

  /**
   * Set auth token
   */
  setAuthToken(token: string) {
    this.headers['Authorization'] = `Bearer ${token}`;
  }
}

/**
 * Factory function to create an Agent2AgentApi instance for a specific agent
 */
export function createAgent2AgentApi(agentSlug: string): Agent2AgentApi {
  return new Agent2AgentApi({ agentSlug });
}
