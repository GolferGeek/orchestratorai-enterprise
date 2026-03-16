import * as crypto from 'crypto';
import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

interface PendingRequest {
  resolve: (response: TransportResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketTransportProvider implements ITransportProvider {
  readonly providerId = 'websocket';

  private connections = new Map<string, WebSocket>();
  private pendingRequests = new Map<string, PendingRequest>();
  private handler?: (message: TransportMessage) => Promise<TransportResponse>;
  private timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  private getOrCreateConnection(targetUrl: string): WebSocket {
    const wsUrl = targetUrl.replace(/^http/, 'ws');
    const existing = this.connections.get(wsUrl);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(String(event.data));

      if (data.method && !data.result && !data.error) {
        // Incoming request — route to handler
        if (this.handler) {
          this.handler(data as TransportMessage).then((response) => {
            ws.send(JSON.stringify(response));
          });
        }
        return;
      }

      // Response to a pending request
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);
        pending.resolve(data as TransportResponse);
      }
    };

    ws.onerror = () => {
      // Reject all pending requests for this connection
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`WebSocket error on connection to ${wsUrl}`));
        this.pendingRequests.delete(id);
      }
    };

    ws.onclose = () => {
      this.connections.delete(wsUrl);
    };

    this.connections.set(wsUrl, ws);
    return ws;
  }

  private waitForOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (e: Event) => { cleanup(); reject(new Error(`WebSocket failed to connect: ${e}`)); };
      const cleanup = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
      };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
    });
  }

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const ws = this.getOrCreateConnection(targetUrl);
    await this.waitForOpen(ws);

    const id = message.id || crypto.randomUUID();
    const envelope: TransportMessage = {
      jsonrpc: '2.0',
      id,
      method: message.method,
      params: message.params,
    };

    return new Promise<TransportResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`WebSocket request timed out after ${this.timeoutMs}ms (id: ${id})`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify(envelope));
    });
  }

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.handler = handler;
  }

  getHandler(): ((message: TransportMessage) => Promise<TransportResponse>) | undefined {
    return this.handler;
  }

  async *stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse> {
    const ws = this.getOrCreateConnection(targetUrl);
    await this.waitForOpen(ws);

    const streamId = message.id || crypto.randomUUID();
    const envelope: TransportMessage = {
      jsonrpc: '2.0',
      id: streamId,
      method: message.method,
      params: { ...message.params, _stream: true },
    };

    const queue: TransportResponse[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const onMessage = (event: MessageEvent) => {
      const data = JSON.parse(String(event.data)) as TransportResponse;
      if (data.id !== streamId) return;

      queue.push(data);
      if (resolve) {
        resolve();
        resolve = null;
      }

      // End-of-stream marker
      if (data.result?._done === true || data.error) {
        done = true;
      }
    };

    ws.addEventListener('message', onMessage);

    try {
      ws.send(JSON.stringify(envelope));

      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => { resolve = r; });
        }
      }
    } finally {
      ws.removeEventListener('message', onMessage);
    }
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const ws = this.getOrCreateConnection(targetUrl);
      await this.waitForOpen(ws);

      const pingId = crypto.randomUUID();
      const pingMessage: TransportMessage = {
        jsonrpc: '2.0',
        id: pingId,
        method: 'system.ping',
      };

      const response = await new Promise<TransportResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRequests.delete(pingId);
          reject(new Error('WebSocket ping timed out'));
        }, 5000);

        this.pendingRequests.set(pingId, { resolve, reject, timer });
        ws.send(JSON.stringify(pingMessage));
      });

      return { alive: !response.error, latencyMs: Date.now() - start };
    } catch {
      return { alive: false, latencyMs: Date.now() - start };
    }
  }

  disconnect(targetUrl?: string): void {
    if (targetUrl) {
      const wsUrl = targetUrl.replace(/^http/, 'ws');
      const ws = this.connections.get(wsUrl);
      if (ws) {
        ws.close();
        this.connections.delete(wsUrl);
      }
    } else {
      for (const ws of this.connections.values()) {
        ws.close();
      }
      this.connections.clear();
    }
  }
}
