/**
 * CAD Agent Capability Adapter
 *
 * Wraps CadAgentService as a CapabilityHandler so the invoke infrastructure
 * can route requests to the CAD generation LangGraph workflow.
 *
 * The CAD agent generates 3D CAD models from natural language prompts using
 * OpenCascade.js. Input must include a userMessage prompt.
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
import { CadAgentService } from '@/agents/cad-agent/cad-agent.service';
import type { CadConstraints } from '@/agents/cad-agent/cad-agent.state';

@Injectable()
export class CadAgentCapability implements CapabilityHandler, OnModuleInit {
  private readonly logger = new Logger(CadAgentCapability.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
    private readonly cadAgentService: CadAgentService,
  ) {}

  onModuleInit(): void {
    this.registry.register('cad-agent', this);
    this.logger.log('CadAgentCapability registered with capability registry');
  }

  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    _metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const content = data.content as Record<string, unknown> | null | undefined;

    const userMessage =
      (content?.userMessage as string) ||
      (typeof data.content === 'string' ? data.content : '');
    if (!userMessage) {
      throw new Error(
        'data.content.userMessage is required for CAD agent invocation',
      );
    }

    const result = await this.cadAgentService.generate({
      context,
      userMessage,
      projectId: content?.projectId as string | undefined,
      newProjectName: content?.newProjectName as string | undefined,
      constraints: content?.constraints as CadConstraints | undefined,
    });

    return {
      outputType: 'json',
      content: {
        conversationId: context.conversationId,
        status: result.status,
        userMessage: result.userMessage,
        generatedCode: result.generatedCode,
        outputs: result.outputs,
        meshStats: result.meshStats,
        error: result.error,
      },
      metadata: {
        duration: result.duration,
      },
    };
  }

  getCard(): CapabilityCard {
    return {
      id: 'forge-cad-agent',
      slug: 'cad-agent',
      name: 'CAD Agent',
      description:
        'Engineering design assistant — generates 3D CAD models from natural language using OpenCascade.js',
      kind: 'workflow',
      discoverable: true,
      invoke: {
        method: 'invoke',
        inputTypes: ['text', 'json'],
        outputTypes: ['json'],
        streaming: false,
      },
      outputTypes: ['json'],
      metadata: {
        product: 'forge',
        agentType: 'langgraph',
        outputFormats: ['STEP', 'STL', 'GLTF', 'DXF'],
      },
    };
  }
}
