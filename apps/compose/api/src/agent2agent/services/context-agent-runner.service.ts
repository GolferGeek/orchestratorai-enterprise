import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import type { BuildCreatePayload } from '@orchestrator-ai/transport-types/modes/build.types';
import type {
  DeliverableData,
  DeliverableVersionData,
} from '@orchestrator-ai/transport-types/shared/data-types';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { BaseAgentRunner } from './base-agent-runner.service';
import { validateDeliverableStructure } from './base-agent-runner/build.handlers';
import {
  buildResponseMetadata,
  callLLM,
  fetchConversationHistory,
  optimizeContext,
  buildDocumentContext,
  extractImages,
} from './base-agent-runner/shared.helpers';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import {
  ContextOptimizationService,
  ConversationMessage,
} from '../context-optimization/context-optimization.service';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { NIL_UUID } from '@orchestrator-ai/transport-types';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { PlansService } from '../plans/services/plans.service';
import { StreamingService } from './streaming.service';
import type { Plan } from '../plans/types/plan.types';
import type { PlanVersion } from '@/agent2agent/plans/types/plan.types';

type ExtendedBuildCreatePayload = BuildCreatePayload & {
  content?: unknown;
  deliverableId?: string;
  config?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  rerunContext?: {
    sourceVersion?: DeliverableVersionData | null;
    deliverable?: DeliverableData | null;
  };
  mergeContext?: {
    versionIds: string[];
    mergePrompt: string;
    sourceVersions?: DeliverableVersionData[];
    deliverable?: DeliverableData | null;
  };
};

type PlanContextSource = 'requested-version' | 'current' | 'none';

interface PlanListActionResult {
  plan: Plan;
  versions: PlanVersion[];
}

interface BuildContextResult {
  plan: Plan | null;
  planVersion: PlanVersion | null;
  planSource: PlanContextSource;
  conversationHistory: ConversationMessage[];
  optimizedHistory: ConversationMessage[];
  error?: string;
}

/**
 * Context Agent Runner
 *
 * Handles execution of context agents - agents that fetch contextual information
 * (plans, deliverables, conversation history) and use it with LLM to generate responses.
 *
 * Context agents are the most common type, replacing traditional "LLM agents".
 * They differ from pure LLM agents by fetching and optimizing context before calling the LLM.
 *
 * Data Sources:
 * - `context` column: Markdown instructions/context
 * - `config.context.sources`: Array of context sources to fetch
 * - `config.context.systemPromptTemplate`: Template for system prompt
 *
 * BUILD Mode:
 * 1. Fetch context from configured sources
 * 2. Optimize context to token budget
 * 3. Combine with markdown from context column
 * 4. Interpolate into system prompt template
 * 5. Make ONE LLM call
 * 6. Save deliverable
 *
 * @example
 * ```typescript
 * // Agent definition
 * {
 *   type: 'context',
 *   context: '# Plan Analyzer\nYou analyze project plans...',
 *   config: {
 *     context: {
 *       sources: ['plans', 'deliverables'],
 *       systemPromptTemplate: 'Analyze: {{plan.content}}',
 *       tokenBudget: 8000
 *     }
 *   },
 *   llm: {
 *     provider: 'anthropic',
 *     model: 'claude-3-5-sonnet'
 *   }
 * }
 * ```
 */
@Injectable()
export class ContextAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(ContextAgentRunnerService.name);

  constructor(
    contextOptimization: ContextOptimizationService,
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
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
   * BUILD mode - fetch context and generate deliverable with LLM
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    this.logger.debug(
      `🔍 [CONTEXT-RUNNER] executeBuild() ENTRY - agent: ${definition.slug}`,
    );
    const payload = (request.payload ??
      {}) as unknown as ExtendedBuildCreatePayload;

    try {
      const userId = this.resolveUserId(request);
      this.logger.debug(`🔍 [CONTEXT-RUNNER] userId resolved: ${userId}`);
      if (!userId) {
        this.logger.debug(
          `🔍 [CONTEXT-RUNNER] FAILURE: userId is null/undefined`,
        );
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'User identity is required for build execution',
        );
      }

      // Use ExecutionContext from request - it flows through unchanged
      const context = request.context;
      this.logger.debug(
        `🔍 [CONTEXT-RUNNER] context.conversationId: ${context?.conversationId}`,
      );
      if (!context.conversationId) {
        this.logger.debug(
          `🔍 [CONTEXT-RUNNER] FAILURE: conversationId missing`,
        );
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'Conversation context is required for build execution',
        );
      }

      // Use request.context directly - it's the full ExecutionContext from transport-types
      const executionContext: ExecutionContext = request.context;

      const requestedPlanVersionId =
        typeof payload.planVersionId === 'string' &&
        payload.planVersionId.trim().length > 0
          ? payload.planVersionId.trim()
          : null;

      // Observability: Agent started
      this.emitObservabilityEvent(
        'agent.started',
        `Starting BUILD for ${definition.name}`,
        context,
        {
          mode: request.mode,
          progress: 0,
        },
      );

      // Observability: Fetching context
      this.emitObservabilityEvent(
        'agent.progress',
        'Fetching context',
        context,
        {
          mode: request.mode,
          progress: 10,
        },
      );

      // Emit SSE progress update using ExecutionContext
      this.streamingService.emitProgress(
        context,
        'Fetching context...',
        request.userMessage || '',
        {
          step: 'Fetching context',
          progress: 10,
          status: 'running',
          sequence: 1,
          totalSteps: 5,
        },
      );

      const buildContext = await this.gatherBuildContext(
        definition,
        request,
        executionContext,
        requestedPlanVersionId,
      );

      if (buildContext.error) {
        this.logger.error(
          `[handleBuild] gatherBuildContext failed: ${buildContext.error}`,
        );
        return TaskResponseDto.failure(AgentTaskMode.BUILD, buildContext.error);
      }

      // Observability: Context fetched, optimizing
      this.emitObservabilityEvent(
        'agent.progress',
        'Optimizing context',
        context,
        {
          mode: request.mode,
          progress: 30,
        },
      );

      // Emit SSE progress update
      this.streamingService.emitProgress(
        context,
        'Optimizing context...',
        request.userMessage || '',
        {
          step: 'Optimizing context',
          progress: 30,
          status: 'running',
          sequence: 2,
          totalSteps: 5,
        },
      );

      const resolvedOrgSlug = this.resolveOrganizationSlug(
        definition,
        organizationSlug,
      );
      const conversationForPrompt =
        buildContext.optimizedHistory.length > 0
          ? buildContext.optimizedHistory
          : buildContext.conversationHistory;

      const deliverableStructure = definition.deliverableStructure ?? null;
      const outputSchema =
        (typeof definition.ioSchema === 'object' &&
          definition.ioSchema?.output) ??
        definition.ioSchema ??
        null;

      const systemPrompt = this.buildExecutionPrompt(definition, {
        plan: buildContext.plan,
        planVersion: buildContext.planVersion,
        conversationHistory: conversationForPrompt,
        deliverableStructure,
        outputSchema,
        rerunContext: payload.rerunContext ?? undefined,
        mergeContext: payload.mergeContext ?? undefined,
        documentContext: buildDocumentContext(request),
      });

      const userMessage = this.resolveUserMessage(payload, request);
      const images = extractImages(request);

      let finalContent: string | null = null;
      const providedContent = this.normalizeDeliverableContent(payload.content);
      if (providedContent.trim().length > 0) {
        finalContent = providedContent;
      }

      let llmMetadata: Record<string, unknown> | null = null;

      if (!finalContent) {
        // Observability: Calling LLM
        this.emitObservabilityEvent('agent.progress', 'Calling LLM', context, {
          mode: request.mode,
          progress: 50,
        });

        // Emit SSE progress update
        this.streamingService.emitProgress(
          context,
          'Calling LLM to generate deliverable...',
          request.userMessage || '',
          {
            step: 'Calling LLM',
            progress: 50,
            status: 'running',
            sequence: 3,
            totalSteps: 5,
          },
        );

        const llmConfig = this.buildLlmConfig(
          definition,
          payload,
          executionContext,
          userId,
          resolvedOrgSlug,
        );

        const llmResponse = await callLLM(
          this.llmService,
          llmConfig,
          systemPrompt,
          userMessage,
          context,
          conversationForPrompt,
          images,
        );

        finalContent = this.normalizeDeliverableContent(llmResponse.content);
        llmMetadata =
          (llmResponse.metadata as unknown as Record<string, unknown>) ?? null;
      }

      if (!finalContent || finalContent.trim().length === 0) {
        this.logger.error(
          `[handleBuild] Generated deliverable content was empty`,
        );
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'Generated deliverable content was empty',
        );
      }

      // Validate structure (deliverableStructure defines what LLM should output)
      try {
        validateDeliverableStructure(finalContent, deliverableStructure);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Deliverable structure validation warning: ${message}. Continuing anyway.`,
        );
      }

      // Note: outputSchema/io_schema validation removed - that's for the final API response
      // structure that the backend creates, not for validating LLM output

      // Extract the actual deliverable content for storage
      // The validation functions work with the full response, but we only want to store the unwrapped content
      const contentForStorage = this.extractDeliverableContent(
        finalContent,
        deliverableStructure,
      );

      const deliverableFormat = this.resolveDeliverableFormat(
        contentForStorage,
        payload,
        definition,
      );

      const deliverableType = this.resolveDeliverableType(payload, definition);

      const targetDeliverableId = this.resolveDeliverableId(payload, request);

      const createResult = await this.deliverablesService.executeAction(
        'create',
        {
          title: this.resolveDeliverableTitle(
            payload,
            buildContext.plan,
            definition,
            finalContent,
          ),
          content: contentForStorage,
          format: deliverableFormat,
          type: deliverableType,
          deliverableId: targetDeliverableId ?? undefined,
          agentName: definition.name ?? definition.slug,
          taskId: context.taskId,
          metadata: this.compactMetadata({
            planId: buildContext.plan?.id ?? null,
            planVersionId:
              buildContext.planVersion?.id ?? requestedPlanVersionId ?? null,
            planSource: buildContext.planSource,
            conversationMessageCount: conversationForPrompt.length,
            deliverableStructureApplied: Boolean(deliverableStructure),
            ioSchemaApplied: Boolean(outputSchema),
            rerunContext: payload.rerunContext
              ? {
                  sourceVersionId:
                    payload.rerunContext.sourceVersion?.id ?? null,
                  deliverableId: payload.rerunContext.deliverable?.id ?? null,
                  providerOverride: payload.config?.provider ?? null,
                  modelOverride: payload.config?.model ?? null,
                }
              : undefined,
            mergeContext: payload.mergeContext
              ? {
                  versionIds: payload.mergeContext.versionIds,
                  mergePrompt: payload.mergeContext.mergePrompt,
                }
              : undefined,
            llm: llmMetadata ?? undefined,
          }),
        },
        executionContext,
      );

      if (!createResult.success || !createResult.data) {
        this.logger.error(
          `[handleBuild] Failed to create deliverable: ${createResult.error?.message}`,
        );
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          createResult.error?.message ?? 'Failed to create deliverable',
        );
      }

      const usage = this.normalizeUsage(llmMetadata?.usage);
      const provider = this.resolveProvider(llmMetadata, definition, payload);
      const model = this.resolveModel(llmMetadata, definition, payload);

      const metadata = buildResponseMetadata(
        {
          provider,
          model,
          usage,
          thinking: llmMetadata?.thinking,
        },
        this.compactMetadata({
          resolvedOrgSlug,
          planId: buildContext.plan?.id ?? null,
          planVersionId:
            buildContext.planVersion?.id ?? requestedPlanVersionId ?? null,
          planSource: buildContext.planSource,
          planTitle: buildContext.plan?.title ?? null,
          conversationMessageCount: conversationForPrompt.length,
          deliverableStructureApplied: Boolean(deliverableStructure),
          ioSchemaApplied: Boolean(outputSchema),
          rerun: payload.rerunContext
            ? {
                sourceVersionId: payload.rerunContext.sourceVersion?.id ?? null,
                deliverableId: payload.rerunContext.deliverable?.id ?? null,
              }
            : undefined,
          merge: payload.mergeContext
            ? {
                versionIds: payload.mergeContext.versionIds,
              }
            : undefined,
        }),
      );

      const resultData = createResult.data as {
        deliverable: unknown;
        version: unknown;
        isNew: boolean;
      };

      // Emit final progress update
      this.streamingService.emitProgress(
        context,
        'Deliverable created successfully',
        request.userMessage || '',
        {
          step: 'Complete',
          progress: 100,
          status: 'completed',
          sequence: 5,
          totalSteps: 5,
        },
      );

      this.logger.log(
        `[handleBuild] ✅ SUCCESS - returning deliverable: ${JSON.stringify(resultData.deliverable)?.substring(0, 200)}`,
      );

      // Observability: Agent completed
      this.emitObservabilityEvent(
        'agent.completed',
        `BUILD completed for ${definition.name}`,
        context,
        {
          mode: request.mode,
          progress: 100,
        },
      );

      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: {
          deliverable: resultData.deliverable,
          version: resultData.version,
          isNew: resultData.isNew,
        },
        metadata,
      });
    } catch (error) {
      this.logger.error(
        `Context agent ${definition.slug} BUILD failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async gatherBuildContext(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    executionContext: ExecutionContext,
    requestedPlanVersionId: string | null,
  ): Promise<BuildContextResult> {
    const conversationHistory = await fetchConversationHistory(
      this.conversationsService,
      request,
    );
    const optimizedHistory = await optimizeContext(
      this.contextOptimization,
      conversationHistory,
      definition,
    );

    let plan: Plan | null = null;
    if (executionContext.conversationId) {
      plan = await this.plansService.findByConversationId(executionContext);
    }

    let planVersion: PlanVersion | null =
      (plan?.currentVersion as PlanVersion | undefined) ?? null;
    let planSource: PlanContextSource = planVersion ? 'current' : 'none';

    if (requestedPlanVersionId) {
      const listResult =
        await this.plansService.executeAction<PlanListActionResult>(
          'list',
          { includeArchived: true },
          executionContext,
        );

      if (!listResult.success) {
        if (listResult.error?.code === 'NOT_FOUND') {
          return {
            plan,
            planVersion: null,
            planSource: 'none',
            conversationHistory,
            optimizedHistory,
            error: `Plan version ${requestedPlanVersionId} not found`,
          };
        }

        throw new Error(
          listResult.error?.message ?? 'Unable to fetch plan versions',
        );
      }

      const versions = listResult.data?.versions ?? [];
      const targetVersion = versions.find(
        (version) => version.id === requestedPlanVersionId,
      );

      if (!targetVersion) {
        return {
          plan: listResult.data?.plan ?? plan,
          planVersion: null,
          planSource: 'none',
          conversationHistory,
          optimizedHistory,
          error: `Plan version ${requestedPlanVersionId} not found`,
        };
      }

      planVersion = targetVersion;
      planSource = 'requested-version';
      plan = plan ?? listResult.data?.plan ?? null;
    }

    // INTENTIONAL MUTATION: Set planId when first created (from NIL_UUID)
    // This is the ONLY intentional mutation of ExecutionContext allowed in the system.
    // When a plan is first created, the context starts with NIL_UUID as planId.
    // Once the plan is persisted, we update the context to reflect the real planId.
    // This ensures downstream operations have access to the correct planId.
    // GUARD: Only mutate when transitioning from NIL_UUID (plan creation)
    if (plan?.id && request.context.planId === NIL_UUID) {
      request.context.planId = plan.id;
    }

    return {
      plan,
      planVersion,
      planSource,
      conversationHistory,
      optimizedHistory,
    };
  }

  private buildExecutionPrompt(
    definition: AgentRuntimeDefinition,
    options: {
      plan: Plan | null;
      planVersion: PlanVersion | null;
      conversationHistory: ConversationMessage[];
      deliverableStructure?: unknown;
      outputSchema?: unknown;
      rerunContext?: ExtendedBuildCreatePayload['rerunContext'];
      mergeContext?: ExtendedBuildCreatePayload['mergeContext'];
      documentContext?: string;
    },
  ): string {
    const basePromptCandidates = [
      definition.prompts?.build,
      definition.prompts?.system,
      definition.llm?.systemPrompt,
      definition.context?.systemPrompt,
    ];

    const basePrompt =
      basePromptCandidates.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0,
      ) ??
      `You are ${
        definition.name ?? definition.slug
      }, an expert builder responsible for producing high-quality deliverables from plans and conversations.`;

    const sections: string[] = [basePrompt.trim()];

    if (options.planVersion?.content) {
      const planHeader = options.plan?.title
        ? `${options.plan.title} (Plan Version ${
            options.planVersion.versionNumber ?? ''
          })`
        : `Plan Version ${options.planVersion.versionNumber ?? ''}`;
      sections.push(
        `${planHeader}:\n${this.stringifyForPrompt(options.planVersion.content)}`,
      );
    }

    if (options.conversationHistory.length > 0) {
      const recentMessages = options.conversationHistory
        .slice(-10)
        .map((message) =>
          `${message.role.toUpperCase()}: ${message.content}`.trim(),
        )
        .join('\n');
      sections.push(`Recent Conversation:\n${recentMessages}`);
    }

    if (options.rerunContext?.sourceVersion?.content) {
      sections.push(
        `Previous Deliverable Version:\n${this.stringifyForPrompt(
          options.rerunContext.sourceVersion.content,
        )}`,
      );
    }

    if (
      options.mergeContext?.sourceVersions &&
      options.mergeContext.sourceVersions.length > 0
    ) {
      const mergeSummary = options.mergeContext.sourceVersions
        .map(
          (version, index) =>
            `Source ${index + 1} (${version.id}):\n${this.stringifyForPrompt(version.content)}`,
        )
        .join('\n\n');
      sections.push(
        `Merge Source Versions (IDs: ${options.mergeContext.versionIds.join(', ')}):\n${mergeSummary}`,
      );
    }

    if (options.deliverableStructure) {
      sections.push(
        `Deliverable Structure Requirements:\n${this.stringifyForPrompt(options.deliverableStructure)}`,
      );
    }

    if (options.documentContext && options.documentContext.length > 0) {
      sections.push(options.documentContext);
    }

    // Note: outputSchema is for backend validation/wrapping, not LLM instruction
    // The LLM should only know about deliverableStructure (the actual content format)

    let instruction =
      'Generate a complete, polished deliverable that satisfies the user request.';

    if (options.deliverableStructure) {
      instruction +=
        ' Return your response in the format specified by the Deliverable Structure Requirements. Return ONLY the content itself, not wrapped in any additional JSON structure.';
    } else {
      instruction +=
        ' Return your response as markdown content. Do not wrap it in JSON or add any wrapper structure - just return the content itself.';
    }

    if (options.mergeContext?.mergePrompt) {
      instruction += ` Merge guidance: ${options.mergeContext.mergePrompt.trim()}.`;
    }

    sections.push(instruction);

    return sections.join('\n\n---\n\n');
  }

  private resolveOrganizationSlug(
    definition: AgentRuntimeDefinition,
    organizationSlug: string | null,
  ): string {
    const orgSlugs = definition.organizationSlug;
    const firstOrgSlug =
      Array.isArray(orgSlugs) && orgSlugs.length > 0 ? orgSlugs[0] : null;
    return (
      organizationSlug ??
      firstOrgSlug ??
      (definition.context?.organizationSlug as string | undefined) ??
      'global'
    );
  }

  private resolveUserMessage(
    payload: ExtendedBuildCreatePayload,
    request: TaskRequestDto,
  ): string {
    if (
      payload.mergeContext?.mergePrompt &&
      payload.mergeContext.mergePrompt.trim().length > 0
    ) {
      return payload.mergeContext.mergePrompt.trim();
    }

    if (
      typeof request.userMessage === 'string' &&
      request.userMessage.trim().length > 0
    ) {
      return request.userMessage.trim();
    }

    return 'Generate the requested deliverable using the provided context.';
  }

  /**
   * Build LLM configuration from the full ExecutionContext.
   *
   * ExecutionContext is passed whole — never cherry-picked. Individual fields
   * (conversationId, taskId, provider, model) are read from context here only
   * to satisfy the LLM config shape. The context itself is not modified.
   */
  private buildLlmConfig(
    definition: AgentRuntimeDefinition,
    payload: ExtendedBuildCreatePayload,
    context: ExecutionContext,
    userId: string,
    orgSlug: string,
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {
      conversationId: context.conversationId,
      sessionId: context.taskId, // Use taskId for session correlation
      userId,
      organizationSlug: orgSlug,
      agentSlug: definition.slug,
      callerType: 'agent',
      callerName: `${definition.slug}-build-create`,
      stream: false,
    };

    // Extract provider and model from payload config, falling back to ExecutionContext
    const payloadAny = payload as unknown as {
      config?: {
        provider?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };
      llmOverride?: {
        provider?: string;
        model?: string;
      };
      temperature?: number; // Legacy top-level fallback
      maxTokens?: number; // Legacy top-level fallback
    };

    // Priority: llmOverride (rerun) > payload.config > ExecutionContext (default)
    const providerName =
      payloadAny.llmOverride?.provider ||
      payload.config?.provider ||
      context.provider;
    const modelName =
      payloadAny.llmOverride?.model || payload.config?.model || context.model;

    if (
      providerName &&
      typeof providerName === 'string' &&
      providerName.trim().length > 0
    ) {
      config.providerName = providerName.trim();
    }

    if (
      modelName &&
      typeof modelName === 'string' &&
      modelName.trim().length > 0
    ) {
      config.modelName = modelName.trim();
    }

    // Check config first, then fall back to legacy top-level
    if (typeof payload.config?.temperature === 'number') {
      config.temperature = payload.config.temperature;
    } else if (typeof payloadAny.temperature === 'number') {
      config.temperature = payloadAny.temperature;
    }

    if (typeof payload.config?.maxTokens === 'number') {
      config.maxTokens = payload.config.maxTokens;
    } else if (typeof payloadAny.maxTokens === 'number') {
      config.maxTokens = payloadAny.maxTokens;
    }

    return config;
  }

  private normalizeDeliverableContent(content: unknown): string {
    if (content === null || content === undefined) {
      return '';
    }

    if (typeof content === 'string') {
      return content;
    }

    if (typeof content === 'object') {
      try {
        return JSON.stringify(content, null, 2);
      } catch {
        return '[unserializable content]';
      }
    }

    if (
      typeof content === 'number' ||
      typeof content === 'boolean' ||
      typeof content === 'bigint'
    ) {
      return content.toString();
    }
    if (typeof content === 'symbol') {
      return content.toString();
    }
    if (typeof content === 'function') {
      return '[function]';
    }
    // Fallback
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }

  /**
   * Extract the actual deliverable content from the LLM response for storage.
   * The LLM returns data wrapped in io_schema format: {status, blog_post: {title, content, ...}}
   * But we only want to store the actual content (markdown) in the version.
   */
  private extractDeliverableContent(
    rawContent: string,
    _deliverableStructure: unknown,
  ): string {
    // Try to parse as JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // If not JSON, return as-is (might be plain markdown)
      return rawContent;
    }

    // If it's not an object, return as-is
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return rawContent;
    }

    const parsedObj = parsed as Record<string, unknown>;

    // Look for common wrapper keys that contain the actual deliverable
    const wrapperKeys = [
      'blog_post',
      'deliverable',
      'data',
      'output',
      'result',
    ];

    for (const key of wrapperKeys) {
      if (
        key in parsedObj &&
        parsedObj[key] &&
        typeof parsedObj[key] === 'object'
      ) {
        const deliverableData = parsedObj[key] as Record<string, unknown>;

        // If the deliverable has a 'content' field, extract just that (the markdown)
        if (
          'content' in deliverableData &&
          typeof deliverableData.content === 'string'
        ) {
          return deliverableData.content;
        }

        // Otherwise, stringify the entire deliverable object
        return JSON.stringify(deliverableData, null, 2);
      }
    }

    // If no wrapper found, check if this object itself has a content field
    if ('content' in parsedObj && typeof parsedObj.content === 'string') {
      return parsedObj.content;
    }

    // Fallback: return the original content
    return rawContent;
  }

  private resolveDeliverableFormat(
    content: string,
    payload: ExtendedBuildCreatePayload,
    definition: AgentRuntimeDefinition,
  ): string {
    const mergeFormat =
      payload.mergeContext?.sourceVersions &&
      payload.mergeContext.sourceVersions.length > 0
        ? payload.mergeContext.sourceVersions[0]?.format
        : null;

    const rerunFormat = payload.rerunContext?.sourceVersion?.format;
    const configuredFormat = definition.config?.deliverable?.format;

    const candidates = [rerunFormat, mergeFormat, configuredFormat];

    const selected = candidates.find(
      (format) => typeof format === 'string' && format.trim().length > 0,
    );

    if (typeof selected === 'string') {
      return selected.trim();
    }

    return this.isJsonString(content) ? 'json' : 'markdown';
  }

  private resolveDeliverableType(
    payload: ExtendedBuildCreatePayload,
    definition: AgentRuntimeDefinition,
  ): string {
    if (payload.type && payload.type.trim().length > 0) {
      return payload.type.trim();
    }

    const rerunType = payload.rerunContext?.deliverable?.type;
    if (rerunType && rerunType.trim().length > 0) {
      return rerunType;
    }

    const configuredType = definition.config?.deliverable?.type;
    if (configuredType && configuredType.trim().length > 0) {
      return configuredType;
    }

    return 'document';
  }

  private resolveDeliverableTitle(
    payload: ExtendedBuildCreatePayload,
    plan: Plan | null,
    definition: AgentRuntimeDefinition,
    rawContent?: string,
  ): string {
    if (payload.title && payload.title.trim().length > 0) {
      return payload.title.trim();
    }

    const rerunTitle = payload.rerunContext?.deliverable?.title;
    if (rerunTitle && rerunTitle.trim().length > 0) {
      return rerunTitle.trim();
    }

    // Try to extract title from LLM response
    if (rawContent) {
      const extractedTitle = this.extractDeliverableTitle(rawContent);
      if (extractedTitle) {
        return extractedTitle;
      }
    }

    if (plan?.title && plan.title.trim().length > 0) {
      return plan.title.trim();
    }

    return `${definition.name ?? definition.slug} Deliverable`;
  }

  /**
   * Extract title from LLM response.
   * Looks for title in the deliverable structure: {blog_post: {title: "..."}}
   */
  private extractDeliverableTitle(rawContent: string): string | null {
    try {
      const parsed = JSON.parse(rawContent) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const parsedObj = parsed as Record<string, unknown>;

      // Look for common wrapper keys
      const wrapperKeys = [
        'blog_post',
        'deliverable',
        'data',
        'output',
        'result',
      ];

      for (const key of wrapperKeys) {
        if (
          key in parsedObj &&
          parsedObj[key] &&
          typeof parsedObj[key] === 'object'
        ) {
          const deliverableData = parsedObj[key] as Record<string, unknown>;
          if (
            'title' in deliverableData &&
            typeof deliverableData.title === 'string' &&
            deliverableData.title.trim().length > 0
          ) {
            return deliverableData.title.trim();
          }
        }
      }

      // Check top-level title
      if (
        'title' in parsedObj &&
        typeof parsedObj.title === 'string' &&
        parsedObj.title.trim().length > 0
      ) {
        return parsedObj.title.trim();
      }

      return null;
    } catch {
      return null;
    }
  }

  private resolveDeliverableId(
    payload: ExtendedBuildCreatePayload,
    request: TaskRequestDto,
  ): string | null {
    const baseId = this.resolveDeliverableIdFromRequest(request);

    const candidates: Array<unknown> = [
      payload.deliverableId,
      payload.rerunContext?.deliverable?.id,
      payload.mergeContext?.deliverable?.id,
      baseId,
    ];

    const match = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    return match ? match.trim() : null;
  }

  private resolveProvider(
    metadata: Record<string, unknown> | null,
    definition: AgentRuntimeDefinition,
    payload: ExtendedBuildCreatePayload,
  ): string {
    const fromMetadata = metadata?.provider;
    if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
      return fromMetadata;
    }

    if (payload.config?.provider && payload.config.provider.trim().length > 0) {
      return payload.config.provider.trim();
    }

    const fromDefinition = definition.llm?.provider;
    if (
      typeof fromDefinition === 'string' &&
      fromDefinition.trim().length > 0
    ) {
      return fromDefinition;
    }

    return '';
  }

  private resolveModel(
    metadata: Record<string, unknown> | null,
    definition: AgentRuntimeDefinition,
    payload: ExtendedBuildCreatePayload,
  ): string {
    const fromMetadata = metadata?.model;
    if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
      return fromMetadata;
    }

    if (payload.config?.model && payload.config.model.trim().length > 0) {
      return payload.config.model.trim();
    }

    const fromDefinition = definition.llm?.model;
    if (
      typeof fromDefinition === 'string' &&
      fromDefinition.trim().length > 0
    ) {
      return fromDefinition;
    }

    return '';
  }

  private normalizeUsage(raw: unknown): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  } {
    if (!raw || typeof raw !== 'object') {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
    }

    const value = raw as Record<string, unknown>;

    const inputTokens = this.numberOrZero(
      value.inputTokens ?? value.promptTokens ?? value.total_input_tokens,
    );
    const outputTokens = this.numberOrZero(
      value.outputTokens ?? value.completionTokens ?? value.total_output_tokens,
    );
    const totalTokens = this.numberOrZero(
      value.totalTokens ?? value.total_tokens,
      inputTokens + outputTokens,
    );
    const cost = this.numberOrZero(value.cost ?? value.price);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
    };
  }

  private isJsonString(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return false;
    }

    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  private compactMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.entries(metadata).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      },
      {},
    );
  }

  private stringifyForPrompt(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private numberOrZero(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }
}
