/**
 * Legal Department Capability Adapter
 *
 * Wraps LegalDepartmentService as a CapabilityHandler so the invoke
 * infrastructure can route requests to the legal department LangGraph workflow.
 *
 * The legal department agent performs multi-specialist legal document analysis.
 * Input must include at minimum a userMessage; documents and legalMetadata
 * are optional enrichment.
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
import { LegalDepartmentService } from '@/agents/legal-department/legal-department.service';
import type { LegalDocumentMetadata } from '@/agents/legal-department/legal-department.state';

@Injectable()
export class LegalDepartmentCapability
  implements CapabilityHandler, OnModuleInit
{
  private readonly logger = new Logger(LegalDepartmentCapability.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
    private readonly legalDepartmentService: LegalDepartmentService,
  ) {}

  onModuleInit(): void {
    this.registry.register('legal-department', this);
    this.logger.log(
      'LegalDepartmentCapability registered with capability registry',
    );
  }

  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    _metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const content = data.content as Record<string, unknown> | null | undefined;

    const userMessage = (content?.userMessage as string) || '';
    if (!userMessage) {
      throw new Error(
        'data.content.userMessage is required for legal department invocation',
      );
    }

    const result = await this.legalDepartmentService.process({
      context,
      userMessage,
      documents: content?.documents as
        | Array<{ name: string; content: string; type?: string }>
        | undefined,
      legalMetadata: content?.legalMetadata as
        | LegalDocumentMetadata
        | undefined,
    });

    return {
      outputType: 'json',
      content: {
        conversationId: context.conversationId,
        status: result.status,
        userMessage: result.userMessage,
        response: result.response,
        specialistOutputs: result.specialistOutputs,
        legalMetadata: result.legalMetadata,
        routingDecision: result.routingDecision,
        error: result.error,
      },
      metadata: {
        duration: result.duration,
      },
    };
  }

  getCard(): CapabilityCard {
    return {
      id: 'forge-legal-department',
      slug: 'legal-department',
      name: 'Legal Department',
      description:
        'Multi-specialist legal workflow — contract analysis, compliance, IP, privacy, and more',
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
      },
    };
  }
}
