import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { AgentRecord } from '@agent-platform/interfaces/agent.interface';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeDefinitionService } from '@agent-platform/services/agent-runtime-definition.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { AgentRunnerRegistryService } from './agent-runner-registry.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Execution context passed to mode router
 * The ExecutionContext capsule contains all identity info (org, agent, user, task, etc.)
 */
export interface AgentExecutionContext {
  /** ExecutionContext capsule - the core context that flows through the system */
  context: ExecutionContext;
  /** Agent runtime definition (transport config, capabilities) - optional, will be looked up if not provided */
  definition?: AgentRuntimeDefinition;
  /** The task request */
  request: TaskRequestDto;
  /** Routing policy assessment results */
  routingMetadata?: Record<string, unknown>;
}

/**
 * Hydrated context with guaranteed agent record and definition
 */
type HydratedExecutionContext = AgentExecutionContext & {
  agent: AgentRecord;
  definition: AgentRuntimeDefinition;
};

@Injectable()
export class AgentModeRouterService {
  private readonly logger = new Logger(AgentModeRouterService.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly runtimeDefinitions: AgentRuntimeDefinitionService,
    private readonly runnerRegistry: AgentRunnerRegistryService,
  ) {}

  async execute(execContext: AgentExecutionContext): Promise<TaskResponseDto> {
    this.logger.log(`[MODE-ROUTER] execute() ENTRY`);
    const { context, request } = execContext;

    // Check if this is an HITL method (uses 'method' field in payload)
    const payload = request.payload;
    const method = payload?.method as string | undefined;

    this.logger.log(
      `[MODE-ROUTER] mode: ${request.mode}, payload.method: ${method}, agentSlug: ${context.agentSlug}`,
    );

    // Route HITL methods (hitl.resume, hitl.status, hitl.history, hitl.pending)
    if (method?.startsWith('hitl.')) {
      this.logger.log(
        `[MODE-ROUTER] Routing to HITL method handler: ${method}`,
      );
      return this.routeHitlMethod(method, execContext);
    }

    this.logger.log(`[MODE-ROUTER] Calling hydrateContext...`);
    const hydrated = await this.hydrateContext(execContext);

    if (!hydrated) {
      this.logger.log(`[MODE-ROUTER] hydrateContext returned null - FAILING`);
      return TaskResponseDto.failure(
        request.mode!,
        'Agent record unavailable for execution',
      );
    }
    this.logger.log(`[MODE-ROUTER] hydrateContext returned successfully`);

    // Validate sovereign mode compliance before routing
    this.validateSovereignModeCompliance(hydrated.definition, request);

    // Route to the appropriate runner based on agent type
    const agentType = hydrated.definition.agentType;
    this.logger.log(`[MODE-ROUTER] agentType: ${agentType}`);
    const runner = this.runnerRegistry.getRunner(agentType);

    if (!runner) {
      this.logger.log(
        `[MODE-ROUTER] No runner for agentType ${agentType} - FAILING`,
      );
      return TaskResponseDto.failure(
        request.mode!,
        `No runner available for agent type: ${agentType}`,
      );
    }
    this.logger.log(`[MODE-ROUTER] Got runner for ${agentType}`);

    this.logger.log(
      `[MODE-ROUTER] About to call runner.execute() for ${agentType}`,
    );
    const result = await runner.execute(
      hydrated.definition,
      hydrated.request,
      context.orgSlug,
    );
    this.logger.log(
      `[MODE-ROUTER] runner.execute() returned: success=${result.success}, mode=${result.mode}`,
    );
    return result;
  }

  /**
   * Route HITL-specific methods
   * All HITL methods are handled by the API agent runner
   *
   * Methods:
   * - hitl.resume: Resume workflow with decision
   * - hitl.status: Get HITL status for a task
   * - hitl.history: Get version history for a task
   * - hitl.pending: Get all pending HITL reviews (cross-agent, uses _system)
   */
  private async routeHitlMethod(
    method: string,
    execContext: AgentExecutionContext,
  ): Promise<TaskResponseDto> {
    const { context, request } = execContext;
    this.logger.log(`Routing HITL method: ${method}`);

    // For hitl.pending, we don't need an agent - it's a cross-agent query
    if (method === 'hitl.pending' || context.agentSlug === '_system') {
      return this.handleSystemHitlMethod(method, execContext);
    }

    // For other HITL methods, we need to hydrate the context to get agent info
    const hydrated = await this.hydrateContext(execContext);

    if (!hydrated) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'Agent record unavailable for HITL execution',
      );
    }

    // Get API runner (handles HITL for all agent types)
    const apiRunner = this.runnerRegistry.getRunner('api');

    if (!apiRunner) {
      this.logger.error('API runner not registered - required for HITL');
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'API runner not available for HITL operations',
      );
    }

    // Pass the HITL method in request so runner knows what to do
    const hitlRequest: TaskRequestDto = {
      ...request,
      mode: AgentTaskMode.HITL,
      payload: {
        ...(request.payload as Record<string, unknown>),
        hitlMethod: method, // hitl.resume, hitl.status, hitl.history
      },
    };

    return apiRunner.execute(hydrated.definition, hitlRequest, context.orgSlug);
  }

  /**
   * Handle system-level HITL methods (like hitl.pending)
   * These don't require a specific agent definition
   */
  private async handleSystemHitlMethod(
    method: string,
    execContext: AgentExecutionContext,
  ): Promise<TaskResponseDto> {
    const { context, request } = execContext;

    // Only hitl.pending is supported for system-level queries
    if (method !== 'hitl.pending') {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        `Method ${method} not supported for _system agent. Only hitl.pending is allowed.`,
      );
    }

    // Get API runner
    const apiRunner = this.runnerRegistry.getRunner('api');

    if (!apiRunner) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'API runner not available for HITL pending query',
      );
    }

    // Build request with null definition (system-level query)
    const hitlRequest: TaskRequestDto = {
      ...request,
      mode: AgentTaskMode.HITL,
      payload: {
        ...(request.payload as Record<string, unknown>),
        hitlMethod: 'hitl.pending',
      },
    };

    // Execute with null definition - API runner will handle system queries
    return apiRunner.execute(
      null as unknown as AgentRuntimeDefinition, // System-level, no agent needed
      hitlRequest,
      context.orgSlug,
    );
  }

  /**
   * Hydrate context by looking up agent record and building definition
   * Uses orgSlug and agentSlug from ExecutionContext
   */
  private async hydrateContext(
    execContext: AgentExecutionContext,
  ): Promise<HydratedExecutionContext | null> {
    const { context, definition: existingDefinition } = execContext;
    const { orgSlug, agentSlug } = context;

    if (!agentSlug) {
      this.logger.warn('Agent slug missing from ExecutionContext');
      return null;
    }

    // Look up agent record from registry
    const agentRecord = await this.agentRegistry.getAgent(orgSlug, agentSlug);

    if (!agentRecord) {
      this.logger.warn(
        `Agent ${agentSlug} not found for organization ${orgSlug || 'global'}`,
      );
      return null;
    }

    // Use existing definition or build from agent record
    const definition =
      existingDefinition ??
      this.runtimeDefinitions.buildDefinition(agentRecord);

    return {
      ...execContext,
      agent: agentRecord,
      definition,
    };
  }

  /**
   * Validate that the request complies with sovereign mode requirements.
   * If the agent requires local model execution, only Ollama provider is allowed.
   *
   * @param definition - The agent runtime definition
   * @param request - The task request containing provider info
   * @throws BadRequestException if provider is not allowed for sovereign agent
   */
  private validateSovereignModeCompliance(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
  ): void {
    const requiresLocal =
      definition.require_local_model || definition.record?.require_local_model;

    if (!requiresLocal) {
      return; // Agent doesn't require local model, any provider is allowed
    }

    // Extract provider from request context (ExecutionContext type)
    const provider = request.context?.provider?.toLowerCase();

    // If provider is specified and not Ollama, reject the request
    if (provider && provider !== 'ollama') {
      this.logger.warn(
        `Sovereign mode violation: Agent "${definition.slug}" requires local model, ` +
          `but provider "${provider}" was requested`,
      );
      throw new BadRequestException(
        `Agent "${definition.slug}" requires local model execution. ` +
          `Provider "${provider}" is not allowed. Use "ollama" provider.`,
      );
    }
  }
}
