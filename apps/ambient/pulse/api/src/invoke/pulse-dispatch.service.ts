/**
 * Pulse Dispatch Service V2
 *
 * Routes invoke requests to Pulse processing services.
 * Handles both:
 * - A2A invoke from external callers (thin edge)
 * - Internal dispatch from trigger executor (direct service calls)
 *
 * Uses the automation context contract for system-triggered invocations.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from '@/planes/observability';

@Injectable()
export class PulseDispatchService {
  private readonly logger = new Logger(PulseDispatchService.name);
  private readonly handlers = new Map<string, (context: ExecutionContext, data: InvokeData, metadata?: Record<string, unknown>) => Promise<InvokeOutput>>();

  constructor(
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
  ) {}

  /**
   * Register a processing handler for an agent slug.
   */
  registerHandler(
    agentSlug: string,
    handler: (context: ExecutionContext, data: InvokeData, metadata?: Record<string, unknown>) => Promise<InvokeOutput>,
  ): void {
    this.handlers.set(agentSlug, handler);
    this.logger.log(`Registered Pulse handler: ${agentSlug}`);
  }

  /**
   * Invoke a processing service.
   */
  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const startTime = Date.now();

    await this.observability.emitInvocationEvent(context, {
      type: 'invocation.started',
      sourceApp: 'pulse',
      message: `Pulse processing ${context.agentSlug}`,
    });

    try {
      const handler = this.handlers.get(context.agentSlug);
      if (!handler) {
        throw new Error(`No Pulse handler for: ${context.agentSlug}. Available: ${Array.from(this.handlers.keys()).join(', ')}`);
      }

      const output = await handler(context, data, metadata);

      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.completed',
        sourceApp: 'pulse',
        success: true,
        duration,
      });

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.failed',
        sourceApp: 'pulse',
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
