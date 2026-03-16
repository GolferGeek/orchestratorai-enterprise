import { Injectable, Logger } from '@nestjs/common';
import type { JsonObject } from '@orchestrator-ai/transport-types';
import { ConversationPlansRepository } from '../repositories/conversation-plans.repository';
import { ConversationPlanRecord } from '../interfaces/conversation-plan-record.interface';
import { AgentRuntimeExecutionService } from './agent-runtime-execution.service';
import { AgentRuntimeAgentMetadata } from '../interfaces/agent-runtime-agent-metadata.interface';

export interface GeneratePlanInput {
  conversationId: string;
  organizationSlug: string | null;
  agentSlug: string;
  summary?: string | null;
  draftPlan: JsonObject;
  createdBy?: string | null;
  agentMetadata?: AgentRuntimeAgentMetadata;
}

export interface UpdatePlanStatusInput {
  planId: string;
  status: string;
  summary?: string | null;
  updatedPlan?: JsonObject;
  approvedBy?: string | null;
}

@Injectable()
export class PlanEngineService {
  private readonly logger = new Logger(PlanEngineService.name);

  constructor(
    private readonly plansRepository: ConversationPlansRepository,
    private readonly runtimeExecution: AgentRuntimeExecutionService,
  ) {}

  async generateDraft(
    input: GeneratePlanInput,
  ): Promise<ConversationPlanRecord> {
    this.logger.debug(`Generating plan draft for ${input.agentSlug}`);

    const agentMetadata =
      input.agentMetadata ?? this.buildDefaultAgentMetadata(input);

    return this.plansRepository.createDraft({
      conversation_id: input.conversationId,
      organization_slug: input.organizationSlug,
      agent_slug: input.agentSlug,
      summary: input.summary ?? null,
      plan_json: this.runtimeExecution.enrichPlanDraft(
        input.draftPlan,
        agentMetadata,
      ),
      created_by: input.createdBy ?? null,
    });
  }

  async updateStatus(
    input: UpdatePlanStatusInput,
  ): Promise<ConversationPlanRecord> {
    this.logger.debug(
      `Updating plan ${input.planId} to status ${input.status}`,
    );

    return this.plansRepository.updateStatus(input.planId, {
      status: input.status,
      summary: input.summary,
      plan_json: input.updatedPlan ? { ...input.updatedPlan } : undefined,
      approved_by: input.approvedBy,
    });
  }

  async getPlan(planId: string): Promise<ConversationPlanRecord | null> {
    return this.plansRepository.getById(planId);
  }

  async listPlans(conversationId: string): Promise<ConversationPlanRecord[]> {
    return this.plansRepository.listByConversation(conversationId);
  }

  private buildDefaultAgentMetadata(
    input: GeneratePlanInput,
  ): AgentRuntimeAgentMetadata {
    return {
      id: null,
      slug: input.agentSlug,
      displayName: null,
      type: null,
      organizationSlug: input.organizationSlug ?? null,
    };
  }
}
