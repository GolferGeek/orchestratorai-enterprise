import { Injectable, Logger, Type, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { HttpService } from '@nestjs/axios';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { StreamingService } from './streaming.service';
import { BaseAgentRunner } from './base-agent-runner.service';

// Agent service classes
import { LegalDepartmentService } from '../../agents/legal-department/legal-department.service';
import { MarketingSwarmService } from '../../agents/marketing-swarm/marketing-swarm.service';
import { CadAgentService } from '../../agents/cad-agent/cad-agent.service';
import { BusinessAutomationAdvisorService } from '../../agents/business-automation-advisor/business-automation-advisor.service';
import { ExtendedPostWriterService } from '../../agents/extended-post-writer/extended-post-writer.service';
import { DataAnalystService } from '../../agents/data-analyst/data-analyst.service';
import { CustomerServiceService } from '../../agents/customer-service/customer-service.service';
import { RiskRunnerService } from '../../agents/risk-runner/risk-runner.service';
import { PredictorService } from '../../agents/predictor/predictor.service';

/**
 * Registry entry for a LangGraph agent service.
 *
 * Each agent has a different method name and input shape.
 * This registry maps slug → { serviceClass, methodName }.
 */
interface AgentServiceEntry {
  serviceClass: Type<unknown>;
  methodName: string;
}

/**
 * LanggraphAgentRunnerService
 *
 * Invokes LangGraph agent services directly via NestJS ModuleRef,
 * avoiding the old HTTP round-trip to a separate LangGraph server.
 *
 * Each LangGraph agent (legal-department, marketing-swarm, etc.) is a NestJS
 * module with its own service. This runner resolves the service dynamically
 * by agent slug and calls its primary method (process/execute/generate/analyze).
 */
@Injectable()
export class LanggraphAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(LanggraphAgentRunnerService.name);

  /**
   * Maps agent slug → service class + method name.
   */
  private readonly serviceRegistry: Map<string, AgentServiceEntry>;

  constructor(
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
    contextOptimization: ContextOptimizationService,
    plansService: PlansService,
    conversationsService: Agent2AgentConversationsService,
    deliverablesService: DeliverablesService,
    streamingService: StreamingService,
    httpService: HttpService,
    private readonly moduleRef: ModuleRef,
  ) {
    super(
      llmService,
      contextOptimization,
      plansService,
      conversationsService,
      deliverablesService,
      streamingService,
      httpService,
    );

    this.serviceRegistry = new Map<string, AgentServiceEntry>([
      [
        'legal-department',
        {
          serviceClass: LegalDepartmentService,
          methodName: 'process',
        },
      ],
      [
        'marketing-swarm',
        {
          serviceClass: MarketingSwarmService,
          methodName: 'execute',
        },
      ],
      [
        'cad-agent',
        {
          serviceClass: CadAgentService,
          methodName: 'generate',
        },
      ],
      [
        'business-automation-advisor',
        {
          serviceClass: BusinessAutomationAdvisorService,
          methodName: 'generate',
        },
      ],
      [
        'extended-post-writer',
        {
          serviceClass: ExtendedPostWriterService,
          methodName: 'generate',
        },
      ],
      [
        'data-analyst',
        {
          serviceClass: DataAnalystService,
          methodName: 'analyze',
        },
      ],
      [
        'customer-service',
        {
          serviceClass: CustomerServiceService,
          methodName: 'process',
        },
      ],
      [
        'investment-risk-agent',
        {
          serviceClass: RiskRunnerService,
          methodName: 'process',
        },
      ],
      [
        'us-tech-stocks',
        {
          serviceClass: PredictorService,
          methodName: 'process',
        },
      ],
      [
        'predictor',
        {
          serviceClass: PredictorService,
          methodName: 'process',
        },
      ],
    ]);
  }

  /**
   * Dashboard-capable agent slugs.
   * These agents support a custom 'dashboard' mode for UI data operations.
   */
  private readonly dashboardAgents = new Set([
    'investment-risk-agent',
    'us-tech-stocks',
    'predictor',
  ]);

  /**
   * Override execute to intercept dashboard mode for agents that support it.
   * Dashboard mode is a custom mode not in AgentTaskMode enum, so it would
   * fail the base class canExecuteMode check. We intercept it here.
   */
  async execute(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const mode = request.mode || (request.payload?.mode as string | undefined);

    // Intercept dashboard mode for agents that support it
    if (mode === 'dashboard' && this.dashboardAgents.has(definition.slug)) {
      return this.handleDashboardMode(definition, request);
    }

    // Also intercept 'runner' mode for manual runner triggers
    if (mode === 'runner' && this.dashboardAgents.has(definition.slug)) {
      return this.handleDashboardMode(definition, request);
    }

    // Delegate to base class for standard modes (CONVERSE, BUILD, PLAN, HITL)
    return super.execute(definition, request, organizationSlug);
  }

  /**
   * Handle dashboard/runner mode by invoking the agent service's process method directly.
   * Packages the request into the shape expected by RiskRunnerService/PredictorService.
   */
  private async handleDashboardMode(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const slug = definition.slug;
    const entry = this.serviceRegistry.get(slug);

    if (!entry) {
      return TaskResponseDto.failure(
        'dashboard',
        `No service registered for agent: ${slug}`,
      );
    }

    const startTime = Date.now();

    let service: Record<string, unknown>;
    try {
      service = this.moduleRef.get<Record<string, unknown>>(
        entry.serviceClass,
        { strict: false },
      );
    } catch (error) {
      return TaskResponseDto.failure(
        'dashboard',
        `Failed to resolve service for agent: ${slug}`,
      );
    }

    // Build the input for dashboard/runner mode
    const payload = request.payload as Record<string, unknown> | undefined;
    const input = {
      context: request.context,
      mode: request.mode || payload?.mode,
      action: payload?.action,
      payload: payload,
      userMessage: request.userMessage,
    };

    const method = service[entry.methodName];
    if (typeof method !== 'function') {
      return TaskResponseDto.failure(
        'dashboard',
        `Method ${entry.methodName} not found on service for agent: ${slug}`,
      );
    }

    const result = await (method as (...args: unknown[]) => Promise<unknown>).call(
      service,
      input,
    );
    const duration = Date.now() - startTime;

    return this.normalizeResult(result, slug, request, duration);
  }

  /**
   * Override handleConverse to invoke LangGraph agent service directly.
   */
  protected async handleConverse(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return this.invokeLanggraphAgent(definition, request);
  }

  /**
   * executeBuild wraps the LangGraph result in a deliverable.
   *
   * BUILD-mode agents (cad-agent, extended-post-writer, etc.) go through the
   * A2A response-switch which expects payload.content.deliverable. Without
   * creating a deliverable record here, the response-switch returns an error.
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    // Invoke the agent service the same way as CONVERSE
    const rawResponse = await this.invokeLanggraphAgent(definition, request);

    // If invocation failed, return the failure as-is
    if (!rawResponse.success) {
      return rawResponse;
    }

    // Create a deliverable from the result so the frontend response-switch works
    const content = rawResponse.payload?.content as
      | Record<string, unknown>
      | undefined;
    if (!content || !request.context) {
      return rawResponse;
    }

    // Serialize the full agent result as the deliverable content
    const deliverableContent =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    const taskId = request.context.taskId;

    const deliverableResult = await this.deliverablesService.executeAction(
      'create',
      {
        title: `${definition.name}: ${(request.userMessage || '').substring(0, 100) || 'Result'}`,
        content: deliverableContent,
        format: 'json',
        type: definition.config?.deliverable?.type || 'api-response',
        agentName: definition.slug,
        taskId: taskId || undefined,
        metadata: {
          provider: 'langgraph',
          agentSlug: definition.slug,
          duration: (content.duration as number) || 0,
        },
      },
      request.context,
    );

    if (!deliverableResult.success) {
      this.logger.error(
        `Failed to create deliverable for agent ${definition.slug}: ${deliverableResult.error?.message}`,
      );
      // Return the raw response rather than failing — data is still in the task record
      return rawResponse;
    }

    // Wrap deliverable in the shape response-switch expects: { deliverable, version }
    const deliverableData = deliverableResult.data as
      | Record<string, unknown>
      | undefined;
    const contentWithDeliverable =
      deliverableData &&
      typeof deliverableData === 'object' &&
      'deliverable' in deliverableData
        ? deliverableData
        : { deliverable: deliverableData };

    const response = TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: contentWithDeliverable,
      metadata: (rawResponse.payload?.metadata as Record<string, unknown>) || {
        agentSlug: definition.slug,
        provider: 'langgraph',
      },
    });

    if (request.context) {
      return response.withContext(request.context);
    }
    return response;
  }

  /**
   * Core invocation: resolve service by slug, build input, call method, normalize response.
   */
  private async invokeLanggraphAgent(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const slug = definition.slug;
    const entry = this.serviceRegistry.get(slug);

    if (!entry) {
      this.logger.error(
        `No LangGraph service registered for agent slug: ${slug}`,
      );
      return TaskResponseDto.failure(
        request.mode || AgentTaskMode.CONVERSE,
        `No LangGraph service registered for agent: ${slug}`,
      );
    }

    const startTime = Date.now();

    // Resolve the service instance from NestJS DI container
    let service: Record<string, unknown>;
    try {
      service = this.moduleRef.get<Record<string, unknown>>(
        entry.serviceClass,
        { strict: false },
      );
    } catch (error) {
      this.logger.error(
        `Failed to resolve service for agent ${slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return TaskResponseDto.failure(
        request.mode || AgentTaskMode.CONVERSE,
        `Failed to resolve LangGraph service for agent: ${slug}`,
      );
    }

    // Build input for the agent service
    const input = this.buildAgentInput(slug, request);

    this.logger.log(
      `Invoking LangGraph agent: slug=${slug}, method=${entry.methodName}`,
    );

    // Emit observability event
    if (request.context) {
      this.emitObservabilityEvent(
        'agent.started',
        `LangGraph agent ${slug} started`,
        request.context,
        { mode: request.mode },
      );
    }

    // Call the service method
    const method = service[entry.methodName];
    if (typeof method !== 'function') {
      this.logger.error(
        `Method ${entry.methodName} not found on service for agent ${slug}`,
      );
      return TaskResponseDto.failure(
        request.mode || AgentTaskMode.CONVERSE,
        `Method ${entry.methodName} not found on LangGraph service for agent: ${slug}`,
      );
    }

    const result: unknown = await (
      method as (...args: unknown[]) => Promise<unknown>
    ).call(service, input);
    const duration = Date.now() - startTime;

    this.logger.log(
      `LangGraph agent completed: slug=${slug}, duration=${duration}ms`,
    );

    // Emit completion event
    if (request.context) {
      this.emitObservabilityEvent(
        'agent.completed',
        `LangGraph agent ${slug} completed in ${duration}ms`,
        request.context,
        { mode: request.mode, progress: 100 },
      );
    }

    // Normalize result to TaskResponseDto
    return this.normalizeResult(result, slug, request, duration);
  }

  /**
   * Build agent-specific input from TaskRequestDto.
   *
   * All LangGraph agents expect { context: ExecutionContext, userMessage, ...extras }.
   * The extras come from request.payload (spread agent-specific fields).
   */
  private buildAgentInput(
    slug: string,
    request: TaskRequestDto,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      context: request.context,
      userMessage: request.userMessage || '',
    };

    // Marketing-swarm expects taskId at the top level
    if (slug === 'marketing-swarm') {
      base.taskId = request.context?.taskId;
    }

    // Business-automation-advisor expects industry from payload or userMessage
    if (slug === 'business-automation-advisor') {
      const payload = request.payload || {};
      base.industry = payload.industry || request.userMessage || '';
    }

    // CAD agent and other frontends encode structured data as JSON in userMessage.
    // The old HTTP flow went through the agent's controller which parsed the body.
    // We need to extract the actual prompt and agent-specific fields from the JSON.
    if (typeof base.userMessage === 'string') {
      try {
        const parsed = JSON.parse(base.userMessage) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && parsed['type']) {
          // Extract the actual prompt from the parsed JSON
          // Agents use different field names: prompt, userMessage, or message
          const extractedPrompt =
            (parsed['prompt'] as string | undefined) ||
            (parsed['userMessage'] as string | undefined) ||
            (parsed['message'] as string | undefined);
          if (extractedPrompt) {
            base.userMessage = extractedPrompt;
          }
          // Spread agent-specific fields (projectId, constraints, etc.)
          const {
            type: _type,
            prompt: _prompt,
            userMessage: _um,
            message: _msg,
            ...agentFields
          } = parsed;
          Object.assign(base, agentFields);
        }
      } catch {
        // Not JSON — leave userMessage as-is (plain text prompt)
      }
    }

    // Spread any payload fields for agent-specific inputs
    // (documents, legalMetadata, keywords, tone, projectId, constraints, etc.)
    if (request.payload) {
      const {
        action: _action,
        executionMode: _execMode,
        documents: _payloadDocs,
        ...agentFields
      } = request.payload;
      Object.assign(base, agentFields);
    }

    // Transform processed documents from metadata into agent-expected format.
    // The controller's DocumentProcessingService extracts text from uploaded files
    // and stores results in metadata.documents[]. LangGraph agents expect
    // documents as { name, content, type } arrays.
    const metadataDocs =
      (request.metadata?.documents as Array<Record<string, unknown>>) || [];
    if (metadataDocs.length > 0) {
      base.documents = metadataDocs.map((doc) => ({
        name: (doc.filename as string) || 'unknown',
        content: (doc.extractedText as string) || '',
        type: (doc.mimeType as string) || 'application/octet-stream',
      }));

      // Pass through legalMetadata from the first document if available
      const firstDocMeta = metadataDocs[0]?.legalMetadata;
      if (firstDocMeta && !base.legalMetadata) {
        base.legalMetadata = firstDocMeta;
      }
    }

    return base;
  }

  /**
   * Normalize agent result into TaskResponseDto.
   *
   * Agent services return different shapes but commonly include:
   * - status: 'completed' | 'failed' | 'success' | 'error'
   * - response/result/message/summary: the main content
   * - error: error message if failed
   * - duration: processing time
   */
  private normalizeResult(
    result: unknown,
    agentSlug: string,
    request: TaskRequestDto,
    duration: number,
  ): TaskResponseDto {
    const mode = request.mode || AgentTaskMode.CONVERSE;

    if (!result || typeof result !== 'object') {
      return TaskResponseDto.failure(
        mode,
        `Agent ${agentSlug} returned no result`,
      );
    }

    const r = result as Record<string, unknown>;

    // Check for error status
    const status = r.status as string | undefined;
    if (status === 'failed' || status === 'error') {
      const errorMsg =
        (r.error as string) ||
        (r.message as string) ||
        `Agent ${agentSlug} failed`;
      return TaskResponseDto.failure(mode, errorMsg);
    }

    // Pass the full result as content so structured data (specialistOutputs,
    // legalMetadata, routingDecision, etc.) is preserved for the frontend.
    const response = TaskResponseDto.success(mode, {
      content: r,
      metadata: {
        agentSlug,
        provider: 'langgraph',
        duration: (r.duration as number) || duration,
        status: status || 'completed',
      },
    });

    // Attach ExecutionContext
    if (request.context) {
      return response.withContext(request.context);
    }

    return response;
  }
}
