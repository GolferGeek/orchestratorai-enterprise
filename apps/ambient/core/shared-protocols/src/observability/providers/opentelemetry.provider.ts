import { ProtocolMessage, MessageFilter } from '@agent-communication/shared-types';
import { IObservabilityProvider, ObservabilityEvent, ProtocolMetrics } from '../observability.interface';
import { trace, context, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export class OpenTelemetryObservabilityProvider implements IObservabilityProvider {
  readonly providerId = 'opentelemetry';

  private messages: ProtocolMessage[] = [];
  private events: ObservabilityEvent[] = [];
  private tracer: Tracer;
  private tracerProvider: NodeTracerProvider;

  constructor() {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'agent-communication';

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    });

    const exporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    this.tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });

    this.tracerProvider.register();

    this.tracer = trace.getTracer(serviceName, '0.1.0');
  }

  async trace<T>(spanName: string, fn: () => Promise<T>): Promise<T> {
    return this.tracer.startActiveSpan(spanName, async (span) => {
      const start = Date.now();

      this.events.push({
        type: 'span-start',
        timestamp: new Date().toISOString(),
        source: spanName,
        data: {},
      });

      try {
        const result = await context.with(trace.setSpan(context.active(), span), fn);

        const durationMs = Date.now() - start;
        span.setAttribute('duration_ms', durationMs);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        this.events.push({
          type: 'span-end',
          timestamp: new Date().toISOString(),
          source: spanName,
          data: { durationMs, status: 'success' },
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - start;
        span.setAttribute('duration_ms', durationMs);
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        span.end();

        this.events.push({
          type: 'span-end',
          timestamp: new Date().toISOString(),
          source: spanName,
          data: {
            durationMs,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        });

        throw error;
      }
    });
  }

  async emitEvent(event: ObservabilityEvent): Promise<void> {
    this.tracer.startActiveSpan(`event:${event.type}`, (span) => {
      span.setAttribute('event.type', event.type);
      span.setAttribute('event.source', event.source);
      if (event.target) {
        span.setAttribute('event.target', event.target);
      }
      span.setAttribute('event.data', JSON.stringify(event.data));
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    });

    this.events.push(event);
    console.log(`[${event.type}] ${event.source}${event.target ? ` -> ${event.target}` : ''}: ${JSON.stringify(event.data)}`);
  }

  recordMessage(message: ProtocolMessage): void {
    this.tracer.startActiveSpan(`message:${message.method}`, (span) => {
      span.setAttribute('message.id', message.id);
      span.setAttribute('message.source', message.source);
      span.setAttribute('message.target', message.target);
      span.setAttribute('message.method', message.method);
      span.setAttribute('message.status', message.status);
      span.setAttribute('message.protocol.transport', message.protocol.transport);
      if (message.timing.durationMs !== undefined) {
        span.setAttribute('message.duration_ms', message.timing.durationMs);
      }
      span.setStatus({
        code: message.status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span.end();
    });

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
