import { Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { LLMServiceProvider } from '@/planes/llm/llm.interface';
import { IAgentRunner } from '../interfaces/agent-runner.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { StreamingService } from './streaming.service';
import * as ConverseHandlers from './base-agent-runner/converse.handlers';
import * as PlanHandlers from './base-agent-runner/plan.handlers';
import * as BuildHandlers from './base-agent-runner/build.handlers';
import * as HitlHandlers from './base-agent-runner/hitl.handlers';
import { handleError as sharedHandleError } from './base-agent-runner/shared.helpers';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Base abstract class for all agent runners.
 *
 * This class provides common functionality for all agent types:
 * - Mode routing (CONVERSE, PLAN, BUILD)
 * - Capability validation
 * - Utility methods for request handling
 * - Error handling and logging
 * - Organization context management
 *
 * All concrete agent runners (Context, Tool, API, External, Function, Orchestrator)
 * should extend this class and implement the abstract mode handlers.
 *
 * Execution Flow:
 * 1. execute() receives task request
 * 2. Validates agent supports requested mode
 * 3. Routes to appropriate handler (handleConverse/Plan/Build)
 * 4. Handlers process request with LLM/service calls
 * 5. Returns structured response
 *
 * Error Handling:
 * - Errors are caught and wrapped in standardized format
 * - User-friendly messages provided
 * - Technical details logged for debugging
 *
 * @see docs/CODE_TOUR.md for architecture overview
 * @see docs/tutorials/BUILD_FIRST_AGENT.md for creating agents
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ContextAgentRunnerService extends BaseAgentRunner {
 *   constructor(
 *     private readonly contextOptimization: ContextOptimizationService,
 *     private readonly llmService: LLMService
 *   ) {
 *     super();
 *   }
 *
 *   protected async handleConverse(...) {
 *     // Implementation
 *   }
 *
 *   protected async handlePlan(...) {
 *     // Implementation
 *   }
 *
 *   protected async handleBuild(...) {
 *     // Implementation
 *   }
 * }
 * ```
 */
export abstract class BaseAgentRunner implements IAgentRunner {
  protected readonly logger: Logger;

  constructor(
    protected readonly llmService: LLMServiceProvider,
    protected readonly contextOptimization: ContextOptimizationService,
    protected readonly plansService: PlansService,
    protected readonly conversationsService: Agent2AgentConversationsService,
    protected readonly deliverablesService: DeliverablesService,
    protected readonly streamingService: StreamingService,
    @Inject(HttpService) protected readonly httpService?: HttpService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Main execution method - routes to appropriate mode handler.
   *
   * This method:
   * 1. Validates the agent supports the requested mode
   * 2. Routes to handleConverse(), handlePlan(), or handleBuild()
   * 3. Handles errors gracefully
   *
   * @param definition - Agent runtime definition
   * @param request - Task request
   * @param organizationSlug - Organization context
   * @returns Task response
   */
  async execute(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const mode = request.mode;
    const organizationSlug = _organizationSlug;

    // Validate mode is specified
    this.logger.debug(
      `🔍 [BASE-RUNNER] execute() called - mode: ${mode}, agent: ${definition.slug}`,
    );
    if (!mode) {
      this.logger.debug(`🔍 [BASE-RUNNER] mode not specified - FAILING`);
      this.logger.error('Task mode not specified in request');
      return TaskResponseDto.failure(
        AgentTaskMode.CONVERSE, // Default for error reporting
        'Task mode not specified',
      );
    }

    // Validate agent supports the requested mode
    const canExec = this.canExecuteMode(definition, mode);
    this.logger.debug(`🔍 [BASE-RUNNER] canExecuteMode(${mode}): ${canExec}`);
    if (!canExec) {
      this.logger.debug(
        `🔍 [BASE-RUNNER] canExecuteMode returned false - FAILING`,
      );
      this.logger.warn(
        `Agent ${definition.slug} does not support ${mode} mode`,
      );
      return TaskResponseDto.failure(
        mode,
        `Agent does not support ${mode} mode`,
      );
    }

    // Route to appropriate mode handler
    this.logger.debug(`🔍 [BASE-RUNNER] Routing to mode handler: ${mode}`);
    try {
      switch (mode) {
        case AgentTaskMode.CONVERSE:
          return await this.handleConverse(
            definition,
            request,
            organizationSlug,
          );

        case AgentTaskMode.PLAN:
          return await this.handlePlan(definition, request, organizationSlug);

        case AgentTaskMode.BUILD:
          return await this.handleBuild(definition, request, organizationSlug);

        case AgentTaskMode.HITL:
          return await this.handleHitl(definition, request, organizationSlug);

        default:
          this.logger.warn(`Unsupported mode: ${String(mode)}`);
          return TaskResponseDto.failure(mode, 'Unsupported mode');
      }
    } catch (error) {
      this.logger.error(
        `Error executing agent ${definition.slug} in ${mode} mode: ${error instanceof Error ? error.message : String(error)}`,
      );
      return TaskResponseDto.failure(
        mode,
        `Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handle CONVERSE mode - conversational interaction.
   *
   * Implementations should:
   * - Process user message
   * - Return conversational response
   * - Save to conversation history (if applicable)
   *
   * @param definition - Agent runtime definition
   * @param request - Task request with user message
   * @param organizationSlug - Organization context
   * @returns Task response with conversational content
   */
  protected async handleConverse(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    try {
      return await ConverseHandlers.executeConverse(
        definition,
        request,
        organizationSlug,
        this.getConverseDependencies(),
      );
    } catch (error) {
      this.logger.error(
        `Failed to execute CONVERSE mode for agent ${definition.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return sharedHandleError(AgentTaskMode.CONVERSE, error);
    }
  }

  /**
   * Handle PLAN mode - structured planning.
   *
   * Implementations should:
   * - Generate or manipulate plan based on action ('create', 'read', 'edit', etc.)
   * - Save plan via PlansService (for 'create' action)
   * - Return plan structure
   *
   * @param definition - Agent runtime definition
   * @param request - Task request with planning context
   * @param organizationSlug - Organization context
   * @returns Task response with plan data
   */
  protected async handlePlan(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = (request.payload ?? {}) as { action?: string };
    const action =
      typeof payload.action === 'string' ? payload.action : 'create';

    try {
      switch (action) {
        case 'create':
          return await this.handlePlanCreate(
            definition,
            request,
            organizationSlug,
          );
        case 'read':
          return await this.handlePlanRead(
            definition,
            request,
            organizationSlug,
          );
        case 'list':
          return await this.handlePlanList(
            definition,
            request,
            organizationSlug,
          );
        case 'edit':
          return await this.handlePlanEdit(
            definition,
            request,
            organizationSlug,
          );
        case 'rerun':
          return await this.handlePlanRerun(
            definition,
            request,
            organizationSlug,
          );
        case 'set_current':
          return await this.handlePlanSetCurrent(
            definition,
            request,
            organizationSlug,
          );
        case 'delete_version':
          return await this.handlePlanDeleteVersion(
            definition,
            request,
            organizationSlug,
          );
        case 'merge_versions':
          return await this.handlePlanMergeVersions(
            definition,
            request,
            organizationSlug,
          );
        case 'copy_version':
          return await this.handlePlanCopyVersion(
            definition,
            request,
            organizationSlug,
          );
        case 'delete':
          return await this.handlePlanDelete(
            definition,
            request,
            organizationSlug,
          );
        default:
          this.logger.warn(
            `Unsupported PLAN action "${action}" for agent ${definition.slug}`,
          );
          return TaskResponseDto.failure(
            AgentTaskMode.PLAN,
            `Unsupported plan action: ${action}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to execute PLAN action "${action}" for agent ${definition.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Handle BUILD mode - deliverable creation.
   *
   * Implementations should:
   * - Generate or manipulate deliverable based on action ('create', 'read', 'edit', etc.)
   * - Save deliverable via DeliverablesService (for 'create' action)
   * - Return deliverable structure
   *
   * @param definition - Agent runtime definition
   * @param request - Task request with build context
   * @param organizationSlug - Organization context
   * @returns Task response with deliverable data
   */
  protected async handleBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    this.logger.debug(
      `🔍 [BASE-RUNNER] handleBuild() ENTRY - agent: ${definition.slug}`,
    );
    const payload = (request.payload ?? {}) as {
      action?: string;
      executionMode?: string;
    };
    const action =
      typeof payload.action === 'string' ? payload.action : 'create';
    this.logger.debug(
      `🔍 [BASE-RUNNER] handleBuild() action: ${action}, executionMode: ${payload.executionMode}`,
    );

    // Check execution mode for 'create' action - handle real-time (SSE) mode
    // Note: real-time/polling mode now executes synchronously but still streams progress updates
    if (action === 'create') {
      const executionMode = payload.executionMode || 'immediate';

      if (executionMode === 'real-time' || executionMode === 'polling') {
        return await this.handleBuildWithStreaming(
          definition,
          request,
          organizationSlug,
          executionMode,
        );
      }
    }

    try {
      switch (action) {
        case 'create': {
          this.logger.debug(
            `🔍 [BASE-RUNNER] handleBuild() calling executeBuild()...`,
          );
          const result = await this.executeBuild(
            definition,
            request,
            organizationSlug,
          );
          this.logger.debug(
            `🔍 [BASE-RUNNER] handleBuild() executeBuild() returned: success=${result.success}`,
          );
          // Add humanResponse for conversational build responses at the base level
          const buildContent = result.payload?.content as
            | {
                deliverable?: unknown;
                message?: string;
                isConversational?: boolean;
              }
            | undefined;
          if (
            result.success &&
            buildContent?.isConversational &&
            buildContent?.message &&
            !buildContent?.deliverable
          ) {
            (result as { humanResponse?: { message: string } }).humanResponse =
              {
                message: buildContent.message,
              };
          }
          return result;
        }
        case 'read':
          return await this.handleBuildRead(
            definition,
            request,
            organizationSlug,
          );
        case 'list':
          return await this.handleBuildList(
            definition,
            request,
            organizationSlug,
          );
        case 'edit':
          return await this.handleBuildEdit(
            definition,
            request,
            organizationSlug,
          );
        case 'rerun':
          return await this.handleBuildRerun(
            definition,
            request,
            organizationSlug,
          );
        case 'set_current':
          return await this.handleBuildSetCurrent(
            definition,
            request,
            organizationSlug,
          );
        case 'delete_version':
          return await this.handleBuildDeleteVersion(
            definition,
            request,
            organizationSlug,
          );
        case 'merge_versions':
          return await this.handleBuildMergeVersions(
            definition,
            request,
            organizationSlug,
          );
        case 'copy_version':
          return await this.handleBuildCopyVersion(
            definition,
            request,
            organizationSlug,
          );
        case 'delete':
          return await this.handleBuildDelete(
            definition,
            request,
            organizationSlug,
          );
        default:
          this.logger.warn(
            `Unsupported BUILD action "${action}" for agent ${definition.slug}`,
          );
          return TaskResponseDto.failure(
            AgentTaskMode.BUILD,
            `Unsupported build action: ${action}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to execute BUILD action "${action}" for agent ${definition.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Handle BUILD with streaming (SSE or polling mode)
   *
   * For real-time/polling execution modes:
   * 1. Register stream session with StreamingService for progress updates
   * 2. Execute synchronously (await completion)
   * 3. Return deliverable in response (same as immediate mode)
   *
   * Note: Streaming is still used for progress updates via SSE, but the API
   * waits for completion and returns the deliverable synchronously.
   */
  protected async handleBuildWithStreaming(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
    _executionMode: string,
  ): Promise<TaskResponseDto> {
    // Get ExecutionContext from request (required)
    const context = request.context;
    if (!context) {
      throw new Error('ExecutionContext is required for streaming');
    }

    const userMessage = request.userMessage || '';
    const mode = 'build';

    // Register stream session for progress updates (SSE will still emit chunks)
    this.streamingService.registerStream(context, mode, userMessage);

    // Execute synchronously - wait for completion
    // Progress updates will still be streamed via SSE, but we wait for the final result
    try {
      // Emit initial progress update
      this.streamingService.emitProgress(
        context,
        'Starting build execution...',
        userMessage,
        {
          step: 'Initializing',
          progress: 0,
          status: 'running',
          sequence: 1,
          mode,
        },
      );

      const result = await this.executeBuild(
        definition,
        request,
        organizationSlug,
      );

      // Emit completion event for SSE clients
      if (result.success) {
        // Extract deliverable from result payload for build mode
        const buildContent = result.payload?.content as
          | {
              deliverable?: unknown;
              version?: unknown;
              message?: string;
              isConversational?: boolean;
            }
          | undefined;

        // Check if this is a conversational response (e.g., RAG agents, info responses)
        // If no deliverable but has message and isConversational flag, add humanResponse
        if (
          buildContent?.isConversational &&
          buildContent?.message &&
          !buildContent?.deliverable
        ) {
          (result as { humanResponse?: { message: string } }).humanResponse = {
            message: buildContent.message,
          };
        }

        // Emit completion event
        this.streamingService.emitComplete(context, userMessage, mode);
      } else {
        const errorMsg =
          (result.payload.metadata?.reason as string) || 'Build failed';
        this.streamingService.emitError(context, userMessage, mode, errorMsg);
      }

      // Return the result synchronously (same as immediate mode)
      return result;
    } catch (error) {
      this.logger.error(
        `BUILD execution failed for task ${context.taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.streamingService.emitError(
        context,
        userMessage,
        mode,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  // REMOVED: executeAndStreamBuild method
  // Real-time/polling mode now executes synchronously in handleBuildWithStreaming
  // This method is no longer needed as we await completion before returning

  /**
   * Execute build - Abstract, each runner implements specific build logic.
   */
  protected abstract executeBuild(
    _definition: AgentRuntimeDefinition,
    _request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto>;

  /**
   * Handle HITL mode - Human-in-the-Loop workflow operations.
   *
   * Implementations should:
   * - Handle resume, status, and history actions
   * - Work with LangGraph or n8n workflows that have paused for human review
   *
   * @param definition - Agent runtime definition
   * @param request - Task request with HITL action (resume, status, history)
   * @param organizationSlug - Organization context
   * @returns Task response with HITL result
   */
  protected async handleHitl(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = (request.payload ?? {}) as {
      action?: string;
      decision?: string;
      hitlMethod?: string;
    };

    // Debug: Log full payload to see what frontend sends
    this.logger.debug(
      `🔍 [HITL-HANDLER] Received payload: ${JSON.stringify(payload)}`,
    );

    // Check for new HITL method routing (Session 2)
    // hitlMethod is set by the mode router for hitl.* methods
    if (payload.hitlMethod) {
      // Delegate to subclass handleHitlMethod if it exists
      const runner = this as unknown as {
        handleHitlMethod?: (
          definition: AgentRuntimeDefinition | null,
          request: TaskRequestDto,
          organizationSlug: string | null,
        ) => Promise<TaskResponseDto>;
      };

      if (runner.handleHitlMethod) {
        return runner.handleHitlMethod(definition, request, organizationSlug);
      }

      // Fall through to legacy action handling if subclass doesn't implement
      this.logger.warn(
        `HITL method ${payload.hitlMethod} not handled - no handleHitlMethod implementation`,
      );
    }

    // If decision is present but action is not, infer action='resume'
    // Frontend sends { decision: 'approve', threadId: ... } without explicit action
    const action =
      typeof payload.action === 'string'
        ? payload.action
        : payload.decision
          ? 'resume'
          : 'status';

    this.logger.debug(
      `🔍 [HITL-HANDLER] Resolved action: ${action} for agent ${definition.slug}`,
    );

    try {
      switch (action) {
        case 'resume':
          return await this.handleHitlResume(
            definition,
            request,
            organizationSlug,
          );
        case 'status':
          return await this.handleHitlStatus(
            definition,
            request,
            organizationSlug,
          );
        case 'history':
          return await this.handleHitlHistory(
            definition,
            request,
            organizationSlug,
          );
        default:
          this.logger.warn(
            `Unsupported HITL action "${action}" for agent ${definition.slug}`,
          );
          return TaskResponseDto.failure(
            AgentTaskMode.HITL,
            `Unsupported HITL action: ${action}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to execute HITL action "${action}" for agent ${definition.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Handles HITL resume action - resume a paused workflow with human decision.
   */
  protected async handleHitlResume(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return HitlHandlers.handleHitlResume(
      definition,
      request,
      organizationSlug,
      this.getHitlHandlerDependencies(),
    );
  }

  /**
   * Handles HITL status action - get current status of a HITL workflow.
   */
  protected async handleHitlStatus(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return HitlHandlers.handleHitlStatus(
      definition,
      request,
      organizationSlug,
      this.getHitlHandlerDependencies(),
    );
  }

  /**
   * Handles HITL history action - get execution history for a HITL workflow.
   */
  protected async handleHitlHistory(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return HitlHandlers.handleHitlHistory(
      definition,
      request,
      organizationSlug,
      this.getHitlHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN create action.
   */
  protected async handlePlanCreate(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanCreate(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN read action.
   */
  protected async handlePlanRead(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanRead(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN list action.
   */
  protected async handlePlanList(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanList(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN edit action.
   */
  protected async handlePlanEdit(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanEdit(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN rerun action.
   */
  protected async handlePlanRerun(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanRerun(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN set_current action.
   */
  protected async handlePlanSetCurrent(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanSetCurrent(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN delete_version action.
   */
  protected async handlePlanDeleteVersion(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanDeleteVersion(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN merge_versions action.
   */
  protected async handlePlanMergeVersions(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanMergeVersions(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN copy_version action.
   */
  protected async handlePlanCopyVersion(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanCopyVersion(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles PLAN delete action.
   */
  protected async handlePlanDelete(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return PlanHandlers.handlePlanDelete(
      definition,
      request,
      organizationSlug,
      this.getPlanHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD read action.
   */
  protected async handleBuildRead(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildRead(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD list action.
   */
  protected async handleBuildList(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildList(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD edit action.
   */
  protected async handleBuildEdit(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildEdit(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD rerun action.
   */
  protected async handleBuildRerun(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildRerun(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
      this.executeBuild.bind(this),
    );
  }

  /**
   * Handles BUILD set_current action.
   */
  protected async handleBuildSetCurrent(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildSetCurrent(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD delete_version action.
   */
  protected async handleBuildDeleteVersion(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildDeleteVersion(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD merge_versions action.
   */
  protected async handleBuildMergeVersions(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildMergeVersions(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
      this.executeBuild.bind(this),
    );
  }

  /**
   * Handles BUILD copy_version action.
   */
  protected async handleBuildCopyVersion(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildCopyVersion(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Handles BUILD delete action.
   */
  protected async handleBuildDelete(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return BuildHandlers.handleBuildDelete(
      definition,
      request,
      organizationSlug,
      this.getBuildHandlerDependencies(),
    );
  }

  /**
   * Check if agent supports the given mode.
   *
   * @param definition - Agent runtime definition
   * @param mode - Task mode to check
   * @returns True if agent supports the mode
   */
  protected canExecuteMode(
    definition: AgentRuntimeDefinition,
    mode: AgentTaskMode,
  ): boolean {
    const exec = definition.execution;

    switch (mode) {
      case AgentTaskMode.CONVERSE:
        return exec.canConverse;
      case AgentTaskMode.PLAN:
        return exec.canPlan;
      case AgentTaskMode.BUILD:
        return exec.canBuild;
      case AgentTaskMode.HITL:
        // HITL is always allowed - it's for resuming interrupted workflows
        return true;
      default:
        return false;
    }
  }

  private getConverseDependencies(): ConverseHandlers.ConverseHandlerDependencies {
    return {
      llmService: this.llmService,
      conversationsService: this.conversationsService,
    };
  }

  private getPlanHandlerDependencies(): PlanHandlers.PlanHandlerDependencies {
    return {
      llmService: this.llmService,
      plansService: this.plansService,
      conversationsService: this.conversationsService,
    };
  }

  private getBuildHandlerDependencies(): BuildHandlers.BuildHandlerDependencies {
    return {
      deliverablesService: this.deliverablesService,
      plansService: this.plansService,
      llmService: this.llmService,
      conversationsService: this.conversationsService,
    };
  }

  protected getHitlHandlerDependencies(): HitlHandlers.HitlHandlerDependencies {
    return {
      httpService: this.httpService,
      conversationsService: this.conversationsService,
      deliverablesService: this.deliverablesService,
    };
  }

  /**
   * Extract userId from request (checks multiple locations).
   *
   * @param request - Task request
   * @returns userId if found, null otherwise
   */
  protected resolveUserId(request: TaskRequestDto): string | null {
    // Primary source: ExecutionContext (Phase 3.5+)
    if (request.context?.userId) {
      return request.context.userId;
    }

    // Check top-level metadata
    const metadata = request.metadata as Record<string, unknown>;
    const fromMetadata: unknown = metadata?.userId || metadata?.createdBy;
    if (fromMetadata && typeof fromMetadata === 'string') {
      return fromMetadata;
    }

    // Check payload metadata
    const payloadMetadata = request.payload?.metadata as Record<
      string,
      unknown
    >;
    const fromPayload: unknown =
      payloadMetadata?.userId || payloadMetadata?.createdBy;
    if (fromPayload && typeof fromPayload === 'string') {
      return fromPayload;
    }

    return null;
  }

  /**
   * Build metadata object from request.
   *
   * Merges metadata from multiple sources in priority order:
   * 1. Additional metadata (highest priority)
   * 2. Request metadata
   * 3. Payload metadata (lowest priority)
   *
   * @param request - Task request
   * @param additional - Additional metadata to merge
   * @returns Merged metadata object
   */
  protected buildMetadata(
    request: TaskRequestDto,
    additional?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(request.payload?.metadata ?? {}),
      ...(request.metadata ?? {}),
      ...(additional ?? {}),
    };
  }

  /**
   * Resolve conversationId from request.
   *
   * @param request - Task request
   * @returns conversationId if found, null otherwise
   */
  protected resolveConversationId(request: TaskRequestDto): string | null {
    return request.context?.conversationId || null;
  }

  /**
   * Resolve taskId from request.
   *
   * ExecutionContext is the primary source. Legacy metadata/payload fallbacks
   * remain to support callers that have not yet migrated.
   *
   * @param request - Task request
   * @returns taskId if found, null otherwise
   */
  protected resolveTaskId(request: TaskRequestDto): string | null {
    // Primary source: ExecutionContext
    if (request.context?.taskId) {
      return request.context.taskId;
    }

    // Legacy fallbacks (deprecated - callers should migrate to ExecutionContext)
    const taskId =
      request.metadata?.taskId ||
      (request.payload as Record<string, unknown>)?.taskId ||
      null;
    return typeof taskId === 'string' ? taskId : null;
  }

  /**
   * Resolve deliverableId from request payload or metadata.
   *
   * @param request - Task request
   * @returns deliverableId if supplied, null otherwise
   */
  protected resolveDeliverableIdFromRequest(
    request: TaskRequestDto,
  ): string | null {
    const payload: Record<string, unknown> = isRecord(request.payload)
      ? request.payload
      : {};
    const payloadMetadata = isRecord(payload.metadata)
      ? payload.metadata
      : undefined;
    const payloadDeliverable = isRecord(payload.deliverable)
      ? payload.deliverable
      : undefined;
    const requestMetadata = isRecord(request.metadata)
      ? request.metadata
      : undefined;

    const getString = (
      record: Record<string, unknown> | undefined,
      key: string,
    ): string | undefined => {
      if (!record) {
        return undefined;
      }
      const value = record[key];
      return typeof value === 'string' ? value : undefined;
    };

    const candidates: Array<string | undefined> = [
      getString(payload, 'deliverableId'),
      getString(payload, 'deliverable_id'),
      getString(payloadDeliverable, 'id'),
      getString(payloadMetadata, 'deliverableId'),
      getString(payloadMetadata, 'deliverable_id'),
      getString(requestMetadata, 'deliverableId'),
      getString(requestMetadata, 'deliverable_id'),
    ];

    const match = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    return match ? match.trim() : null;
  }

  /**
   * Check if request wants streaming response.
   *
   * @param request - Task request
   * @returns True if streaming is requested
   */
  protected shouldStream(request: TaskRequestDto): boolean {
    return Boolean(
      (request.payload?.options as Record<string, unknown>)?.stream ||
      (request.metadata as Record<string, unknown>)?.stream,
    );
  }

  /**
   * Handle orchestration - call sub-agents.
   *
   * This is a basic implementation that allows any agent to orchestrate
   * calls to other agents. More sophisticated orchestration (with pause/
   * resume, human checkpoints, etc.) will be implemented in future phases.
   *
   * @param subAgents - Array of sub-agent configurations to call
   * @param request - Parent request context
   * @param organizationSlug - Organization context
   * @returns Array of sub-agent responses
   *
   * @example
   * ```typescript
   * const subAgents = [
   *   { slug: 'context-agent-1', mode: AgentTaskMode.BUILD, userMessage: 'Analyze data' },
   *   { slug: 'tool-agent-1', mode: AgentTaskMode.BUILD, userMessage: 'Execute tools' }
   * ];
   * const results = await this.handleOrchestration(subAgents, request, organizationSlug);
   * ```
   */
  protected handleOrchestration(
    subAgents: Array<{
      slug: string;
      mode: AgentTaskMode;
      userMessage: string;
      payload?: Record<string, unknown>;
    }>,
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto[]> {
    const results: TaskResponseDto[] = [];

    this.logger.log(
      `Orchestrating ${subAgents.length} sub-agent(s) for conversation ${request.context?.conversationId}`,
    );

    for (const subAgent of subAgents) {
      try {
        // Build sub-agent request - pass through context unchanged
        const payloadAny: unknown = subAgent.payload;
        const _subRequest: TaskRequestDto = {
          mode: subAgent.mode,
          context: request.context, // Pass through ExecutionContext unchanged
          userMessage: subAgent.userMessage,
          payload: (payloadAny as Record<string, unknown>) || {},
          metadata: {
            ...request.metadata,
            parentRequest: true,
            orchestratedBy: request.payload?.agentSlug || 'unknown',
          },
        };

        // NOTE: In a full implementation, this would call the AgentExecutionGateway
        // or AgentModeRouterService to execute the sub-agent. For now, this is
        // a placeholder that returns a success response.
        // TODO: Implement actual sub-agent calling via dependency injection

        this.logger.log(
          `Calling sub-agent ${subAgent.slug} in ${subAgent.mode} mode`,
        );

        // Placeholder response - will be replaced with actual sub-agent call
        const response = TaskResponseDto.success(subAgent.mode, {
          content: {
            message: `Placeholder: Sub-agent ${subAgent.slug} would be called here`,
          },
          metadata: {
            subAgentSlug: subAgent.slug,
            orchestrated: true,
          },
        });

        results.push(response);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to orchestrate sub-agent ${subAgent.slug}: ${errorMessage}`,
        );

        results.push(
          TaskResponseDto.failure(
            subAgent.mode,
            `Sub-agent execution failed: ${errorMessage}`,
          ),
        );
      }
    }

    return Promise.resolve(results);
  }

  /**
   * Emit observability event for admin monitoring.
   *
   * This helper method uses StreamingService to emit agent execution events
   * directly to the observability buffer. Events are synchronous but non-blocking.
   *
   * @param eventType - Event type ('agent.started', 'agent.progress', 'agent.completed', 'agent.failed')
   * @param message - Human-readable message describing the event
   * @param executionContext - The ExecutionContext from request.context (pass it through, don't rebuild)
   * @param options - Additional event options (mode, progress)
   */
  protected emitObservabilityEvent(
    eventType: string,
    message: string,
    executionContext: ExecutionContext,
    options?: {
      mode?: string;
      progress?: number;
    },
  ): void {
    try {
      // Use StreamingService to push to observability buffer directly
      // Uses emitObservabilityOnly to avoid duplicating user-facing SSE events
      this.streamingService.emitObservabilityOnly(
        executionContext,
        eventType,
        message,
        {
          progress: options?.progress,
          mode: options?.mode,
        },
      );
    } catch (error) {
      // Silently catch errors - observability is non-critical
      this.logger.debug(
        `Error emitting observability event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
