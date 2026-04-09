/**
 * Unified A2A Orchestrator
 *
 * Single entry point for ALL A2A calls. The transport type determines:
 * 1. How to build the request (request-switch)
 * 2. How to handle the response (response-switch)
 *
 * Uses ExecutionContext - the core context that flows through the entire system.
 *
 * Usage:
 * ```typescript
 * const result = await a2aOrchestrator.execute('hitl.approve', payload);
 *
 * switch (result.type) {
 *   case 'deliverable':
 *     openDeliverablesModal(result.deliverable);
 *     break;
 *   case 'hitl_waiting':
 *     // Stay in modal, show new content
 *     break;
 *   case 'error':
 *     showError(result.error);
 *     break;
 * }
 * ```
 *
 * @see docs/prd/unified-a2a-orchestrator.md
 */

import type { A2ATrigger, A2APayload, A2AResult, StreamProgressEvent } from './types';
import type { TaskResponse } from '../legacy-types';
import { buildA2ARequest } from './request-switch';
import { handleA2AResponse } from './response-switch';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useRbacStore } from '@/stores/rbacStore';
import { triggerReLogin } from '@/services/utils/authenticatedFetch';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import { invoke, invokeStream } from '@/services/invoke-client';
import type { InvokeOptions } from '@/services/invoke-client';

// Get API base URL from environment
const API_BASE_URL = getSecureApiBaseUrl();

/**
 * Options for streaming execution
 */
export interface StreamingOptions {
  /** Callback for progress events */
  onProgress?: (event: StreamProgressEvent) => void;
  /** Callback when stream connects */
  onConnect?: () => void;
  /** Callback when stream completes */
  onComplete?: () => void;
  /** Callback for stream errors */
  onError?: (error: string) => void;
}

/**
 * Unified A2A Orchestrator
 *
 * Single entry point for ALL A2A calls. The transport type determines:
 * 1. How to build the request (request-switch)
 * 2. How to handle the response (response-switch)
 *
 * Uses ExecutionContext - the core context that flows through the entire system.
 */
class A2AOrchestrator {
  /**
   * Execute an A2A call
   *
   * @param trigger - What action triggered this call
   * @param payload - Trigger-specific payload data (versionId, feedback, etc.)
   * @returns Unified result that UI can switch on
   *
   * **Context Handling (Store-First Approach):**
   * - Context is NEVER passed as parameters between functions
   * - Each function gets context from store internally when it needs it:
   *   - buildA2ARequest() -> gets context from store
   *   - API call -> uses agentSlug/orgSlug from store
   *   - handleA2AResponse() -> gets/updates context from store
   * - Only the backend can update context (adds planId/deliverableId)
   * - Store is automatically updated with returned context after response
   * - User can change provider/model via executionContextStore.setLLM()
   */
  async execute(trigger: A2ATrigger, payload: A2APayload = {}): Promise<A2AResult> {
    try {
      // 1. Get context from store
      const executionContextStore = useExecutionContextStore();
      executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      // 2. Build the legacy request to extract action-specific params
      const request = buildA2ARequest(trigger, payload);

      // 3. The action params (mode, userMessage, payload, etc.) become data.content
      //    Context is passed separately — it flows whole, never destructured
      const invokeOptions: InvokeOptions = { baseUrl: API_BASE_URL };
      const invokeData = {
        content: JSON.stringify(request.params),
        contentType: 'application/json',
      };

      // 4. Call /invoke (v2 contract)
      const result = await invoke(ctx, invokeData, invokeOptions);

      // 5. On 401, trigger re-login
      if (!result.success && result.error.code === 401) {
        await triggerReLogin();
        return { type: 'error', error: result.error.message, code: 401 };
      }

      if (!result.success) {
        return {
          type: 'error',
          error: result.error.message,
          code: result.error.code,
        };
      }

      // 6. Map InvokeOutput back to TaskResponse shape for handleA2AResponse
      //    output.content is what the backend stored in TaskResponseDto
      const taskResponse = this.extractTaskResponse(result.output.content);
      if (!taskResponse) {
        return {
          type: 'error',
          error: 'Invalid response structure from API',
        };
      }

      // Update context if backend returned one
      if (result.context) {
        executionContextStore.update(result.context);
      }

      // 7. Handle response via existing response-switch
      return await handleA2AResponse(taskResponse);
    } catch (error) {
      console.error(`A2A Orchestrator error for trigger ${trigger}:`, error);
      return {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract TaskResponse from JSON-RPC envelope or direct payload
   */
  private extractTaskResponse(data: unknown): TaskResponse | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;

    // JSON-RPC 2.0 success response
    if (record.jsonrpc === '2.0' && record.result) {
      const result = record.result as TaskResponse;
      // Validate it looks like a TaskResponse
      if (typeof result.success === 'boolean' && typeof result.mode === 'string') {
        return result;
      }
    }

    // Direct TaskResponse (legacy support)
    if (typeof record.success === 'boolean' && typeof record.mode === 'string') {
      return record as unknown as TaskResponse;
    }

    return null;
  }

  /**
   * Execute an A2A call with real-time streaming progress
   *
   * This method:
   * 1. Generates a new taskId (so we know it before the POST)
   * 2. Connects to the task-specific stream endpoint FIRST
   * 3. Makes the POST request while the stream is already connected
   * 4. Receives real-time progress events via the stream
   * 5. Returns the final result when the POST completes
   *
   * @param trigger - What action triggered this call
   * @param payload - Trigger-specific payload data
   * @param streamingOptions - Callbacks for streaming events
   * @returns Unified result that UI can switch on
   */
  async executeWithStreaming(
    trigger: A2ATrigger,
    payload: A2APayload = {},
    streamingOptions: StreamingOptions = {},
  ): Promise<A2AResult> {
    const { onProgress, onConnect, onComplete, onError } = streamingOptions;

    return new Promise<A2AResult>((resolve) => {
      const executionContextStore = useExecutionContextStore();
      const rbacStore = useRbacStore();
      const token = rbacStore.token;

      if (!token) {
        resolve({ type: 'error', error: 'Authentication required' });
        return;
      }

      executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      // Build action-specific data from the legacy request builder
      const request = buildA2ARequest(trigger, payload);
      const invokeOptions: InvokeOptions = { baseUrl: API_BASE_URL, token };
      const invokeData = {
        content: JSON.stringify(request.params),
        contentType: 'application/json',
      };

      // Use invoke-client streaming — maps SSE StreamEvents to progress callbacks
      const { abort } = invokeStream(
        ctx,
        invokeData,
        invokeOptions,
        async (event) => {
          if (event.event === 'error') {
            const errData = event.data as { message?: string };
            onError?.(errData.message || 'Stream error');
            resolve({ type: 'error', error: errData.message || 'Stream error' });
            return;
          }

          if (event.event === 'progress') {
            const progressData = event.data as Record<string, unknown>;
            const progressEvent: StreamProgressEvent = {
              hookEventType: (progressData.hookEventType as string) || event.event,
              progress: (progressData.progress as number) ?? null,
              message: (progressData.message as string) ?? null,
              step: (progressData.step as string) ?? null,
              status: (progressData.status as string) ?? null,
              context: event.context,
              timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
            };
            onProgress?.(progressEvent);
            return;
          }

          if (event.event === 'connected') {
            onConnect?.();
            return;
          }

          if (event.event === 'complete') {
            onComplete?.();
            // The final result is in the non-streaming invoke — fall through to resolve below
            return;
          }

          // output event — final result
          if (event.event === 'output') {
            const outputData = event.data as Record<string, unknown>;
            // Update context if backend returned one
            if (event.context) {
              executionContextStore.update(event.context);
            }
            const taskResponse = this.extractTaskResponse(outputData.content);
            if (!taskResponse) {
              resolve({ type: 'error', error: 'Invalid response structure from streaming API' });
              return;
            }
            handleA2AResponse(taskResponse).then(resolve).catch((err: unknown) => {
              resolve({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
            });
          }
        },
      );

      // If something goes wrong before first event, abort after timeout
      void abort; // kept for potential cleanup
    }).catch((error: unknown) => {
      console.error(`A2A Client streaming error for trigger ${trigger}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onError?.(errorMessage);
      return { type: 'error' as const, error: errorMessage };
    });
  }

  /**
   * Execute an A2A call asynchronously (fire-and-forget POST).
   *
   * The server returns immediately with { taskId, streamId, streamEndpoint }.
   * The caller should connect to SSE to receive progress and completion events.
   * Use this for long-running agents (marketing swarm, legal department)
   * to avoid Cloudflare 524 timeouts.
   *
   * @param trigger - What action triggered this call
   * @param payload - Trigger-specific payload data
   * @returns { taskId, streamId, streamEndpoint } or error
   */
  async executeAsync(
    trigger: A2ATrigger,
    payload: A2APayload = {},
  ): Promise<
    | { type: 'accepted'; taskId: string; streamId: string; streamEndpoint: string }
    | { type: 'error'; error: string; code?: number }
  > {
    try {
      const executionContextStore = useExecutionContextStore();
      executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      // Build action-specific data and call /invoke
      const request = buildA2ARequest(trigger, payload);
      const invokeOptions: InvokeOptions = { baseUrl: API_BASE_URL };
      const invokeData = {
        content: JSON.stringify(request.params),
        contentType: 'application/json',
      };

      const result = await invoke(ctx, invokeData, invokeOptions, { async: true });

      if (!result.success) {
        if (result.error.code === 401) {
          await triggerReLogin();
        }
        return { type: 'error', error: result.error.message, code: result.error.code };
      }

      // Update context if backend returned one
      if (result.context) {
        executionContextStore.update(result.context);
      }

      const outputContent = result.output.content as Record<string, unknown> | undefined;

      return {
        type: 'accepted',
        taskId: (outputContent?.taskId as string) || executionContextStore.taskId || '',
        streamId: (outputContent?.streamId as string) || executionContextStore.taskId || '',
        streamEndpoint: (outputContent?.streamEndpoint as string) || '',
      };
    } catch (error) {
      console.error(`A2A Orchestrator async error for trigger ${trigger}:`, error);
      return {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
export const a2aOrchestrator = new A2AOrchestrator();

// Also export the class for testing
export { A2AOrchestrator };
