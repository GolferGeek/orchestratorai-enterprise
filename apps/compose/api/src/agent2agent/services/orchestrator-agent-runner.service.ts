import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseAgentRunner } from './base-agent-runner.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { StreamingService } from './streaming.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Orchestrator V2 Agent Runner
 *
 * Minimal proxy that delegates to sub-agents via standard A2A endpoints.
 *
 * Features:
 * - Sticky routing: if current_sub_agent exists in metadata, route directly
 * - LLM-based selection: for first message, use LLM to pick best sub-agent
 * - Attribution: adds resolvedBy, resolvedByDisplayName, current_sub_agent to responses
 * - Standard A2A protocol: uses /agent-to-agent/{orgSlug}/{agentSlug}/tasks endpoint
 */
@Injectable()
export class OrchestratorAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(OrchestratorAgentRunnerService.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    httpService: HttpService,
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
    contextOptimization: ContextOptimizationService,
    plansService: PlansService,
    conversationsService: Agent2AgentConversationsService,
    deliverablesService: DeliverablesService,
    streamingService: StreamingService,
    private readonly configService: ConfigService,
  ) {
    super(
      llmService,
      contextOptimization,
      plansService,
      conversationsService,
      deliverablesService,
      streamingService,
      httpService, // Pass httpService to base class
    );
  }

  /**
   * Override executeBuild to implement delegation logic
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    try {
      // Extract current sub-agent from metadata (sticky routing)
      const currentSubAgent = request.metadata?.current_sub_agent as
        | string
        | undefined;

      let targetAgent: string;

      if (currentSubAgent) {
        // Sticky routing: continue with same sub-agent
        targetAgent = currentSubAgent;
        this.logger.log(`Sticky routing to sub-agent: ${targetAgent}`);
      } else {
        // First message: use LLM to select best sub-agent
        targetAgent = await this.selectSubAgent(
          definition,
          request,
          organizationSlug,
        );
        this.logger.log(`LLM selected sub-agent: ${targetAgent}`);
      }

      // Delegate to sub-agent via standard A2A endpoint
      const response = await this.delegateToSubAgent(
        targetAgent,
        request,
        organizationSlug,
      );

      // Add attribution metadata
      const subAgentDefinition = await this.agentRegistry.getAgent(
        organizationSlug,
        targetAgent,
      );

      return this.addAttribution(
        response,
        targetAgent,
        subAgentDefinition?.name,
      );
    } catch (error) {
      this.logger.error(
        `Orchestrator delegation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Use LLM to select the best sub-agent for the user's request
   */
  private async selectSubAgent(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<string> {
    // Get available sub-agents
    const agents = await this.agentRegistry.listAgents(organizationSlug);

    // Filter to only sub-agents (exclude orchestrators based on capabilities)
    const subAgents = agents.filter(
      (a) => !a.capabilities?.includes('orchestrate'),
    );

    if (subAgents.length === 0) {
      throw new Error('No sub-agents available for delegation');
    }

    if (subAgents.length === 1) {
      return subAgents[0]?.slug || '';
    }

    // Build LLM prompt with user message and agent capabilities
    const userMessage = request.userMessage || JSON.stringify(request.payload);
    const agentList = subAgents
      .map(
        (a) => `- ${a.slug}: ${a.name} - ${a.description || 'No description'}`,
      )
      .join('\n');

    const prompt = `You are an orchestrator selecting the best agent for a user's request.

User request: "${userMessage}"

Available agents:
${agentList}

Respond with ONLY the agent slug (e.g., "marketing", "analytics"). Choose the single best match.`;

    // Use LLM to select
    const response = await this.llmService.generateResponse(
      prompt,
      '', // No user message needed
      {
        executionContext: request.context,
        maxTokens: 50,
        temperature: 0.1, // Low temperature for consistent selection
      },
    );

    const selected = (
      typeof response === 'string' ? response : response.content
    )
      .trim()
      .toLowerCase();

    // Validate selection
    const match = subAgents.find((a) => a.slug === selected);
    if (!match) {
      // Fallback to first available agent if LLM returns invalid selection
      this.logger.warn(
        `LLM returned invalid agent "${selected}", using fallback`,
      );
      return subAgents[0]?.slug || '';
    }

    return selected;
  }

  /**
   * Forward request to sub-agent via HTTP
   */
  private async delegateToSubAgent(
    targetAgent: string,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const baseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    const orgPath = organizationSlug || 'global';
    const url = `${baseUrl}/agent-to-agent/${orgPath}/${targetAgent}/tasks`;

    // Add current_sub_agent to metadata for sticky routing
    const forwardRequest = {
      ...request,
      metadata: {
        ...request.metadata,
        current_sub_agent: targetAgent,
      },
    };

    const { data } = await firstValueFrom(
      this.httpService!.post<TaskResponseDto>(url, forwardRequest, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    return data;
  }

  /**
   * Add attribution metadata to response
   */
  private addAttribution(
    response: TaskResponseDto,
    subAgentSlug: string,
    subAgentDisplayName?: string | null,
  ): TaskResponseDto {
    return new TaskResponseDto(
      response.success,
      response.mode,
      {
        ...response.payload,
        metadata: {
          ...response.payload.metadata,
          resolvedBy: subAgentSlug,
          resolvedByDisplayName: subAgentDisplayName || subAgentSlug,
          current_sub_agent: subAgentSlug,
        },
      },
      response.humanResponse,
    );
  }
}
