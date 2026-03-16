import { ProtocolMessage, MessageFilter } from '@agent-communication/shared-types';

export interface ProtocolMetrics {
  totalMessages: number;
  successCount: number;
  errorCount: number;
  averageLatencyMs: number;
  messagesByProtocol: Record<string, number>;
  messagesByAgent: Record<string, number>;
}

export interface ObservabilityEvent {
  type: string;
  timestamp: string;
  source: string;
  target?: string;
  data: Record<string, unknown>;
}

export interface IObservabilityProvider {
  readonly providerId: string;

  trace<T>(spanName: string, fn: () => Promise<T>): Promise<T>;
  emitEvent(event: ObservabilityEvent): Promise<void>;
  getMessageLog(filter?: MessageFilter): Promise<ProtocolMessage[]>;
  getProtocolMetrics(): Promise<ProtocolMetrics>;
}
