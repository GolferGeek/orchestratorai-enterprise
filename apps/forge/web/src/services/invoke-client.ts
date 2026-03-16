/**
 * Invoke Client V2
 *
 * Shared client for the v2 invoke contract.
 * Sends params { context, data, metadata? } and receives typed output.
 *
 * Can be used by any product web app — Compose, Forge, Admin, etc.
 */

import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  A2AInvokeSuccessResponse,
  A2AInvokeErrorResponse,
  StreamEvent,
} from '@orchestrator-ai/transport-types';

/**
 * Invoke request options.
 */
export interface InvokeOptions {
  /** Base URL for the API */
  baseUrl: string;

  /** Auth token */
  token?: string;

  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Invoke result — success or error.
 */
export type InvokeResult =
  | { success: true; output: InvokeOutput; context?: ExecutionContext }
  | { success: false; error: { code: number; message: string; data?: Record<string, unknown> } };

/**
 * Send a synchronous invoke request.
 */
export async function invoke(
  context: ExecutionContext,
  data: InvokeData,
  options: InvokeOptions,
  metadata?: Record<string, unknown>,
): Promise<InvokeResult> {
  const token = options.token || getStoredToken();
  const requestId = crypto.randomUUID();

  const response = await fetch(`${options.baseUrl}/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'invoke',
      params: { context, data, metadata },
    }),
    signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${body}`);
  }

  const json = await response.json() as A2AInvokeSuccessResponse | A2AInvokeErrorResponse;

  if ('error' in json) {
    return { success: false, error: json.error };
  }

  return {
    success: true,
    output: json.result.output,
    context: json.result.context,
  };
}

/**
 * Stream event callback.
 */
export type StreamEventCallback = (event: StreamEvent) => void;

/**
 * Send a streaming invoke request. Returns an abort function.
 */
export function invokeStream(
  context: ExecutionContext,
  data: InvokeData,
  options: InvokeOptions,
  onEvent: StreamEventCallback,
  metadata?: Record<string, unknown>,
): { abort: () => void } {
  const token = options.token || getStoredToken();
  const requestId = crypto.randomUUID();
  const controller = new AbortController();

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    method: 'invoke',
    params: { context, data, metadata },
  });

  fetch(`${options.baseUrl}/invoke/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        throw new Error(`Stream error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as StreamEvent;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({
          event: 'error',
          requestId,
          context,
          data: { code: 'stream_failed', message: err.message, retryable: false },
          timestamp: new Date().toISOString(),
        });
      }
    });

  return { abort: () => controller.abort() };
}

/**
 * Get stored auth token from localStorage.
 */
function getStoredToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem('authToken') || localStorage.getItem('auth_token') || '';
}
