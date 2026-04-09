/**
 * Forge Orchestrator
 *
 * Single entry point for business-level A2A calls in Forge Web.
 * Wraps the v2 invoke contract (from invoke-client.ts) and maps
 * invoke responses to typed A2AResult objects that the UI can switch on.
 *
 * This module replaces apps/forge/web/src/services/agent2agent/orchestrator/.
 *
 * Transport contract (v2):
 *   POST /invoke
 *   { jsonrpc: "2.0", id, method: "invoke",
 *     params: { context: ExecutionContext, data: { content }, metadata? } }
 *
 * ExecutionContext always flows from the store — never constructed here.
 */

export type {
  A2ATrigger,
  A2APayload,
  A2AResult,
  LlmOverrideConfig,
  PlanResult,
  DeliverableResult,
  MessageResult,
  HitlWaitingResult,
  SuccessResult,
  ErrorResult,
  StreamingResult,
  StreamProgressEvent,
  ExecutionContext,
} from './forge-orchestrator-types';

export {
  isPlanResult,
  isDeliverableResult,
  isMessageResult,
  isHitlWaitingResult,
  isSuccessResult,
  isErrorResult,
  isStreamingResult,
  NIL_UUID,
  isNilUuid,
} from './forge-orchestrator-types';

export { handleA2AResponse } from './forge-response-switch';
export { buildA2ARequest } from './forge-request-switch';

import type { A2ATrigger, A2APayload, A2AResult } from './forge-orchestrator-types';
import type { StrictA2AErrorResponse, TaskResponse } from '@/types/forge-types';
import { buildA2ARequest } from './forge-request-switch';
import { handleA2AResponse } from './forge-response-switch';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { authenticatedFetch, triggerReLogin } from '@/services/utils/authenticatedFetch';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

const API_BASE_URL = getSecureApiBaseUrl();

/**
 * Execute an A2A call via the v2 invoke contract.
 *
 * Context comes from the executionContextStore — never passed as parameter.
 *
 * @param trigger - What action triggered this call
 * @param payload - Trigger-specific payload data
 * @returns Unified result that UI can switch on
 */
export async function executeA2A(
  trigger: A2ATrigger,
  payload: A2APayload = {},
): Promise<A2AResult> {
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
        metadata: { trigger },
      },
    };

    const endpoint = `${API_BASE_URL}/invoke`;

    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invokeRequest),
    });

    if (!response.ok) {
      const errorData = await tryParseJson(response);
      const errorMessage = extractErrorMessage(errorData, response.statusText);

      if (response.status === 401) {
        await triggerReLogin();
      }

      return { type: 'error', error: errorMessage, code: response.status };
    }

    const data = await tryParseJson(response);
    if (!data) {
      return { type: 'error', error: 'Invalid JSON response from API' };
    }

    const taskResponse = extractTaskResponse(data);
    if (!taskResponse) {
      const rpcError = (data as StrictA2AErrorResponse)?.error;
      if (rpcError) {
        return {
          type: 'error',
          error: rpcError.message || 'JSON-RPC error',
          code: rpcError.code,
        };
      }
      return { type: 'error', error: 'Invalid response structure from API' };
    }

    return await handleA2AResponse(taskResponse);
  } catch (error) {
    console.error(`Forge orchestrator error for trigger ${trigger}:`, error);
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function tryParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (record.jsonrpc === '2.0' && record.error) {
    const error = record.error as Record<string, unknown>;
    if (typeof error.message === 'string') return error.message;
  }
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

function extractTaskResponse(data: unknown): TaskResponse | null {
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;

  if (record.jsonrpc === '2.0' && record.result) {
    const result = record.result as Record<string, unknown>;

    // Old TaskResponse format: result has mode + payload
    if (typeof result.success === 'boolean' && typeof result.mode === 'string') {
      return result as unknown as TaskResponse;
    }

    // New invoke format: result has output: { content, outputType }
    if (result.output && typeof result.output === 'object') {
      const output = result.output as Record<string, unknown>;
      const content = output.content as Record<string, unknown> | string | undefined;
      const outputMetadata = output.metadata as Record<string, unknown> | undefined;

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
