import * as crypto from 'crypto';
import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

/**
 * Model Context Protocol (MCP) transport provider.
 *
 * Maps JSON-RPC methods to MCP tool calls. The MCP spec uses JSON-RPC 2.0
 * natively, so this provider wraps messages into MCP's tools/call and
 * tools/list semantics while maintaining full ITransportProvider compatibility.
 */
export class McpTransportProvider implements ITransportProvider {
  readonly providerId = 'mcp';

  private handler?: (message: TransportMessage) => Promise<TransportResponse>;

  /**
   * Converts a JSON-RPC method to an MCP tool call request.
   * The method name becomes the tool name, and params become the tool arguments.
   */
  private toMcpToolCall(message: TransportMessage): Record<string, unknown> {
    return {
      jsonrpc: '2.0',
      id: message.id,
      method: 'tools/call',
      params: {
        name: message.method,
        arguments: message.params || {},
      },
    };
  }

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const id = message.id || crypto.randomUUID();
    const mcpRequest = this.toMcpToolCall({ ...message, id });

    const start = Date.now();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-MCP-Version': '2024-11-05',
      },
      body: JSON.stringify(mcpRequest),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: response.status,
          message: `MCP tool call failed: HTTP ${response.status} ${response.statusText}`,
          data: { tool: message.method, latencyMs },
        },
      };
    }

    const body = (await response.json()) as Record<string, unknown>;

    // MCP tool results come back as { result: { content: [...], isError?: boolean } }
    const mcpResult = body.result as Record<string, unknown> | undefined;

    if (mcpResult?.isError) {
      const content = (mcpResult.content as Array<{ type: string; text: string }>) || [];
      const errorText = content.map((c) => c.text).join('\n');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `MCP tool error: ${errorText}`,
          data: { tool: message.method },
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: mcpResult as Record<string, unknown> | undefined,
    };
  }

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.handler = handler;
  }

  getHandler(): ((message: TransportMessage) => Promise<TransportResponse>) | undefined {
    return this.handler;
  }

  async *stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse> {
    const id = message.id || crypto.randomUUID();
    const mcpRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: message.method,
        arguments: { ...message.params, _stream: true },
      },
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-MCP-Version': '2024-11-05',
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok || !response.body) {
      yield {
        jsonrpc: '2.0',
        id,
        error: {
          code: response.status,
          message: `MCP stream error: HTTP ${response.status} ${response.statusText}`,
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
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event: ')) {
          // MCP SSE events — skip event type lines, process data lines
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          const parsed = JSON.parse(data) as Record<string, unknown>;

          yield {
            jsonrpc: '2.0',
            id,
            result: parsed.result as Record<string, unknown> | undefined,
            error: parsed.error as { code: number; message: string; data?: unknown } | undefined,
          };
        }
      }
    }
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    const start = Date.now();

    try {
      // MCP health check via tools/list — if the server responds, it's alive
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MCP-Version': '2024-11-05',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'tools/list',
          params: {},
        }),
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return { alive: false, latencyMs };
      }

      const body = (await response.json()) as TransportResponse;
      return { alive: !body.error, latencyMs };
    } catch {
      return { alive: false, latencyMs: Date.now() - start };
    }
  }
}
