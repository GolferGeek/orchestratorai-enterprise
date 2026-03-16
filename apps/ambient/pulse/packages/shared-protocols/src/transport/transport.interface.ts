export interface TransportMessage {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface TransportResponse {
  jsonrpc: '2.0';
  id: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export interface ITransportProvider {
  readonly providerId: string;

  send(targetUrl: string, message: TransportMessage): Promise<TransportResponse>;
  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void;
  stream(targetUrl: string, message: TransportMessage): AsyncIterable<TransportResponse>;
  ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }>;
}
