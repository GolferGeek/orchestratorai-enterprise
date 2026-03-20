/**
 * Predictor Capability Adapter
 *
 * Wraps PredictorService as a CapabilityHandler so the invoke infrastructure
 * can route requests to the predictor dashboard.
 *
 * Forge is dashboard-only for predictor — it reads data that Pulse has computed.
 * The invoke contract passes action and payload via data.content.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  CapabilityCard,
} from '@orchestrator-ai/transport-types';
import type { CapabilityHandler } from '../capability-registry.service';
import { CapabilityRegistryService } from '../capability-registry.service';
import { PredictorService } from '@/agents/predictor/predictor.service';

@Injectable()
export class PredictorCapability implements CapabilityHandler, OnModuleInit {
  private readonly logger = new Logger(PredictorCapability.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
    private readonly predictorService: PredictorService,
  ) {}

  onModuleInit(): void {
    this.registry.register('predictor', this);
    this.logger.log('PredictorCapability registered with capability registry');
  }

  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const content = data.content as Record<string, unknown> | null | undefined;

    const result = await this.predictorService.process({
      context,
      userMessage: (content?.userMessage as string) || '',
      mode: (content?.mode as string) || (metadata?.mode as string),
      action: (content?.action as string) || (metadata?.action as string),
      payload: content?.payload as
        | import('@/agents/shared/types/forge-types').DashboardRequestPayload
        | undefined,
    });

    return {
      outputType: 'json',
      content: {
        status: result.status,
        response: result.response,
        error: result.error,
        duration: result.duration,
      },
      metadata: {
        duration: result.duration,
      },
    };
  }

  getCard(): CapabilityCard {
    return {
      id: 'forge-predictor',
      slug: 'predictor',
      name: 'Predictor Dashboard',
      description:
        'US tech stock prediction dashboard — reads prediction data computed by Pulse',
      kind: 'workflow',
      discoverable: true,
      invoke: {
        method: 'invoke',
        inputTypes: ['json'],
        outputTypes: ['json'],
        streaming: false,
      },
      outputTypes: ['json'],
      metadata: {
        product: 'forge',
        agentType: 'dashboard',
      },
    };
  }
}
