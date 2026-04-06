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
import type { StrictA2AErrorResponse, TaskResponse } from '@/types/forge-types';
import { buildA2ARequest } from './request-switch';
import { handleA2AResponse } from './response-switch';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useRbacStore } from '@/stores/rbacStore';
import { authenticatedFetch, triggerReLogin } from '@/services/utils/authenticatedFetch';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

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
      // 1. Get context from store and generate a new taskId
      // Each A2A call creates a new task, so we need a unique taskId
      const executionContextStore = useExecutionContextStore();
      executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      // 2. Build the legacy request - gets context from store internally
      const request = buildA2ARequest(trigger, payload);

      // 3. Reshape to invoke contract: { context, data: { content }, metadata }
      const invokeRequest = {
        jsonrpc: '2.0' as const,
        id: request.id,
        method: 'invoke' as const,
        params: {
          context: ctx,
          data: {
            content: request.params, // The old params become data.content
          },
          metadata: { trigger },
        },
      };

      // 4. Send to API via invoke contract
      const endpoint = `${API_BASE_URL}/invoke`;

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invokeRequest),
      });

      if (!response.ok) {
        const errorData = await this.tryParseJson(response);
        const errorMessage = this.extractErrorMessage(errorData, response.statusText);

        // If still 401 after auto-refresh, trigger re-login
        if (response.status === 401) {
          await triggerReLogin();
        }

        return {
          type: 'error',
          error: errorMessage,
          code: response.status,
        };
      }

      // 6. Parse response
      const data = await this.tryParseJson(response);
      console.log('🔍 [A2A-ORCHESTRATOR] Raw response data:', JSON.stringify(data, null, 2)?.substring(0, 1000));
      if (!data) {
        return {
          type: 'error',
          error: 'Invalid JSON response from API',
        };
      }

      // 7. Extract TaskResponse from JSON-RPC envelope
      const taskResponse = this.extractTaskResponse(data);
      console.log('🔍 [A2A-ORCHESTRATOR] Extracted taskResponse:', taskResponse ? { success: taskResponse.success, mode: taskResponse.mode, hasPayload: !!taskResponse.payload } : null);
      if (!taskResponse) {
        // Check if it's a JSON-RPC error
        const rpcError = (data as StrictA2AErrorResponse)?.error;
        if (rpcError) {
          return {
            type: 'error',
            error: rpcError.message || 'JSON-RPC error',
            code: rpcError.code,
          };
        }
        return {
          type: 'error',
          error: 'Invalid response structure from API',
        };
      }

      // 8. Handle response - gets context from store internally
      // This also updates the ExecutionContext store with the returned context
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
   * Safely parse JSON from response
   */
  private async tryParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Extract error message from various error formats
   */
  private extractErrorMessage(data: unknown, fallback: string): string {
    if (!data || typeof data !== 'object') {
      return fallback;
    }

    const record = data as Record<string, unknown>;

    // JSON-RPC error format
    if (record.jsonrpc === '2.0' && record.error) {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === 'string') {
        return error.message;
      }
    }

    // Direct message field
    if (typeof record.message === 'string') {
      return record.message;
    }

    return fallback;
  }

  /**
   * Extract TaskResponse from JSON-RPC envelope.
   *
   * Handles both the old TaskResponse format (with mode/payload) and the new
   * invoke contract format (with output: { content, outputType }).
   */
  private extractTaskResponse(data: unknown): TaskResponse | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;

    // JSON-RPC 2.0 success response
    if (record.jsonrpc === '2.0' && record.result) {
      const result = record.result as Record<string, unknown>;

      // Old format: result has mode + payload
      if (typeof result.success === 'boolean' && typeof result.mode === 'string') {
        return result as unknown as TaskResponse;
      }

      // New invoke format: result has output: { content, outputType }
      if (result.output && typeof result.output === 'object') {
        const output = result.output as Record<string, unknown>;
        const content = output.content as Record<string, unknown> | string | undefined;
        const outputMetadata = output.metadata as Record<string, unknown> | undefined;

        // Synthesize a TaskResponse from the invoke output.
        // The capability handler's output.content contains the business data.
        // Default to 'converse' mode (pass-through as message) unless the
        // content or metadata explicitly declares a mode (plan, build, hitl).
        const inferredMode =
          (outputMetadata?.mode as string) ||
          (typeof content === 'object' && content?.mode as string) ||
          (typeof content === 'object' && content?.deliverable ? 'build' : null) ||
          (typeof content === 'object' && content?.plan ? 'plan' : null) ||
          'converse';

        return {
          success: result.success !== false,
          mode: inferredMode,
          payload: {
            content: typeof content === 'object' ? content : { message: content },
            metadata: outputMetadata,
          },
          context: result.context,
        } as unknown as TaskResponse;
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
    let eventSource: EventSource | null = null;

    try {
      // 1. Get context from store and generate a new taskId
      const executionContextStore = useExecutionContextStore();
      const rbacStore = useRbacStore();
      const token = rbacStore.token;

      if (!token) {
        return { type: 'error', error: 'Authentication required' };
      }

      // Generate new taskId BEFORE connecting to stream
      // This allows us to connect to the task-specific stream endpoint
      const taskId = executionContextStore.newTaskId();
      const ctx = executionContextStore.current; // Get updated context with new taskId

      // 2. Connect to observability stream for real-time progress
      // Uses the invoke/stream endpoint with conversationId for filtering
      const streamUrl = new URL(
        `${API_BASE_URL}/observability/stream`,
      );
      streamUrl.searchParams.set('token', token);
      streamUrl.searchParams.set('conversationId', ctx.conversationId);

      console.log('[A2A Client] 🔌 Connecting to task stream:', taskId);

      eventSource = new EventSource(streamUrl.toString());

      eventSource.onopen = () => {
        console.log('[A2A Client] ✅ Task stream connected');
        onConnect?.();
      };

      // Handler for unnamed SSE messages (heartbeats, connection confirmations)
      eventSource.onmessage = (event) => {
        try {
          console.log('[A2A Client] 📨 Unnamed SSE message:', event.data?.substring(0, 200));
          const data = JSON.parse(event.data);

          // Log connection confirmations
          if (data.event_type === 'connected') {
            console.log('[A2A Client] 📨 Connection confirmed by server');
            return;
          }

          // Heartbeat or other unnamed messages
          console.log('[A2A Client] 📨 Heartbeat or system message');
        } catch (err) {
          console.error('[A2A Client] Failed to parse SSE message:', err, 'Raw data:', event.data);
        }
      };

      // Helper to process named SSE events and forward to callback
      const processStreamEvent = (eventType: string, event: MessageEvent) => {
        try {
          console.log(`[A2A Client] 📨 Named SSE event [${eventType}]:`, event.data?.substring(0, 200));
          const data = JSON.parse(event.data);

          // Backend sends data in this structure:
          // {
          //   context: {...},
          //   streamId: string,
          //   mode: string,
          //   userMessage: string,
          //   timestamp: string,
          //   chunk: { type, content, metadata: { progress, step, ... } }
          // }
          const chunk = data.chunk || {};
          const metadata = chunk.metadata || {};

          // Forward progress events to callback
          const progressEvent: StreamProgressEvent = {
            hookEventType: data.hook_event_type || chunk.type || eventType,
            progress: metadata.progress ?? data.progress ?? null,
            message: chunk.content ?? data.message ?? data.userMessage ?? null,
            step: metadata.step ?? data.step ?? null,
            status: metadata.status ?? data.status ?? null,
            context: data.context,
            timestamp: data.timestamp || Date.now(),
          };

          console.log('[A2A Client] 📦 Progress event:', progressEvent.hookEventType, progressEvent.progress, progressEvent.message?.substring(0, 80));
          onProgress?.(progressEvent);
        } catch (err) {
          console.error(`[A2A Client] Failed to parse SSE event [${eventType}]:`, err, 'Raw data:', event.data);
        }
      };

      // Listen for named events from the backend
      // Backend sends: agent_stream_chunk, agent_stream_complete, agent_stream_error
      eventSource.addEventListener('agent_stream_chunk', (event) => {
        processStreamEvent('agent_stream_chunk', event);
      });

      eventSource.addEventListener('agent_stream_complete', (event) => {
        processStreamEvent('agent_stream_complete', event);
        console.log('[A2A Client] ✅ Stream complete event received');
      });

      eventSource.addEventListener('agent_stream_error', (event) => {
        processStreamEvent('agent_stream_error', event);
        console.error('[A2A Client] ❌ Stream error event received');
        try {
          const data = JSON.parse(event.data);
          onError?.(data.error || 'Stream error');
        } catch {
          onError?.('Stream error');
        }
      });

      eventSource.onerror = (err) => {
        const es = err.target as EventSource;
        console.error(
          '[A2A Client] SSE stream error - readyState:',
          es?.readyState,
          '(0=CONNECTING, 1=OPEN, 2=CLOSED)',
        );
        // Log more details about the error
        console.error('[A2A Client] Stream URL:', es?.url?.substring(0, 100));
        // Don't fail the whole operation - just log the error
        // The POST request will still complete
      };

      // Wait for the connection confirmation message before proceeding
      // This ensures the stream is truly ready to receive events
      await new Promise<void>((resolve) => {
        const checkReady = setInterval(() => {
          if (eventSource?.readyState === EventSource.OPEN) {
            clearInterval(checkReady);
            resolve();
          }
        }, 50);
        // Timeout after 2 seconds
        setTimeout(() => {
          clearInterval(checkReady);
          resolve();
        }, 2000);
      });

      // 3. Build and send the request via invoke contract
      const request = buildA2ARequest(trigger, payload);
      const invokeRequest = {
        jsonrpc: '2.0' as const,
        id: request.id,
        method: 'invoke' as const,
        params: {
          context: ctx,
          data: {
            content: request.params,
          },
          metadata: { trigger },
        },
      };

      const endpoint = `${API_BASE_URL}/invoke`;

      console.log('[A2A Client] 📤 Sending POST request with taskId:', taskId);

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invokeRequest),
      });

      // 4. Close the stream now that we have the response
      if (eventSource) {
        console.log('[A2A Client] 🔌 Closing task stream');
        eventSource.close();
        eventSource = null;
        onComplete?.();
      }

      // 5. Process response (same as regular execute)
      if (!response.ok) {
        const errorData = await this.tryParseJson(response);
        const errorMessage = this.extractErrorMessage(errorData, response.statusText);
        onError?.(errorMessage);

        // If still 401 after auto-refresh, trigger re-login
        if (response.status === 401) {
          await triggerReLogin();
        }

        return { type: 'error', error: errorMessage, code: response.status };
      }

      const data = await this.tryParseJson(response);
      console.log('[A2A Client] 📥 Response received');

      if (!data) {
        return { type: 'error', error: 'Invalid JSON response from API' };
      }

      const taskResponse = this.extractTaskResponse(data);
      if (!taskResponse) {
        const rpcError = (data as StrictA2AErrorResponse)?.error;
        if (rpcError) {
          return { type: 'error', error: rpcError.message || 'JSON-RPC error', code: rpcError.code };
        }
        return { type: 'error', error: 'Invalid response structure from API' };
      }

      return await handleA2AResponse(taskResponse);
    } catch (error) {
      // Clean up stream on error
      if (eventSource) {
        eventSource.close();
      }
      console.error(`A2A Client streaming error for trigger ${trigger}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onError?.(errorMessage);
      return { type: 'error', error: errorMessage };
    }
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

      const request = buildA2ARequest(trigger, payload);
      const invokeRequest = {
        jsonrpc: '2.0' as const,
        id: request.id,
        method: 'invoke' as const,
        params: {
          context: ctx,
          data: {
            content: request.params,
          },
          metadata: { trigger, async: true },
        },
      };

      // POST to invoke endpoint
      const endpoint = `${API_BASE_URL}/invoke`;

      console.log('[A2A-ORCHESTRATOR] Async execute:', { trigger, taskId: executionContextStore.taskId, endpoint });

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invokeRequest),
      });

      if (!response.ok) {
        const errorData = await this.tryParseJson(response);
        const errorMessage = this.extractErrorMessage(errorData, response.statusText);

        if (response.status === 401) {
          await triggerReLogin();
        }

        return { type: 'error', error: errorMessage, code: response.status };
      }

      const data = await this.tryParseJson(response) as Record<string, unknown> | null;
      if (!data) {
        return { type: 'error', error: 'Invalid JSON response from async endpoint' };
      }

      // Extract from JSON-RPC envelope if present
      const result = (data.jsonrpc === '2.0' && data.result)
        ? data.result as Record<string, unknown>
        : data;

      // Update context store with returned context
      if (result.context) {
        executionContextStore.update(result.context as import('@orchestrator-ai/transport-types').ExecutionContext);
      }

      return {
        type: 'accepted',
        taskId: (result.taskId as string) || executionContextStore.taskId || '',
        streamId: (result.streamId as string) || executionContextStore.taskId || '',
        streamEndpoint: (result.streamEndpoint as string) || '',
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
