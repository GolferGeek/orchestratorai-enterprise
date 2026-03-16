/**
 * Bridge Dispatch Service V2
 *
 * Routes invoke requests in Bridge context:
 * - Inbound external → internal routing
 * - Outbound internal → external routing
 * - Protocol translation and metadata handling
 *
 * Bridge-specific external metadata stays in the metadata field,
 * never in the shared ExecutionContext capsule.
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
export class BridgeDispatchService {
  private readonly logger = new Logger(BridgeDispatchService.name);

  constructor(
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
  ) {}

  /**
   * Handle an invoke request through Bridge.
   * For now, this is the structural foundation — specific routing
   * (inbound/outbound, protocol translation) will be wired during
   * detailed Bridge alignment.
   */
  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const startTime = Date.now();

    await this.observability.emitInvocationEvent(context, {
      type: 'invocation.started',
      sourceApp: 'bridge',
      message: `Bridge processing ${context.agentSlug}`,
      payload: { direction: metadata?.direction || 'inbound' },
    });

    try {
      // TODO: Wire to actual Bridge routing (inbound/outbound dispatch)
      throw new Error(`Bridge dispatch not yet wired for: ${context.agentSlug}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.failed',
        sourceApp: 'bridge',
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
