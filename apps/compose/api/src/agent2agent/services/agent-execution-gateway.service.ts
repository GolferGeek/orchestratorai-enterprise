import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AgentTaskMode, TaskRequestDto } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { AgentModeRouterService } from './agent-mode-router.service';
import { RoutingPolicyAdapterService } from './routing-policy-adapter.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeExecutionService } from '@agent-platform/services/agent-runtime-execution.service';
import { AgentRuntimeDefinitionService } from '@agent-platform/services/agent-runtime-definition.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import {
  ObservabilityEventsService,
  ObservabilityEventRecord,
} from '../../observability/observability-events.service';

@Injectable()
export class AgentExecutionGateway {
  private readonly logger = new Logger(AgentExecutionGateway.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly runtimeDefinitions: AgentRuntimeDefinitionService,
    private readonly runtimeExecution: AgentRuntimeExecutionService,
    private readonly routingPolicy: RoutingPolicyAdapterService,
    private readonly modeRouter: AgentModeRouterService,
    private readonly observabilityEvents: ObservabilityEventsService,
  ) {}

  async execute(
    context: ExecutionContext,
    request: TaskRequestDto,
  ): Promise<TaskResponseDto> {
    const agent = await this.agentRegistry.getAgent(
      context.orgSlug,
      context.agentSlug,
    );

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Check if agent is disabled via metadata.status
    if (agent.metadata?.status === 'disabled') {
      this.logger.warn(`Agent ${context.agentSlug} is disabled`);
      return TaskResponseDto.failure(
        request.mode ?? AgentTaskMode.CONVERSE,
        'Agent is currently disabled',
      );
    }

    const definition = this.runtimeDefinitions.buildDefinition(agent);
    const agentMetadata = this.runtimeExecution.getAgentMetadataFromDefinition(
      definition,
      context.orgSlug,
    );

    // Observability: Agent execution started
    this.emitAgentLifecycleEvent(
      context,
      'agent.started',
      'Agent execution started',
      definition,
    );

    // Skip routing policy for dashboard mode (pure data operations, no LLM calls)
    const isDashboardMode = (request.mode as unknown as string) === 'dashboard';
    let routingMetadata: Record<string, unknown> = { agentMetadata };

    if (!isDashboardMode) {
      const assessment = await this.routingPolicy.evaluate(request, agent);
      routingMetadata = {
        ...(assessment.metadata ?? {}),
        agentMetadata,
      };

      if (assessment.showstopper) {
        return TaskResponseDto.human(
          assessment.humanMessage ?? 'Routing policy requires human review.',
          'routing_showstopper',
        );
      }
    }

    // Enforce execution capabilities before routing
    this.logger.debug(
      `exec capabilities: canBuild=${definition.execution.canBuild}, canPlan=${definition.execution.canPlan}, canConverse=${definition.execution.canConverse}, modeProfile=${definition.execution.modeProfile}`,
    );
    const unsupported = this.checkUnsupportedMode(definition, request.mode!);
    if (unsupported) {
      this.logger.warn(
        `Mode ${request.mode} is NOT supported by agent ${context.agentSlug}`,
      );
      this.emitAgentLifecycleEvent(
        context,
        'agent.failed',
        'Unsupported mode',
        definition,
      );
      return unsupported;
    }

    try {
      // All modes delegate to mode router with ExecutionContext
      this.logger.debug(
        `Routing to modeRouter - mode: ${request.mode}, agentType: ${definition.agentType}, agentSlug: ${context.agentSlug}`,
      );
      const response = await this.modeRouter.execute({
        context,
        definition,
        request,
        routingMetadata,
      });

      // Emit completion or failure based on response
      if (response.success) {
        this.emitAgentLifecycleEvent(
          context,
          'agent.completed',
          'Agent execution completed',
          definition,
        );
      } else {
        this.emitAgentLifecycleEvent(
          context,
          'agent.failed',
          'Agent execution failed',
          definition,
        );
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.emitAgentLifecycleEvent(
        context,
        'agent.failed',
        `Agent execution error: ${errorMessage}`,
        definition,
      );
      throw error;
    }
  }

  private checkUnsupportedMode(
    definition: AgentRuntimeDefinition,
    mode: AgentTaskMode,
  ): TaskResponseDto | null {
    const exec = definition.execution;
    switch (mode) {
      case AgentTaskMode.CONVERSE:
        return exec.canConverse
          ? null
          : TaskResponseDto.failure(mode, 'Mode not supported by agent');
      case AgentTaskMode.PLAN:
        return exec.canPlan
          ? null
          : TaskResponseDto.failure(mode, 'Mode not supported by agent');
      case AgentTaskMode.BUILD:
        return exec.canBuild
          ? null
          : TaskResponseDto.failure(mode, 'Mode not supported by agent');
      case AgentTaskMode.HITL:
        // HITL is always allowed - it's for resuming interrupted workflows
        return null;
      default:
        return null;
    }
  }

  /**
   * Emit agent lifecycle event directly to ObservabilityEventsService.
   * Fire-and-forget to avoid blocking agent execution.
   */
  private emitAgentLifecycleEvent(
    context: ExecutionContext,
    eventType: string,
    message: string,
    definition: AgentRuntimeDefinition,
  ): void {
    try {
      const event: ObservabilityEventRecord = {
        context,
        source_app: 'orchestrator-api',
        hook_event_type: eventType,
        status: eventType,
        message,
        progress: null,
        step: null,
        payload: {
          agentSlug: definition.slug,
          agentType: definition.agentType,
          organizationSlug: context.orgSlug || 'global',
          mode: context.agentType || undefined,
        },
        timestamp: Date.now(),
      };
      // Fire-and-forget — observability should never block execution
      this.observabilityEvents.push(event).catch((error) => {
        this.logger.warn(
          `Failed to emit observability event (${eventType}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    } catch (error) {
      this.logger.debug(
        `Error preparing observability event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
