/**
 * Observability Adapter Service
 *
 * Implements ObservabilityServiceProvider by delegating to the existing
 * ObservabilityEventsService (in-memory + database persistence).
 *
 * This is a thin adapter — it maps the invoke-path event shape to
 * the ObservabilityEventRecord shape expected by ObservabilityEventsService.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ObservabilityServiceProvider,
  InvocationEventPayload,
} from './observability-plane';
import { ObservabilityEventsService } from './observability-events.service';

@Injectable()
export class ObservabilityAdapterService
  implements ObservabilityServiceProvider
{
  private readonly logger = new Logger(ObservabilityAdapterService.name);

  constructor(private readonly events: ObservabilityEventsService) {}

  async emitInvocationEvent(
    context: ExecutionContext,
    payload: InvocationEventPayload,
  ): Promise<void> {
    try {
      await this.events.push({
        context,
        source_app: 'compose',
        hook_event_type: payload.type,
        status: payload.success === false ? 'failed' : 'running',
        message: payload.message ?? null,
        progress: payload.progress ?? null,
        step: payload.step ?? null,
        payload: {
          sourceApp: payload.sourceApp,
          success: payload.success,
          duration: payload.duration,
          error: payload.error,
        },
        timestamp: Date.now(),
      });
    } catch (err) {
      // Observability must never break agent execution
      this.logger.warn(
        `Failed to emit invocation event: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
