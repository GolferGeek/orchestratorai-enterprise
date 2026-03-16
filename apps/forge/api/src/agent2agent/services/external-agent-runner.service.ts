import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseAgentRunner } from './base-agent-runner.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';

/**
 * External Agent Runner
 *
 * Executes agents that call external A2A-compatible agents. External agents:
 * - Call other agent systems via HTTP using A2A protocol
 * - Forward task requests to external endpoints
 * - Handle external agent responses
 * - Support authentication and routing
 * - Store external agent results as deliverables
 *
 * External agents are configured with:
 * - config.external.url: External agent endpoint URL
 * - config.external.apiKey: Authentication API key
 * - config.external.headers: Additional request headers
 * - config.external.timeout: Request timeout
 * - config.deliverable: Output format configuration
 *
 * @example
 * Agent configuration:
 * {
 *   type: 'external',
 *   config: {
 *     external: {
 *       url: 'https://external-agent.example.com/task',
 *       apiKey: 'secret-key',
 *       timeout: 60000
 *     },
 *     deliverable: {
 *       format: 'json',
 *       type: 'external-response'
 *     }
 *   }
 * }
 */
@Injectable()
export class ExternalAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(ExternalAgentRunnerService.name);

  constructor(
    protected readonly httpService: HttpService,
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
    contextOptimization: ContextOptimizationService,
    plansService: PlansService,
    conversationsService: Agent2AgentConversationsService,
    deliverablesService: DeliverablesService,
    streamingService: StreamingService,
  ) {
    super(
      llmService,
      contextOptimization,
      plansService,
      conversationsService,
      deliverablesService,
      streamingService,
    );
  }

  /**
   * CONVERSE mode - forward to external agent
   */
  protected async handleConverse(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return await this.forwardToExternalAgent(
      definition,
      request,
      organizationSlug,
      AgentTaskMode.CONVERSE,
    );
  }

  /**
   * PLAN mode - forward to external agent
   */
  protected async handlePlan(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return await this.forwardToExternalAgent(
      definition,
      request,
      organizationSlug,
      AgentTaskMode.PLAN,
    );
  }

  /**
   * BUILD mode - forward to external agent
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    return await this.forwardToExternalAgent(
      definition,
      request,
      organizationSlug,
      AgentTaskMode.BUILD,
    );
  }

  /**
   * Forward task request to external agent
   */
  private async forwardToExternalAgent(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
    mode: AgentTaskMode,
  ): Promise<TaskResponseDto> {
    try {
      // Validate required context
      const userId = this.resolveUserId(request);
      const conversationId = this.resolveConversationId(request);
      const payload = request.payload as Record<string, unknown>;
      const taskId = (payload?.taskId as string) || null;

      if (!userId || !conversationId) {
        return TaskResponseDto.failure(
          mode,
          'Missing required userId or conversationId for external agent call',
        );
      }

      // Get external agent configuration
      const externalConfig = this.asRecord(definition.config?.external);
      if (!externalConfig) {
        return TaskResponseDto.failure(
          mode,
          'No external agent configuration found or URL missing',
        );
      }

      const endpoint =
        this.ensureString(externalConfig.url) ??
        this.ensureString(externalConfig.endpoint);
      if (!endpoint) {
        return TaskResponseDto.failure(
          mode,
          'External agent configuration missing URL string',
        );
      }

      this.logger.log(
        `Forwarding ${mode} request to external agent at ${endpoint}`,
      );

      // 1. Build A2A request - forward context unchanged

      const a2aRequest: TaskRequestDto = {
        context: request.context, // Pass through ExecutionContext
        mode,
        userMessage: request.userMessage,
        payload: request.payload,
        metadata: {
          ...request.metadata,
          forwardedFrom: definition.slug,
          organizationSlug,
        },
      };

      // 2. Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Orchestrator-AI-A2A/1.0',
      };

      // Add API key if configured
      const apiKey = this.ensureString(externalConfig.apiKey);
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      // Add custom headers
      const headerOverrides = this.asRecord(externalConfig.headers);
      if (headerOverrides) {
        for (const [key, value] of Object.entries(
          this.toPlainRecord(headerOverrides),
        )) {
          if (value === undefined || value === null) {
            continue;
          }
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (typeof value === 'object') {
            try {
              headers[key] = JSON.stringify(value);
            } catch {
              headers[key] = '[object]';
            }
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            headers[key] = String(value);
          } else {
            headers[key] = '[unknown]';
          }
        }
      }

      // 3. Execute HTTP request
      // Observability: Forwarding request to external agent
      this.emitObservabilityEvent(
        'agent.progress',
        'Forwarding request to external agent',
        request.context,
        { mode: request.mode, progress: 20 },
      );

      const startTime = Date.now();
      let response: { status: number; data: unknown };

      try {
        // Observability: Waiting for external agent response
        this.emitObservabilityEvent(
          'agent.progress',
          'Waiting for external agent response',
          request.context,
          { mode: request.mode, progress: 40 },
        );

        const observable = this.httpService.request({
          url: endpoint,
          method: 'POST',
          headers,
          data: a2aRequest,
          timeout: this.ensureNumber(externalConfig.timeout) ?? 60_000,
          validateStatus: () => true, // Don't throw on non-2xx status
        });

        response = await firstValueFrom(observable);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`External agent call failed: ${errorMessage}`);

        return TaskResponseDto.failure(
          mode,
          `External agent call failed: ${errorMessage}`,
        );
      }

      const duration = Date.now() - startTime;

      // Observability: Processing external agent response
      this.emitObservabilityEvent(
        'agent.progress',
        'Processing external agent response',
        request.context,
        { mode: request.mode, progress: 70 },
      );

      // 4. Check response status
      const statusCodeRaw: unknown = response.status;
      const statusCode = statusCodeRaw;
      if (statusCode !== 200) {
        return TaskResponseDto.failure(
          mode,
          `External agent returned error status ${String(statusCode)}: ${JSON.stringify(response.data)}`,
        );
      }

      // 5. Parse A2A response
      const responseData: unknown = response.data;
      const a2aResponse = responseData as TaskResponseDto;

      if (!a2aResponse || typeof a2aResponse.success !== 'boolean') {
        return TaskResponseDto.failure(
          mode,
          'Invalid A2A response format from external agent',
        );
      }

      // 6. If BUILD mode and successful, save deliverable
      if (mode === AgentTaskMode.BUILD && a2aResponse.success) {
        const targetDeliverableId =
          this.resolveDeliverableIdFromRequest(request);

        const payload = request.payload;
        const titleRaw: unknown = payload?.title;
        const deliverableResult = await this.deliverablesService.executeAction(
          'create',
          {
            title:
              (typeof titleRaw === 'string' ? titleRaw : undefined) ||
              `External Agent Response: ${definition.name}`,
            content: JSON.stringify(a2aResponse.payload?.content, null, 2),
            format: definition.config?.deliverable?.format || 'json',
            type: definition.config?.deliverable?.type || 'external-response',
            deliverableId: targetDeliverableId ?? undefined,
            agentName: definition.slug,
            organizationSlug: organizationSlug || 'default',
            taskId: taskId ?? undefined,
            metadata: {
              externalUrl: endpoint,
              duration,
              externalAgentSuccess: a2aResponse.success,
              externalMetadata: a2aResponse.payload?.metadata,
            },
          },
          // Use request.context directly - full ExecutionContext from transport-types
          request.context,
        );

        if (!deliverableResult.success) {
          return TaskResponseDto.failure(
            mode,
            deliverableResult.error?.message || 'Failed to create deliverable',
          );
        }

        return TaskResponseDto.success(mode, {
          content: deliverableResult.data,
          metadata: this.buildMetadata(request, {
            externalUrl: endpoint,
            duration,
            externalAgentSuccess: a2aResponse.success,
            externalMetadata: a2aResponse.payload?.metadata,
          }),
        });
      }

      // 7. For CONVERSE/PLAN or failed BUILD, return external response directly
      return a2aResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `External agent ${definition.slug} ${mode} failed: ${errorMessage}`,
      );

      return TaskResponseDto.failure(
        mode,
        `Failed to execute external agent: ${errorMessage}`,
      );
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toPlainRecord(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(Object.entries(record));
  }

  private ensureString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private ensureNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }
}
