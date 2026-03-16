/**
 * BridgeObservabilityService
 *
 * Observability implementation for Bridge. Emits invocation lifecycle events
 * to the console and (in future) to Supabase for tracking external A2A activity.
 *
 * Bridge-specific: all external A2A events are logged here so they can be
 * audited and monitored. This is separate from internal Pulse observability.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ObservabilityServiceProvider,
  InvocationEvent,
  LLMUsageEvent,
  StreamCorrelation,
  ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';

@Injectable()
export class BridgeObservabilityService implements ObservabilityServiceProvider {
  private readonly logger = new Logger(BridgeObservabilityService.name);
  private readonly recentEvents: ObservabilityEventRecord[] = [];
  private readonly maxRecentEvents = 100;
  private readonly eventSubject = new Subject<ObservabilityEventRecord>();

  async emitInvocationEvent(
    context: ExecutionContext,
    event: InvocationEvent,
  ): Promise<void> {
    const logMessage = [
      `[${event.type}]`,
      `agent=${context.agentSlug}`,
      `org=${context.orgSlug}`,
      event.message ? `msg="${event.message}"` : null,
      event.duration != null ? `duration=${event.duration}ms` : null,
      event.error ? `error="${event.error}"` : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (event.type === 'invocation.failed') {
      this.logger.error(logMessage);
    } else {
      this.logger.log(logMessage);
    }
  }

  async recordLLMUsage(
    context: ExecutionContext,
    usage: LLMUsageEvent,
  ): Promise<void> {
    this.logger.debug(
      `[LLM Usage] agent=${context.agentSlug} provider=${usage.provider} model=${usage.model} tokens=${usage.totalTokens ?? 0}`,
    );
  }

  async registerStream(
    context: ExecutionContext,
    correlation: StreamCorrelation,
  ): Promise<void> {
    this.logger.debug(
      `[Stream Registered] agent=${context.agentSlug} streamId=${correlation.streamId}`,
    );
  }

  async emitStreamEvent(
    context: ExecutionContext,
    requestId: string | number | null,
    eventType: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.debug(
      `[Stream Event] agent=${context.agentSlug} requestId=${requestId} type=${eventType}`,
    );
  }

  getRecentEvents(limit?: number): ObservabilityEventRecord[] {
    const count = limit ?? this.recentEvents.length;
    return this.recentEvents.slice(-count);
  }

  getEventStream(): Observable<ObservabilityEventRecord> {
    return this.eventSubject.asObservable();
  }

  async getHistoricalEvents(
    since: number,
    limit?: number,
    _until?: number,
  ): Promise<ObservabilityEventRecord[]> {
    // Bridge does not persist historical events yet — return recent buffer filtered by time
    return this.recentEvents
      .filter((e) => e.timestamp >= since)
      .slice(0, limit ?? 100);
  }
}
