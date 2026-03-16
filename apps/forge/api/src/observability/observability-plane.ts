/**
 * Observability Plane — Forge API
 *
 * Provides the OBSERVABILITY_SERVICE injection token and the
 * ObservabilityServiceProvider interface used by CapabilityRegistryService
 * to emit invocation lifecycle events.
 *
 * This module wraps the existing ObservabilityWebhookService so that the
 * invoke infrastructure has a stable, Symbol-keyed injection point.
 */

import { Module, Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityWebhookService } from '@/observability/observability-webhook.service';
import { ObservabilityModule } from '@/observability/observability.module';

export const OBSERVABILITY_SERVICE = Symbol('OBSERVABILITY_SERVICE');

/**
 * Invocation event shape emitted by CapabilityRegistryService.
 */
export interface InvocationEvent {
  type: 'invocation.started' | 'invocation.completed' | 'invocation.failed';
  sourceApp: string;
  message?: string;
  success?: boolean;
  duration?: number;
  error?: string;
}

/**
 * Interface that CapabilityRegistryService depends on.
 */
export interface ObservabilityServiceProvider {
  emitInvocationEvent(
    context: ExecutionContext,
    event: InvocationEvent,
  ): Promise<void>;
}

/**
 * Adapter that implements ObservabilityServiceProvider using the existing
 * ObservabilityWebhookService.
 */
@Injectable()
export class ObservabilityPlaneService implements ObservabilityServiceProvider {
  private readonly logger = new Logger(ObservabilityPlaneService.name);

  constructor(private readonly webhook: ObservabilityWebhookService) {}

  async emitInvocationEvent(
    context: ExecutionContext,
    event: InvocationEvent,
  ): Promise<void> {
    try {
      await this.webhook.sendEvent({
        source_app: event.sourceApp,
        session_id: context.conversationId || 'unknown',
        hook_event_type: event.type,
        context,
        message: event.message,
        progress: event.type === 'invocation.completed' ? 100 : undefined,
        payload: {
          success: event.success,
          duration: event.duration,
          error: event.error,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to emit invocation event: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * ObservabilityPlaneModule
 *
 * Registers the OBSERVABILITY_SERVICE token so ForgeInvokeModule can inject it.
 */
@Module({
  imports: [ObservabilityModule],
  providers: [
    ObservabilityPlaneService,
    {
      provide: OBSERVABILITY_SERVICE,
      useExisting: ObservabilityPlaneService,
    },
  ],
  exports: [OBSERVABILITY_SERVICE, ObservabilityPlaneService],
})
export class ObservabilityPlaneModule {}
