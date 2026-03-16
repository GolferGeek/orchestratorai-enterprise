import * as crypto from 'crypto';
import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

export class A2AJsonRpcTransportProvider implements ITransportProvider {
  readonly providerId = 'a2a-jsonrpc';
  private readonly protocolVersion = '0.3';

  private handler?: (message: TransportMessage) => Promise<TransportResponse>;

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const envelope: TransportMessage = {
      jsonrpc: '2.0',
      id: message.id || crypto.randomUUID(),
      method: message.method,
      params: {
        ...(message.params ?? {}),
        __a2a: {
          version: this.protocolVersion,
          grpcMappingAware: true,
        },
      },
    };

    const start = Date.now();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-A2A-Protocol': 'jsonrpc-2.0',
        'X-A2A-Version': this.protocolVersion,
        'X-A2A-gRPC-Interop': 'enabled',
      },
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      return {
        jsonrpc: '2.0',
        id: envelope.id,
        error: {
          code: response.status,
          message: `A2A JSON-RPC error: HTTP ${response.status} ${response.statusText}`,
          data: { targetUrl, latencyMs: Date.now() - start },
        },
      };
    }

    const body = (await response.json()) as TransportResponse;

    if (body.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: envelope.id,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC response: missing jsonrpc "2.0" field',
          data: { receivedBody: body },
        },
      };
    }

    return normalizeA2ATaskState(body);
  }

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.handler = handler;
  }

  getHandler(): ((message: TransportMessage) => Promise<TransportResponse>) | undefined {
    return this.handler;
  }

  async *stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse> {
    const envelope: TransportMessage = {
      jsonrpc: '2.0',
      id: message.id || crypto.randomUUID(),
      method: message.method,
      params: { ...message.params, _stream: true },
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-A2A-Protocol': 'jsonrpc-2.0',
        'X-A2A-Version': this.protocolVersion,
        'X-A2A-gRPC-Interop': 'enabled',
      },
      body: JSON.stringify(envelope),
    });

    if (!response.ok || !response.body) {
      yield {
        jsonrpc: '2.0',
        id: envelope.id,
        error: {
          code: response.status,
          message: `A2A stream error: HTTP ${response.status} ${response.statusText}`,
        },
      };
      return;
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

      let pendingEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('event: ')) {
          pendingEvent = trimmed.slice(7);
          continue;
        }
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          const parsed = JSON.parse(data) as TransportResponse;
          const normalized = normalizeA2ATaskState(parsed);
          if (pendingEvent && normalized.result) {
            normalized.result.__sseEvent = pendingEvent;
          }
          yield normalized;
        }
      }
    }
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    const start = Date.now();
    const pingMessage: TransportMessage = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'system.ping',
    };

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-A2A-Protocol': 'jsonrpc-2.0',
          'X-A2A-Version': this.protocolVersion,
        },
        body: JSON.stringify(pingMessage),
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return { alive: false, latencyMs };
      }

      const body = (await response.json()) as TransportResponse;
      return { alive: body.jsonrpc === '2.0' && !body.error, latencyMs };
    } catch {
      return { alive: false, latencyMs: Date.now() - start };
    }
  }
}

function normalizeA2ATaskState(response: TransportResponse): TransportResponse {
  if (!response.result) {
    return response;
  }

  const rawState = response.result.taskState;
  if (typeof rawState !== 'string') {
    return response;
  }

  const normalizedState = mapTaskState(rawState);
  if (normalizedState === rawState) {
    return response;
  }

  return {
    ...response,
    result: {
      ...response.result,
      taskState: normalizedState,
      originalTaskState: rawState,
    },
  };
}

function mapTaskState(state: string): string {
  const normalized = state.trim().toLowerCase();
  if (normalized === 'in_progress') {
    return 'working';
  }
  if (normalized === 'needs_input') {
    return 'input-required';
  }
  return normalized;
}
