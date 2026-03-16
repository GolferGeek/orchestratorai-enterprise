import { ITransportProvider, TransportMessage, TransportResponse } from '../transport.interface';

export class HttpRestTransportProvider implements ITransportProvider {
  readonly providerId = 'http-rest';

  private handler?: (message: TransportMessage) => Promise<TransportResponse>;

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: response.status,
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }
    return (await response.json()) as TransportResponse;
  }

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.handler = handler;
  }

  getHandler(): ((message: TransportMessage) => Promise<TransportResponse>) | undefined {
    return this.handler;
  }

  async *stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse> {
    // Phase 1: simple single-response stream
    const response = await this.send(targetUrl, message);
    yield response;
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${targetUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return { alive: response.ok, latencyMs: Date.now() - start };
    } catch {
      return { alive: false, latencyMs: Date.now() - start };
    }
  }
}
