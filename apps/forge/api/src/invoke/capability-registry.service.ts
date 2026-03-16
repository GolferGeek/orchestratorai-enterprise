/**
 * Capability Registry Service
 *
 * Routes invoke requests to Forge capability modules.
 * Each capability module registers itself with the registry.
 *
 * This replaces the old mode router + runner registry pattern
 * with a module-first capability dispatch.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  CapabilityCard,
} from '@orchestrator-ai/transport-types';
import {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from '@/planes/observability';
import type { Response } from 'express';

/**
 * Capability handler — implemented by each Forge capability module.
 */
export interface CapabilityHandler {
  /** Execute the capability synchronously */
  invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput>;

  /** Execute the capability with streaming (optional) */
  invokeStream?(
    context: ExecutionContext,
    data: InvokeData,
    metadata: Record<string, unknown> | undefined,
    requestId: string | number | null,
    res: Response,
  ): Promise<void>;

  /** Return the capability card for discovery */
  getCard(): CapabilityCard;
}

@Injectable()
export class CapabilityRegistryService {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private readonly capabilities = new Map<string, CapabilityHandler>();

  constructor(
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
  ) {}

  /**
   * Register a capability module.
   */
  register(slug: string, handler: CapabilityHandler): void {
    this.capabilities.set(slug, handler);
    this.logger.log(`Registered capability: ${slug}`);
  }

  /**
   * Invoke a capability by agent slug.
   */
  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const startTime = Date.now();

    await this.observability.emitInvocationEvent(context, {
      type: 'invocation.started',
      sourceApp: 'forge',
      message: `Invoking capability ${context.agentSlug}`,
    });

    try {
      const handler = this.capabilities.get(context.agentSlug);
      if (!handler) {
        throw new Error(`Unknown capability: ${context.agentSlug}. Available: ${Array.from(this.capabilities.keys()).join(', ')}`);
      }

      const output = await handler.invoke(context, data, metadata);

      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.completed',
        sourceApp: 'forge',
        success: true,
        duration,
      });

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.failed',
        sourceApp: 'forge',
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Streaming invocation.
   */
  async invokeStream(
    context: ExecutionContext,
    data: InvokeData,
    metadata: Record<string, unknown> | undefined,
    requestId: string | number | null,
    res: Response,
  ): Promise<void> {
    const handler = this.capabilities.get(context.agentSlug);
    if (!handler) {
      throw new Error(`Unknown capability: ${context.agentSlug}`);
    }

    if (!handler.invokeStream) {
      // Fallback: sync invoke + single output event
      const output = await handler.invoke(context, data, metadata);
      const outputEvent = JSON.stringify({
        event: 'output',
        requestId,
        context,
        data: { outputType: output.outputType, content: output.content },
        timestamp: new Date().toISOString(),
      });
      res.write(`event: output\ndata: ${outputEvent}\n\n`);
      res.write(`event: completed\ndata: ${JSON.stringify({ event: 'completed', requestId, context, timestamp: new Date().toISOString() })}\n\n`);
      res.end();
      return;
    }

    await handler.invokeStream(context, data, metadata, requestId, res);
  }

  /**
   * Get all capability cards for discovery.
   */
  getDiscoverableCards(): CapabilityCard[] {
    return Array.from(this.capabilities.values())
      .map((h) => h.getCard())
      .filter((card) => card.discoverable);
  }

  /**
   * Get a specific capability card.
   */
  getCard(slug: string): CapabilityCard | null {
    const handler = this.capabilities.get(slug);
    return handler ? handler.getCard() : null;
  }
}
