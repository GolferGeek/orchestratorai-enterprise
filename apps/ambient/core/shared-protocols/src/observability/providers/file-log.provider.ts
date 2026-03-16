import { ProtocolMessage, MessageFilter } from '@agent-communication/shared-types';
import { IObservabilityProvider, ObservabilityEvent, ProtocolMetrics } from '../observability.interface';

export class FileLogObservabilityProvider implements IObservabilityProvider {
  readonly providerId = 'file-log';

  private messages: ProtocolMessage[] = [];
  private events: ObservabilityEvent[] = [];

  async trace<T>(spanName: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.events.push({
      type: 'span-start',
      timestamp: new Date().toISOString(),
      source: spanName,
      data: {},
    });

    try {
      const result = await fn();
      this.events.push({
        type: 'span-end',
        timestamp: new Date().toISOString(),
        source: spanName,
        data: { durationMs: Date.now() - start, status: 'success' },
      });
      return result;
    } catch (error) {
      this.events.push({
        type: 'span-end',
        timestamp: new Date().toISOString(),
        source: spanName,
        data: {
          durationMs: Date.now() - start,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async emitEvent(event: ObservabilityEvent): Promise<void> {
    this.events.push(event);
    console.log(`[${event.type}] ${event.source}${event.target ? ` -> ${event.target}` : ''}: ${JSON.stringify(event.data)}`);
  }

  recordMessage(message: ProtocolMessage): void {
    this.messages.push(message);
  }

  async getMessageLog(filter?: MessageFilter): Promise<ProtocolMessage[]> {
    let result = [...this.messages];

    if (filter?.source) result = result.filter(m => m.source === filter.source);
    if (filter?.target) result = result.filter(m => m.target === filter.target);
    if (filter?.method) result = result.filter(m => m.method === filter.method);
    if (filter?.status) result = result.filter(m => m.status === filter.status);
    if (filter?.fromTimestamp) result = result.filter(m => m.timestamp >= filter.fromTimestamp!);
    if (filter?.toTimestamp) result = result.filter(m => m.timestamp <= filter.toTimestamp!);

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return result.slice(offset, offset + limit);
  }

  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    const messagesByProtocol: Record<string, number> = {};
    const messagesByAgent: Record<string, number> = {};

    for (const msg of this.messages) {
      const proto = msg.protocol.transport;
      messagesByProtocol[proto] = (messagesByProtocol[proto] ?? 0) + 1;
      messagesByAgent[msg.source] = (messagesByAgent[msg.source] ?? 0) + 1;
    }

    const successCount = this.messages.filter(m => m.status === 'success').length;
    const errorCount = this.messages.filter(m => m.status === 'error').length;
    const latencies = this.messages
      .filter(m => m.timing.durationMs !== undefined)
      .map(m => m.timing.durationMs!);

    return {
      totalMessages: this.messages.length,
      successCount,
      errorCount,
      averageLatencyMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      messagesByProtocol,
      messagesByAgent,
    };
  }

  getEvents(): ObservabilityEvent[] {
    return [...this.events];
  }
}
