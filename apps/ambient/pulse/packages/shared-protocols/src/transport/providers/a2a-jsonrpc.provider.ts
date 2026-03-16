import * as crypto from 'crypto';
import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

/**
 * A2A JSON-RPC 2.0 Transport Provider (legacy shared-protocols package).
 *
 * NOTE: This class is part of the legacy agent-communication shared-protocols package
 * that was copied into Pulse during Phase 4 specialization. It is NOT used by the
 * new Pulse API (apps/ambient/pulse/api/). The new Pulse API communicates internally
 * and does not require an outbound A2A transport provider.
 *
 * The local TransportMessage / TransportResponse interfaces in transport.interface.ts
 * mirror the JSON-RPC 2.0 types from @orchestratorai/transport-types. Any callers
 * of this class must pass clean JSON-RPC 2.0 payloads — no proprietary extensions.
 *
 * Protocol: JSON-RPC 2.0 (https://www.jsonrpc.org/specification)
 */
export class A2AJsonRpcTransportProvider implements ITransportProvider {
  readonly providerId = 'a2a-jsonrpc';

  private handler?: (message: TransportMessage) => Promise<TransportResponse>;

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const envelope: TransportMessage = {
      jsonrpc: '2.0',
      id: message.id || crypto.randomUUID(),
      method: message.method,
      params: message.params ?? {},
    };

    const start = Date.now();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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

    return body;
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

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event: ')) continue;
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          const parsed = JSON.parse(data) as TransportResponse;
          yield parsed;
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
