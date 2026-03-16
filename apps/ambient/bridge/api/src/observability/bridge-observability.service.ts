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
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ObservabilityServiceProvider,
  InvocationEventPayload,
} from '../planes/observability';

@Injectable()
export class BridgeObservabilityService implements ObservabilityServiceProvider {
  private readonly logger = new Logger(BridgeObservabilityService.name);

  async emitInvocationEvent(
    context: ExecutionContext,
    payload: InvocationEventPayload,
  ): Promise<void> {
    const logMessage = [
      `[${payload.type}]`,
      `agent=${context.agentSlug}`,
      `org=${context.orgSlug}`,
      payload.message ? `msg="${payload.message}"` : null,
      payload.duration != null ? `duration=${payload.duration}ms` : null,
      payload.error ? `error="${payload.error}"` : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (payload.type === 'invocation.failed') {
      this.logger.error(logMessage);
    } else {
      this.logger.log(logMessage);
    }
  }
}
