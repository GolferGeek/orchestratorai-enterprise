/**
 * Marketing Swarm Capability Adapter
 *
 * Wraps MarketingSwarmService as a CapabilityHandler so the invoke
 * infrastructure can route requests to the marketing swarm agent.
 *
 * The marketing swarm is a database-driven multi-agent content pipeline.
 * Input is parsed from data.content which must include the task configuration.
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
import { MarketingSwarmService } from '@/agents/marketing-swarm/marketing-swarm.service';

@Injectable()
export class MarketingSwarmCapability
  implements CapabilityHandler, OnModuleInit
{
  private readonly logger = new Logger(MarketingSwarmCapability.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
    private readonly marketingSwarmService: MarketingSwarmService,
  ) {}

  onModuleInit(): void {
    this.registry.register('marketing-swarm', this);
    this.logger.log(
      'MarketingSwarmCapability registered with capability registry',
    );
  }

  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    _metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const content = data.content as Record<string, unknown> | null | undefined;

    if (!context.conversationId) {
      throw new Error(
        'ExecutionContext.conversationId is required for marketing swarm invocation',
      );
    }

    const result = await this.marketingSwarmService.execute({
      context,
      taskId: context.conversationId,
      contentTypeSlug: content?.contentTypeSlug as string | undefined,
      contentTypeContext: content?.contentTypeContext as string | undefined,
      promptData: content?.promptData as Record<string, unknown> | undefined,
      config: content?.config as
        | {
            writers?: Array<{ agentSlug: string; llmConfigId: string }>;
            editors?: Array<{ agentSlug: string; llmConfigId: string }>;
            evaluators?: Array<{ agentSlug: string; llmConfigId: string }>;
            execution?: Record<string, unknown>;
          }
        | undefined,
    });

    return {
      outputType: 'json',
      content: {
        conversationId: context.conversationId,
        status: result.status,
        outputs: result.outputs,
        evaluations: result.evaluations,
        winner: result.winner,
        deliverable: result.deliverable,
        versionedDeliverable: result.versionedDeliverable,
        error: result.error,
      },
      metadata: {
        duration: result.duration,
      },
    };
  }

  getCard(): CapabilityCard {
    return {
      id: 'forge-marketing-swarm',
      slug: 'marketing-swarm',
      name: 'Marketing Swarm',
      description:
        'Multi-agent marketing content pipeline with writers, editors, and evaluators',
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
        agentType: 'swarm',
      },
    };
  }
}
