import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseAgentRunner } from './base-agent-runner.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { DeliverableVersionsService } from '../deliverables/deliverable-versions.service';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { TasksService } from '../tasks/tasks.service';
import { AgentConversationsService } from '../conversations/agent-conversations.service';
import { ConfigService } from '@nestjs/config';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type QueryResult,
} from '../../database';
import * as HitlHandlers from './base-agent-runner/hitl.handlers';
import {
  NIL_UUID,
  type ExecutionContext,
  type HitlDecision,
  type HitlGeneratedContent,
  type HitlDeliverableResponse,
  type HitlStatusResponse,
  type HitlHistoryResponse,
  type HitlPendingListResponse,
  type HitlPendingItem,
} from '@orchestrator-ai/transport-types';
import {
  DeliverableVersionCreationType,
  DeliverableFormat,
  DeliverableType,
} from '../deliverables/dto';

// ApiCallResult interface removed - inline object typing used instead

/**
 * Safe string conversion - throws if value would stringify to [object Object]
 * This helps catch cases where we're accidentally stringifying objects
 */
function safeToString(value: unknown, context: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    // Instead of returning [object Object], throw an error so we know to fix it
    throw new Error(
      `[safeToString] Attempted to stringify object in ${context}. ` +
        `Use JSON.stringify() for objects. Keys: ${Object.keys(value).join(', ')}`,
    );
  }
  // For symbols, functions, etc - use extractString instead
  return extractString(value);
}

// Export for potential use in tests
export { safeToString };

/**
 * Extract string from unknown value, falling back to JSON for objects
 * Use this when you expect a string but want to handle objects gracefully
 */
function extractString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  // For symbols, functions, bigint - serialize to JSON which handles these
  return JSON.stringify(value);
}

/**
 * Extract message content from a response object by checking common string fields
 * Falls back to JSON stringification if no string fields found
 */
function extractMessageFromObject(
  obj: Record<string, unknown>,
  fallbackData: unknown,
): string {
  // Check common string fields in order of preference
  if (typeof obj.summary === 'string') return obj.summary;
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.content === 'string') return obj.content;
  // Fall back to JSON serialization
  return JSON.stringify(fallbackData, null, 2);
}

/**
 * Extract message from potentially nested response data
 * Handles { data: { summary/message/content } } pattern
 */
function extractMessageFromResponse(responseData: unknown): string {
  if (!responseData || typeof responseData !== 'object') {
    return extractString(responseData) || 'No response content';
  }

  const dataObj = responseData as Record<string, unknown>;

  // Check for nested data object first
  if (dataObj.data && typeof dataObj.data === 'object') {
    const nestedData = dataObj.data as Record<string, unknown>;
    return extractMessageFromObject(nestedData, responseData);
  }

  // Otherwise check the top-level object
  return extractMessageFromObject(dataObj, responseData);
}

/**
 * API Agent Runner
 *
 * Executes agents that make HTTP API calls. API agents:
 * - Make HTTP requests (GET, POST, PUT, DELETE, PATCH)
 * - Support request headers, body, query params
 * - Handle authentication (API keys, Bearer tokens, Basic auth)
 * - Transform responses before saving
 * - Store API results as deliverables
 *
 * API agents are configured with:
 * - config.api.url: API endpoint URL
 * - config.api.method: HTTP method
 * - config.api.headers: Request headers
 * - config.api.body: Request body (for POST/PUT/PATCH)
 * - config.api.auth: Authentication configuration
 * - config.deliverable: Output format configuration
 *
 * @example
 * Agent configuration:
 * {
 *   type: 'api',
 *   config: {
 *     api: {
 *       url: 'https://api.example.com/users',
 *       method: 'GET',
 *       headers: {
 *         'Authorization': 'Bearer {{metadata.token}}'
 *       }
 *     },
 *     deliverable: {
 *       format: 'json',
 *       type: 'api-response'
 *     }
 *   }
 * }
 */
@Injectable()
export class ApiAgentRunnerService extends BaseAgentRunner {
  protected readonly logger = new Logger(ApiAgentRunnerService.name);

  constructor(
    httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(LLM_SERVICE) llmService: LLMServiceProvider,
    contextOptimization: ContextOptimizationService,
    plansService: PlansService,
    conversationsService: Agent2AgentConversationsService,
    @Inject(forwardRef(() => DeliverablesService))
    deliverablesService: DeliverablesService,
    streamingService: StreamingService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => DeliverableVersionsService))
    private readonly versionsService: DeliverableVersionsService,
    private readonly agentConversationsService: AgentConversationsService,
    private readonly configService: ConfigService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
  ) {
    super(
      llmService,
      contextOptimization,
      plansService,
      conversationsService,
      deliverablesService,
      streamingService,
      httpService, // Pass httpService to base class as last parameter
    );
  }

  /**
   * CONVERSE mode - can forward to API endpoint if configured
   *
   * By default, API agents use the base class LLM-based conversation.
   * However, if the agent has metadata.forwardConverse = true,
   * we forward CONVERSE requests to the API endpoint instead.
   */
  protected async handleConverse(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    this.logger.log(
      `🔍 [API-AGENT-RUNNER] handleConverse called for agent: ${definition.slug}`,
    );

    // Check if this agent should forward CONVERSE to the API endpoint
    // The flag is in the raw database metadata (definition.record.metadata)
    const rawMetadata = definition.record?.metadata as Record<string, unknown>;
    const forwardConverse = rawMetadata?.forwardConverse === true;

    this.logger.log(
      `🔍 [API-AGENT-RUNNER] Raw metadata keys: ${Object.keys(rawMetadata || {}).join(', ')}`,
    );
    this.logger.log(
      `🔍 [API-AGENT-RUNNER] forwardConverse flag: ${forwardConverse}, rawMetadata.forwardConverse: ${String(rawMetadata?.forwardConverse)}`,
    );

    if (forwardConverse) {
      this.logger.log(
        `📤 Forwarding CONVERSE request to API endpoint for agent: ${definition.slug}`,
      );
      return await this.executeBuild(definition, request, organizationSlug);
    }

    // Default: use base class LLM-based conversation
    this.logger.log(
      `🔍 [API-AGENT-RUNNER] Using default LLM-based conversation for agent: ${definition.slug}`,
    );
    return await super.handleConverse(definition, request, organizationSlug);
  }

  // PLAN mode - uses base class implementation from BaseAgentRunner
  // This delegates to PlanHandlers which:
  // - Maintains plan state through conversation
  // - Iterates on plans via LLM calls
  // API agents don't need to call their external endpoint for planning

  /**
   * Override handleBuild to skip base class streaming logic
   * API agents have their own SSE handling in executeBuild
   */
  protected async handleBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = (request.payload ?? {}) as { action?: string };
    const action =
      typeof payload.action === 'string' ? payload.action : 'create';

    // For create action, go directly to executeBuild (which has SSE logic)
    if (action === 'create') {
      return await this.executeBuild(definition, request, organizationSlug);
    }

    // For other actions, use base class logic
    return await super.handleBuild(definition, request, organizationSlug);
  }

  // ============================================================================
  // HITL Method Handlers (Session 2)
  // ============================================================================

  /**
   * Handle HITL methods routed from the mode router
   * This is called when the request has hitlMethod in payload
   */
  async handleHitlMethod(
    definition: AgentRuntimeDefinition | null,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = request.payload;
    const hitlMethod = payload?.hitlMethod as string | undefined;

    this.logger.log(`Handling HITL method: ${hitlMethod}`);

    switch (hitlMethod) {
      case 'hitl.resume':
        if (!definition) {
          return TaskResponseDto.failure(
            AgentTaskMode.HITL,
            'Agent definition required for hitl.resume',
          );
        }
        return this.handleHitlResumeMethod(
          definition,
          request,
          organizationSlug,
        );

      case 'hitl.status':
        return this.executeHitlStatus(request, organizationSlug);

      case 'hitl.history':
        return this.executeHitlHistory(request, organizationSlug);

      case 'hitl.pending':
        return this.handleHitlPending(request, organizationSlug);

      default:
        return TaskResponseDto.failure(
          AgentTaskMode.HITL,
          `Unknown HITL method: ${hitlMethod}`,
        );
    }
  }

  /**
   * Handle hitl.resume - resume a paused workflow with user decision
   */
  private async handleHitlResumeMethod(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = request.payload as Record<string, unknown>;
    const taskId = payload.taskId as string;
    const decision = payload.decision as HitlDecision;
    const feedback = payload.feedback as string | undefined;
    const content = payload.content as HitlGeneratedContent | undefined;

    this.logger.log(`HITL resume: taskId=${taskId}, decision=${decision}`);

    // Validate the request
    if (!taskId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'HITL resume requires taskId',
      );
    }

    // Validate decision-specific requirements
    if (decision === 'regenerate' && !feedback?.trim()) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'Feedback is required for regenerate decision',
      );
    }

    if (decision === 'replace' && !content) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'Content is required for replace decision',
      );
    }

    const userId = this.resolveUserId(request);
    if (!userId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'userId is required for HITL resume',
      );
    }

    // Handle REPLACE decision - create version before resuming
    if (decision === 'replace' && content) {
      const deliverable = await this.deliverablesService.findByTaskId(
        taskId,
        userId,
      );

      if (deliverable) {
        // Build ExecutionContext for version creation
        const context: ExecutionContext = {
          ...request.context,
          deliverableId: deliverable.id,
        };

        await this.versionsService.createVersion(
          {
            content: this.contentToString(content),
            createdByType: DeliverableVersionCreationType.MANUAL_EDIT,
            metadata: {
              hitlDecision: 'replace',
              replacedAt: new Date().toISOString(),
            },
          },
          context,
        );
      }
    }

    // Clear HITL pending flag before resuming
    await this.tasksService.updateHitlPending(taskId, false);

    // Use existing handleHitlResume for the actual resume
    return this.handleHitlResume(definition, request, organizationSlug);
  }

  /**
   * Execute hitl.status - get HITL status for a task
   * Named differently from base class handleHitlStatus to avoid override
   */
  private async executeHitlStatus(
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = request.payload as Record<string, unknown>;
    const taskId = payload.taskId as string;

    if (!taskId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'taskId is required for hitl.status',
      );
    }

    const userId = this.resolveUserId(request);
    if (!userId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'userId is required for hitl.status',
      );
    }

    // Get task to check hitl_pending (NOT conversation)
    const task = await this.tasksService.findOne(taskId);
    if (!task) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        `Task not found: ${taskId}`,
      );
    }

    // Find deliverable via task_id (NOT conversation)
    const deliverable = await this.deliverablesService.findByTaskId(
      taskId,
      userId,
    );

    let currentVersionNumber: number | undefined;
    if (deliverable) {
      // Build ExecutionContext for version retrieval
      const context: ExecutionContext = {
        ...request.context,
        deliverableId: deliverable.id,
      };

      const currentVersion =
        await this.versionsService.getCurrentVersion(context);
      currentVersionNumber = currentVersion?.versionNumber;
    }

    const statusResponse: HitlStatusResponse = {
      taskId,
      status: task.hitl_pending ? 'hitl_waiting' : 'completed',
      hitlPending: task.hitl_pending || false,
      deliverableId: deliverable?.id,
      currentVersionNumber,
    };

    return TaskResponseDto.success(AgentTaskMode.HITL, {
      content: statusResponse,
      metadata: {
        action: 'status',
      },
    });
  }

  /**
   * Execute hitl.history - get version history for a task
   * Named differently from base class handleHitlHistory to avoid override
   */
  private async executeHitlHistory(
    request: TaskRequestDto,
    _organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const payload = request.payload as Record<string, unknown>;
    const taskId = payload.taskId as string;

    if (!taskId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'taskId is required for hitl.history',
      );
    }

    const userId = this.resolveUserId(request);
    if (!userId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'userId is required for hitl.history',
      );
    }

    // Find deliverable via task_id (NOT conversation)
    const deliverable = await this.deliverablesService.findByTaskId(
      taskId,
      userId,
    );

    if (!deliverable) {
      const historyResponse: HitlHistoryResponse = {
        taskId,
        deliverableId: '',
        versionCount: 0,
        currentVersionNumber: 0,
      };

      return TaskResponseDto.success(AgentTaskMode.HITL, {
        content: historyResponse,
        metadata: {
          action: 'history',
        },
      });
    }

    // Get version history
    // Build ExecutionContext for version history retrieval
    const context: ExecutionContext = {
      ...request.context,
      deliverableId: deliverable.id,
    };

    const versions = await this.versionsService.getVersionHistory(context);

    const currentVersion = versions.find((v) => v.isCurrentVersion);

    const historyResponse: HitlHistoryResponse = {
      taskId,
      deliverableId: deliverable.id,
      versionCount: versions.length,
      currentVersionNumber: currentVersion?.versionNumber || 0,
    };

    return TaskResponseDto.success(AgentTaskMode.HITL, {
      content: historyResponse,
      metadata: {
        action: 'history',
      },
    });
  }

  /**
   * Handle hitl.pending - get all pending HITL reviews for user
   * This queries TASKS with hitl_pending = true (NOT conversations)
   */
  private async handleHitlPending(
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    const userId = this.resolveUserId(request);
    if (!userId) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        'userId is required for hitl.pending',
      );
    }

    // Query TASKS with hitl_pending = true for this user
    const pendingTasks = await this.tasksService.findPendingHitl(
      userId,
      organizationSlug || undefined,
    );

    // Build pending items list
    const items: HitlPendingItem[] = [];

    for (const task of pendingTasks) {
      // Get conversation for context (from the join)
      const conversationData = (task as unknown as Record<string, unknown>)
        .conversations as
        | {
            id: string;
            title?: string;
          }
        | undefined;

      // Get deliverable for this task (via task_id)
      const deliverable = await this.deliverablesService.findByTaskId(
        task.id || '',
        userId,
      );

      let currentVersionNumber: number | undefined;
      if (deliverable) {
        // Build ExecutionContext for version retrieval
        const versionContext: ExecutionContext = {
          ...request.context,
          deliverableId: deliverable.id,
        };

        const currentVersion =
          await this.versionsService.getCurrentVersion(versionContext);
        currentVersionNumber = currentVersion?.versionNumber;
      }

      items.push({
        // taskId is the PRIMARY identifier
        taskId: task.id || '',
        agentSlug: task.agent_slug || 'unknown',
        pendingSince: task.hitl_pending_since || new Date().toISOString(),
        // Conversation info for navigation/display
        conversationId: task.conversation_id,
        conversationTitle: conversationData?.title || 'Untitled Conversation',
        // Deliverable info
        deliverableId: deliverable?.id,
        deliverableTitle: deliverable?.title,
        currentVersionNumber,
        agentName: task.agent_name,
        topic: deliverable?.title,
      });
    }

    const pendingResponse: HitlPendingListResponse = {
      items,
      totalCount: items.length,
    };

    return TaskResponseDto.success(AgentTaskMode.HITL, {
      content: pendingResponse,
      metadata: {
        action: 'pending',
      },
    });
  }

  /**
   * Convert HITL content to string for deliverable
   * Handles any content structure dynamically
   */
  private contentToString(content: HitlGeneratedContent): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(content)) {
      if (value === null || value === undefined) {
        continue;
      }

      // Convert camelCase to Title Case for section headers
      const sectionTitle = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      if (typeof value === 'string') {
        // For the first/main content field, don't add a header
        if (parts.length === 0) {
          parts.push(value);
        } else {
          parts.push(`\n\n---\n\n## ${sectionTitle}\n\n${value}`);
        }
      } else if (Array.isArray(value) && value.length > 0) {
        const formattedItems = value
          .map((item, i) => {
            if (typeof item === 'object' && item !== null) {
              return `### Item ${i + 1}\n\n${JSON.stringify(item, null, 2)}`;
            }
            return `### Item ${i + 1}\n\n${String(item)}`;
          })
          .join('\n\n');
        parts.push(`\n\n---\n\n## ${sectionTitle}\n\n${formattedItems}`);
      } else if (typeof value === 'object') {
        parts.push(
          `\n\n---\n\n## ${sectionTitle}\n\n${JSON.stringify(value, null, 2)}`,
        );
      }
    }

    return parts.join('').trim() || JSON.stringify(content, null, 2);
  }

  /**
   * Build deliverable content from HITL generated content
   * Handles undefined/null content gracefully
   */
  private buildDeliverableContentFromHitl(
    content: HitlGeneratedContent | undefined,
  ): string {
    if (!content) {
      return 'Content pending review';
    }
    return this.contentToString(content);
  }

  /**
   * Override handleHitlResume to process the response through normal BUILD flow.
   *
   * After sending resume to LangGraph, the response is processed exactly like
   * any other BUILD response - create deliverable and return BUILD response.
   * HITL is done once the resume is sent; everything after is normal processing.
   *
   * IMPORTANT: Returns HitlDeliverableResponse format so frontend can check status
   * to decide whether to close the modal.
   */
  protected async handleHitlResume(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    this.logger.log(
      `🔍 [API-HITL-RESUME] Starting HITL resume for agent: ${definition.slug}`,
    );

    // 1. Send resume to LangGraph
    const result = await HitlHandlers.sendHitlResume(
      definition,
      request,
      this.getHitlHandlerDependencies(),
    );

    if (!result || result.error) {
      return TaskResponseDto.failure(
        AgentTaskMode.HITL,
        result?.error || 'Failed to send resume to LangGraph',
      );
    }

    // 2. Extract the response data from LangGraph
    const axiosResponse = result.response as { status: number; data: unknown };
    const responseData = axiosResponse.data as Record<string, unknown>;

    this.logger.debug(
      `🔍 [API-HITL-RESUME] Raw LangGraph response: ${JSON.stringify(responseData).substring(0, 500)}...`,
    );

    // Extract status from LangGraph response (nested in data.status or data.data.status)
    // LangGraph controller returns: { success: boolean, data: { taskId, status, ... }, message?: string }
    const nestedData = responseData.data as Record<string, unknown> | undefined;
    const langGraphStatus =
      (nestedData?.status as string) ||
      (responseData.status as string) ||
      'completed';

    this.logger.log(
      `🔍 [API-HITL-RESUME] LangGraph returned status: ${langGraphStatus}, success: ${String(responseData.success)}`,
    );

    // 3. Get context data
    const userId = this.resolveUserId(request);
    const conversationId = this.resolveConversationId(request);
    const payload = request.payload as Record<string, unknown>;
    const taskId = payload.taskId as string;

    // 4. If LangGraph returned hitl_waiting (e.g., for regenerate), return HITL response
    if (
      langGraphStatus === 'hitl_waiting' ||
      langGraphStatus === 'regenerating'
    ) {
      // Extract generated content for regenerate scenario
      const generatedContent = (nestedData?.generatedContent ||
        responseData.generatedContent ||
        {}) as HitlGeneratedContent;

      // Get deliverable info if exists
      const deliverable = await this.deliverablesService.findByTaskId(
        taskId,
        userId || '',
      );

      let currentVersionNumber = 1;
      if (deliverable) {
        // Build ExecutionContext for version retrieval
        const versionContext: ExecutionContext = {
          ...request.context,
          deliverableId: deliverable.id,
        };

        const currentVersion =
          await this.versionsService.getCurrentVersion(versionContext);
        currentVersionNumber = currentVersion?.versionNumber || 1;
      }

      const hitlResponse: HitlDeliverableResponse = {
        taskId,
        conversationId: conversationId || '',
        status: 'hitl_waiting',
        deliverableId: deliverable?.id || '',
        currentVersionNumber,
        message: 'Content regenerated for review',
        agentSlug: definition.slug,
        generatedContent,
      };

      return TaskResponseDto.success(AgentTaskMode.HITL, {
        content: hitlResponse,
        metadata: {
          action: 'resume',
          agentSlug: definition.slug,
        },
      });
    }

    // 5. HITL is done - this is now a normal BUILD completion
    // Process the response exactly like any other BUILD response
    this.logger.log(
      `🔍 [API-HITL-RESUME] HITL approved - processing as normal BUILD completion for taskId: ${taskId}`,
    );

    // Extract generated/final content from LangGraph response
    const finalContent = (nestedData?.finalContent ||
      responseData.finalContent ||
      {}) as HitlGeneratedContent;

    this.logger.debug(
      `🔍 [API-HITL-RESUME] Final content keys: ${Object.keys(finalContent).join(',')}`,
    );

    // Find existing deliverable by taskId (created when HITL was first triggered)
    this.logger.log(
      `🔍 [API-HITL-RESUME] Looking for existing deliverable by taskId: ${taskId}, userId: ${userId}`,
    );

    const existingDeliverable = await this.deliverablesService.findByTaskId(
      taskId,
      userId || '',
    );

    if (existingDeliverable) {
      this.logger.log(
        `🔍 [API-HITL-RESUME] Found existing deliverable: ${existingDeliverable.id}, updating with final content`,
      );

      // Build final content string from all generated content
      const finalContentString =
        this.buildDeliverableContentFromHitl(finalContent);

      // Build ExecutionContext for version operations
      const versionContext: ExecutionContext = {
        ...request.context,
        deliverableId: existingDeliverable.id,
      };

      // Build metadata with info about which content fields are present
      const contentFields: Record<string, boolean> = {};
      if (finalContent) {
        for (const [key, value] of Object.entries(finalContent)) {
          if (value !== null && value !== undefined) {
            const hasContent = Array.isArray(value)
              ? value.length > 0
              : typeof value === 'string'
                ? value.trim().length > 0
                : true;
            if (hasContent) {
              const fieldName = `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
              contentFields[fieldName] = true;
            }
          }
        }
      }

      // Create a new version with the final approved content
      await this.versionsService.createVersion(
        {
          content: finalContentString,
          createdByType: DeliverableVersionCreationType.AI_RESPONSE,
          metadata: {
            hitlDecision: 'approve',
            approvedAt: new Date().toISOString(),
            ...contentFields,
          },
        },
        versionContext,
      );

      // Get the updated version number
      const currentVersion =
        await this.versionsService.getCurrentVersion(versionContext);
      const currentVersionNumber = currentVersion?.versionNumber || 2;

      this.logger.log(
        `🔍 [API-HITL-RESUME] Created version ${currentVersionNumber} for deliverable ${existingDeliverable.id}`,
      );

      // Return HitlDeliverableResponse with status 'completed' for frontend compatibility
      // The frontend expects this structure from hitl.resume
      const hitlCompletedResponse: HitlDeliverableResponse = {
        taskId,
        conversationId: conversationId || '',
        status: 'completed',
        deliverableId: existingDeliverable.id,
        currentVersionNumber,
        message: 'Content approved and finalized!',
        agentSlug: definition.slug,
        generatedContent: finalContent,
      };

      // Use BUILD mode but with HitlDeliverableResponse-compatible content
      // This allows the frontend to check response.status === 'completed'
      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: hitlCompletedResponse,
        metadata: {
          agentSlug: definition.slug,
          hitlCompleted: true,
          taskId,
          deliverableId: existingDeliverable.id,
          currentVersionNumber,
        },
      });
    }

    // No existing deliverable - create one via normal BUILD flow
    this.logger.warn(
      `🔍 [API-HITL-RESUME] No existing deliverable found for taskId ${taskId}, creating via BUILD flow`,
    );

    return await this.processApiResponseAsDeliverable(
      definition,
      request,
      organizationSlug,
      responseData,
    );
  }

  /**
   * Process an API response and create a deliverable from it.
   * This is the shared logic used by both executeBuild and handleHitlResume.
   */
  private async processApiResponseAsDeliverable(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
    responseData: unknown,
  ): Promise<TaskResponseDto> {
    try {
      // Validate required context
      if (!organizationSlug) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'organizationSlug is required but was null or undefined',
        );
      }

      const userId = this.resolveUserId(request);
      const conversationId = this.resolveConversationId(request);
      const taskId =
        ((request.payload as Record<string, unknown>)?.taskId as string) ||
        null;

      if (!userId || !conversationId) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'Missing required userId or conversationId',
        );
      }

      // Extract message/content from response
      const { message, metadata } = this.extractContentFromResponse(
        responseData,
        definition,
      );

      // Determine format
      const isMarkdown =
        message &&
        (message.includes('#') ||
          message.includes('**') ||
          message.includes('```') ||
          (message.includes('|') && message.includes('---')));
      const deliverableFormat = isMarkdown
        ? 'markdown'
        : definition.config?.deliverable?.format || 'json';

      // Create deliverable
      const deliverableResult = await this.deliverablesService.executeAction(
        'create',
        {
          title:
            ((request.payload as Record<string, unknown>)?.title as string) ||
            (metadata.topic as string) ||
            `Response: ${definition.name}`,
          content: message,
          format: deliverableFormat,
          type: definition.config?.deliverable?.type || 'api-response',
          agentName: definition.slug,
          organizationSlug,
          taskId: taskId ?? undefined,
          metadata: {
            ...metadata,
          },
        },
        // Use request.context directly - full ExecutionContext from transport-types
        request.context,
      );

      if (!deliverableResult.success) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          deliverableResult.error?.message || 'Failed to create deliverable',
        );
      }

      this.logger.log(`✅ [API-HITL-RESUME] Deliverable created successfully`);

      // Return BUILD response with deliverable
      const deliverableData = deliverableResult.data as
        | Record<string, unknown>
        | undefined;
      const contentWithDeliverable =
        deliverableData && 'deliverable' in deliverableData
          ? deliverableData
          : { deliverable: deliverableData };

      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: contentWithDeliverable,
        metadata: {
          agentSlug: definition.slug,
          ...metadata,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process API response: ${errorMessage}`);
      return TaskResponseDto.failure(AgentTaskMode.BUILD, errorMessage);
    }
  }

  /**
   * Extract message content and metadata from API response.
   * Handles both regular responses and HITL finalContent/generatedContent responses.
   */
  private extractContentFromResponse(
    responseData: unknown,
    _definition: AgentRuntimeDefinition,
  ): { message: string; metadata: Record<string, unknown> } {
    let message = 'No response content';
    const metadata: Record<string, unknown> = {};

    if (!responseData || typeof responseData !== 'object') {
      return {
        message: extractString(responseData) || 'No response content',
        metadata,
      };
    }

    const dataObj = responseData as Record<string, unknown>;
    const nestedData =
      dataObj.data && typeof dataObj.data === 'object'
        ? (dataObj.data as Record<string, unknown>)
        : null;

    // Helper function to format content dynamically (handles any content structure)
    const formatContent = (
      content: Record<string, unknown>,
    ): { message: string; metadata: Record<string, unknown> } => {
      const parts: string[] = [];

      for (const [key, value] of Object.entries(content)) {
        if (value === null || value === undefined) {
          continue;
        }

        // Convert camelCase to Title Case for section headers
        const sectionTitle = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase())
          .trim();

        if (typeof value === 'string') {
          // For the first/main content field, don't add a header
          if (parts.length === 0) {
            parts.push(value);
          } else {
            parts.push(`\n\n---\n\n## ${sectionTitle}\n\n${value}`);
          }
        } else if (Array.isArray(value) && value.length > 0) {
          const formattedItems = value
            .map((item, i) => {
              if (typeof item === 'object' && item !== null) {
                // If it's an object with a 'text' or 'content' field, use that
                const itemObj = item as Record<string, unknown>;
                if ('text' in itemObj && typeof itemObj.text === 'string') {
                  return `${i + 1}. ${itemObj.text}`;
                }
                if (
                  'content' in itemObj &&
                  typeof itemObj.content === 'string'
                ) {
                  return `${i + 1}. ${itemObj.content}`;
                }
                return `${i + 1}. ${JSON.stringify(item, null, 2)}`;
              }
              return `${i + 1}. ${String(item)}`;
            })
            .join('\n\n');
          parts.push(`\n\n---\n\n## ${sectionTitle}\n\n${formattedItems}`);
        } else if (typeof value === 'object') {
          // Handle nested objects
          parts.push(
            `\n\n---\n\n## ${sectionTitle}\n\n${JSON.stringify(value, null, 2)}`,
          );
        }
      }

      const formattedMessage = parts.join('') || 'No content generated';
      return {
        message: formattedMessage,
        metadata: {
          topic: (nestedData?.topic || dataObj.topic) as string,
          duration: (nestedData?.duration || dataObj.duration) as number,
        },
      };
    };

    // Check for finalContent (HITL completed response)
    const finalContent = (nestedData?.finalContent || dataObj.finalContent) as
      | Record<string, unknown>
      | undefined;
    if (finalContent) {
      return formatContent(finalContent);
    }

    // Check for generatedContent (HITL waiting response)
    const generatedContent = (nestedData?.generatedContent ||
      dataObj.generatedContent) as Record<string, unknown> | undefined;
    if (generatedContent) {
      return formatContent(generatedContent);
    }

    // Regular response - extract summary/message/content
    const source = nestedData || dataObj;
    // Try to extract a string field, fall back to JSON stringification
    if (typeof source.summary === 'string') {
      message = source.summary;
    } else if (typeof source.message === 'string') {
      message = source.message;
    } else if (typeof source.content === 'string') {
      message = source.content;
    } else {
      // None of the expected string fields exist, serialize the whole response
      message = JSON.stringify(responseData, null, 2);
    }

    // Extract topic if present
    if (source.topic) {
      metadata.topic = source.topic;
    }

    return { message, metadata };
  }

  /**
   * BUILD mode - execute HTTP API call and save results
   */
  protected async executeBuild(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto> {
    try {
      // Validate required context
      // organizationSlug is required - fail fast if missing
      if (!organizationSlug) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'organizationSlug is required but was null or undefined',
        );
      }

      const userId = this.resolveUserId(request);
      let conversationId = this.resolveConversationId(request);
      // Phase 3.5: Primary source is ExecutionContext, fallback to payload for legacy compat
      const taskId =
        (request.context?.taskId && request.context.taskId !== NIL_UUID
          ? request.context.taskId
          : null) ||
        ((request.payload as Record<string, unknown>)?.taskId as
          | string
          | null) ||
        null;

      if (!userId) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'Missing required userId for API execution',
        );
      }

      // Phase 3.5: If conversationId is NIL_UUID or not provided, create a new conversation
      // This ensures deliverables can be created with valid FK references
      if (!conversationId || conversationId === NIL_UUID) {
        try {
          const conversation =
            await this.conversationsService.getOrCreateConversation(
              {
                userId,
                orgSlug: organizationSlug,
                conversationId: undefined, // Create new
              },
              definition.slug,
            );
          conversationId = conversation.id;
          // Update context with the new conversationId
          if (request.context) {
            request.context.conversationId = conversationId;
          }
          this.logger.log(
            `📝 [BUILD] Created conversation ${conversationId} for user ${userId}`,
          );
        } catch (convError) {
          this.logger.error(
            `❌ [BUILD] Failed to create conversation: ${convError instanceof Error ? convError.message : String(convError)}`,
          );
          return TaskResponseDto.failure(
            AgentTaskMode.BUILD,
            'Failed to create conversation for API execution',
          );
        }
      }

      // Check execution mode - handle websocket/polling differently
      const executionMode =
        ((request.payload as Record<string, unknown>)
          ?.executionMode as string) || 'immediate';

      // Register stream if using real-time/polling mode (for SSE progress updates)
      // But still execute synchronously and wait for the result
      if (executionMode === 'real-time' || executionMode === 'polling') {
        this.logger.log(
          `🔌 API Agent ${definition.slug}: ${executionMode} mode detected - registering stream for progress updates`,
        );

        if (request.context) {
          // Register stream session with StreamingService for progress updates
          const streamId = this.streamingService.registerStream(
            request.context,
            AgentTaskMode.BUILD,
            request.userMessage ?? '',
          );
          this.logger.log(
            `✅ API Agent ${definition.slug}: Stream registered with streamId=${streamId} for progress updates`,
          );
        }
      }

      // Continue with synchronous execution (wait for API response)
      this.logger.log(
        `⚡ API Agent ${definition.slug}: immediate mode - executing synchronously`,
      );

      // Extract provider and model
      // Priority: llmOverride (rerun) > payload.config > ExecutionContext
      const payload = request.payload;
      const llmOverride = payload?.llmOverride as
        | { provider?: string; model?: string }
        | undefined;
      const config = payload?.config as
        | { provider?: string; model?: string }
        | undefined;

      // Priority: llmOverride (rerun) > payload.config > context
      const provider =
        llmOverride?.provider ??
        config?.provider ??
        request.context?.provider ??
        null;
      const model =
        llmOverride?.model ?? config?.model ?? request.context?.model ?? null;

      if (
        !provider ||
        !model ||
        typeof provider !== 'string' ||
        typeof model !== 'string'
      ) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          `Missing LLM configuration: provider=${provider}, model=${model}. Send context.provider/model or payload.config.`,
        );
      }

      // Create enriched request with extracted values for interpolation
      // Include llmSelection for template compatibility ({{llmSelection.providerName}})
      const userMessage =
        request.userMessage ||
        ((request.payload as Record<string, unknown>)?.userMessage as string) ||
        ((request.payload as Record<string, unknown>)?.prompt as string) ||
        '';
      const enrichedRequest = {
        ...request,
        userId,
        conversationId,
        taskId: taskId ?? undefined,
        userMessage,
        payload: {
          ...(request.payload as Record<string, unknown>),
          provider,
          model,
        },
        llmSelection: {
          providerName: provider,
          modelName: model,
        },
      };

      // DEBUG: Log definition structure to trace API config extraction
      this.logger.debug(
        `🔧 [API-CONFIG-DEBUG] Definition transport: ${JSON.stringify(definition.transport, null, 2)?.substring(0, 800)}`,
      );
      this.logger.debug(
        `🔧 [API-CONFIG-DEBUG] Definition config?.api: ${JSON.stringify(definition.config?.api, null, 2)?.substring(0, 500)}`,
      );

      // Get API configuration - check both config.api and transport.api
      // transport.api is used by data analyst and extended post writer agents (stored in endpoint field)
      // Note: transport.api.endpoint may be empty if database uses 'url' instead of 'endpoint'
      // So we check transport.raw?.url as fallback
      const apiConfig =
        this.asRecord(definition.config?.api) ??
        (definition.transport?.api
          ? {
              url:
                definition.transport.api.endpoint ||
                (definition.transport.raw &&
                typeof definition.transport.raw === 'object' &&
                'url' in definition.transport.raw &&
                typeof definition.transport.raw.url === 'string'
                  ? definition.transport.raw.url
                  : ''),
              method: definition.transport.api.method,
              headers: definition.transport.api.headers,
              timeout: definition.transport.api.timeout,
              requestTransform: definition.transport.api.requestTransform,
              responseTransform: definition.transport.api.responseTransform,
            }
          : null);
      if (!apiConfig) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'No API configuration found or URL missing',
        );
      }

      const urlTemplate =
        this.ensureString(apiConfig.url) ??
        this.ensureString(apiConfig.endpoint);
      if (!urlTemplate) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          'API configuration missing URL string',
        );
      }

      this.logger.log(
        `Executing API call to ${urlTemplate} for agent ${definition.slug}`,
      );

      // 1. Interpolate URL and parameters
      const url = this.interpolateString(urlTemplate, enrichedRequest);
      const method = (
        this.ensureString(apiConfig.method) ?? 'GET'
      ).toUpperCase();

      // 2. Build headers
      const headersRecord = this.asRecord(apiConfig.headers);
      const headers = this.buildHeaders(
        headersRecord ? this.toPlainRecord(headersRecord) : {},
        enrichedRequest,
      );

      // 3. Build request body (for POST/PUT/PATCH)
      // Default: Build standard request body with all common fields
      // requestTransform is only used for special cases (e.g., n8n workflows with custom formats)
      let body: unknown = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const requestTransform = this.asRecord(apiConfig.requestTransform);
        if (requestTransform) {
          // Use requestTransform only if explicitly provided (for special cases)
          // organizationSlug is already validated above
          body = this.interpolateObject(
            this.toPlainRecord(requestTransform),
            enrichedRequest,
          );
          body = this.filterUnresolvedTemplates(body);

          // Ensure common fields are included even with custom transform
          if (body && typeof body === 'object') {
            const bodyObj = body as Record<string, unknown>;
            if (!('taskId' in bodyObj)) bodyObj.taskId = taskId;
            if (!('userId' in bodyObj)) bodyObj.userId = userId;
            if (!('conversationId' in bodyObj))
              bodyObj.conversationId = conversationId;
            if (!('organizationSlug' in bodyObj))
              bodyObj.organizationSlug = organizationSlug;
            if (provider && model && !('provider' in bodyObj))
              bodyObj.provider = provider;
            if (provider && model && !('model' in bodyObj))
              bodyObj.model = model;
          }
        } else if (apiConfig.body) {
          const bodyRecord = this.asRecord(apiConfig.body);
          if (bodyRecord) {
            body = this.interpolateObject(
              this.toPlainRecord(bodyRecord),
              enrichedRequest,
            );
            // Remove fields with unresolved templates or empty strings (from missing env vars)
            body = this.filterUnresolvedTemplates(body);

            // Post-process statusWebhook to ensure AGENT_BASE_URL and API_PORT are combined correctly
            if (body && typeof body === 'object') {
              const bodyObj = body as Record<string, unknown>;
              if (
                'statusWebhook' in bodyObj &&
                typeof bodyObj.statusWebhook === 'string'
              ) {
                bodyObj.statusWebhook = this.combineBaseUrlAndPort(
                  bodyObj.statusWebhook,
                );
                this.logger.debug(
                  `statusWebhook value: ${JSON.stringify(bodyObj.statusWebhook)}`,
                );
              }
            }
          }
        }
        if (!body && typeof apiConfig.body === 'string') {
          const interpolated = this.interpolateString(
            apiConfig.body,
            enrichedRequest,
          );
          // Only use if no unresolved templates remain
          body = interpolated.includes('{{') ? undefined : interpolated;
        }
        if (!body) {
          // Default: Build request body with ExecutionContext
          // ExecutionContext is the single source of truth for all context fields
          const context: ExecutionContext = {
            orgSlug: organizationSlug,
            userId,
            conversationId,
            taskId: taskId || NIL_UUID,
            planId: NIL_UUID, // Created during execution if needed
            deliverableId: NIL_UUID, // Created during execution
            agentSlug: definition.slug,
            agentType: definition.agentType,
            provider: provider || NIL_UUID,
            model: model || NIL_UUID,
          };

          // Extract documents and legalMetadata from request.metadata (set by controller's document processing)
          // LangGraph agents need documents in format: { name, content, type }
          // and legalMetadata at the top level for routing decisions
          const metadataDocuments = (request.metadata?.documents ||
            []) as Array<{
            filename?: string;
            extractedText?: string;
            mimeType?: string;
            legalMetadata?: unknown;
          }>;

          // Transform to LangGraph document format
          const documents = metadataDocuments
            .filter((doc) => doc.extractedText) // Only include docs with extracted text
            .map((doc) => ({
              name: doc.filename || 'unknown',
              content: doc.extractedText || '',
              type: doc.mimeType || 'application/octet-stream',
            }));

          // Extract legalMetadata from first document (for single document analysis)
          // For multi-document, we could merge metadata but most legal analysis is single-doc
          const firstDoc = metadataDocuments[0];
          const legalMetadata = firstDoc?.legalMetadata;

          if (documents.length > 0) {
            this.logger.log(
              `📄 [API-RUNNER] Including ${documents.length} document(s) with legalMetadata in LangGraph request`,
            );
          }

          body = {
            context,
            userMessage,
            ...(documents.length > 0 ? { documents } : {}),
            ...(legalMetadata ? { legalMetadata } : {}),
          };
        }
      }

      // 4. Build query parameters
      let queryParams: Record<string, unknown> = {};
      const queryParamsRecord = this.asRecord(apiConfig.queryParams);
      if (queryParamsRecord) {
        queryParams = this.interpolateObject(
          this.toPlainRecord(queryParamsRecord),
          enrichedRequest,
        );
      }

      // 4.5. Special handling for Marketing Swarm: Create task in marketing.swarm_tasks before calling LangGraph
      // The LangGraph endpoint expects the task to already exist in marketing.swarm_tasks table
      this.logger.debug(
        `🔧 [MarketingSwarm] CRITICAL CHECK: slug=${definition.slug}, taskId=${taskId}, hasUserMessage=${!!userMessage}, userMessageLength=${userMessage?.length || 0}`,
      );
      // Log request structure for debugging
      if (definition.slug === 'marketing-swarm') {
        this.logger.debug(
          `🔧 [MarketingSwarm] Request structure: request.userMessage=${!!request.userMessage}, payload.userMessage=${!!(request.payload as Record<string, unknown>)?.userMessage}`,
        );
        this.logger.debug(
          `🔧 [MarketingSwarm] RAW - request keys: ${Object.keys(request).join(', ')}, payload keys: ${Object.keys(request.payload || {}).join(', ')}`,
        );
      }
      if (definition.slug === 'marketing-swarm' && taskId && userMessage) {
        this.logger.debug(
          `✅ [MarketingSwarm] Task creation check PASSED: taskId=${taskId}, userMessage length=${userMessage.length}`,
        );
        try {
          // Parse the userMessage JSON to extract marketing swarm request data
          interface SwarmRequestData {
            type?: string;
            contentTypeSlug?: string;
            contentTypeContext?: string;
            promptData?: Record<string, unknown>;
            config?: {
              writers?: Array<{ agentSlug: string; llmConfigId: string }>;
              editors?: Array<{ agentSlug: string; llmConfigId: string }>;
              evaluators?: Array<{ agentSlug: string; llmConfigId: string }>;
              execution?: Record<string, unknown>;
            };
          }
          let swarmRequestData: SwarmRequestData | null = null;

          try {
            swarmRequestData = JSON.parse(userMessage) as SwarmRequestData;
            this.logger.debug(
              `🔧 [MarketingSwarm] Parsed userMessage: type=${swarmRequestData?.type}, hasContentTypeSlug=${!!swarmRequestData?.contentTypeSlug}, hasPromptData=${!!swarmRequestData?.promptData}, hasConfig=${!!swarmRequestData?.config}`,
            );
          } catch (parseError) {
            this.logger.debug(
              `⚠️ [MarketingSwarm] Failed to parse userMessage as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            );
            // userMessage is not JSON, try to extract from body if it's already parsed
            if (body && typeof body === 'object') {
              const bodyObj = body as Record<string, unknown>;
              if (
                bodyObj.userMessage &&
                typeof bodyObj.userMessage === 'string'
              ) {
                try {
                  swarmRequestData = JSON.parse(
                    bodyObj.userMessage,
                  ) as SwarmRequestData;
                  this.logger.debug(
                    `🔧 [MarketingSwarm] Parsed userMessage from body: type=${swarmRequestData?.type}`,
                  );
                } catch {
                  this.logger.debug(
                    `⚠️ [MarketingSwarm] Failed to parse userMessage from body`,
                  );
                  // Ignore parse errors
                }
              }
            }
          }

          // Only create task if we have valid swarm request data
          if (
            swarmRequestData &&
            swarmRequestData.type === 'marketing-swarm-request' &&
            swarmRequestData.contentTypeSlug &&
            swarmRequestData.promptData &&
            swarmRequestData.config
          ) {
            this.logger.debug(
              `✅ [MarketingSwarm] Valid swarm request data found, creating task in database: taskId=${taskId}`,
            );

            // Check if task already exists (idempotency)
            const { data: existingTask } = (await this.db
              .from('marketing', 'swarm_tasks')
              .select('task_id')
              .eq('task_id', taskId)
              .single()) as QueryResult<unknown>;

            if (!existingTask) {
              // Create the task in marketing.swarm_tasks
              const { error: insertError } = await this.db
                .from('marketing', 'swarm_tasks')
                .insert({
                  task_id: taskId,
                  organization_slug: organizationSlug,
                  user_id: userId,
                  conversation_id: conversationId,
                  content_type_slug: swarmRequestData.contentTypeSlug,
                  prompt_data: swarmRequestData.promptData,
                  config: swarmRequestData.config,
                  status: 'pending',
                });

              if (insertError) {
                this.logger.error(
                  `Failed to create marketing swarm task: ${insertError.message}`,
                );
                // Don't fail the request - LangGraph might handle missing task gracefully
                // or we can retry
              } else {
                this.logger.debug(
                  `✅ Created marketing swarm task in database: taskId=${taskId}`,
                );
              }
            } else {
              this.logger.debug(
                `Marketing swarm task already exists: taskId=${taskId}`,
              );
            }
          } else {
            this.logger.debug(
              `[MarketingSwarm] Invalid swarm request data - missing required fields. type=${swarmRequestData?.type}, hasContentTypeSlug=${!!swarmRequestData?.contentTypeSlug}, hasPromptData=${!!swarmRequestData?.promptData}, hasConfig=${!!swarmRequestData?.config}`,
            );
          }
        } catch (error) {
          // Log error but don't fail - allow the request to proceed
          // LangGraph will handle the missing task error
          this.logger.debug(
            `❌ [MarketingSwarm] Failed to create swarm task: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        // Only log if this is marketing-swarm (to avoid noise for other agents)
        if (definition.slug === 'marketing-swarm') {
          this.logger.debug(
            `⚠️ [MarketingSwarm] SKIPPING task creation! slug=${definition.slug}, taskId=${taskId}, hasUserMessage=${!!userMessage}, userMessagePreview=${userMessage?.substring(0, 100) || 'EMPTY'}`,
          );
          this.logger.debug(
            `⚠️ [MarketingSwarm] request.userMessage=${!!request.userMessage}, payload preview: ${JSON.stringify(request.payload)?.substring(0, 300)}`,
          );
        }
      }

      // 5. Execute HTTP request
      // Observability: Calling external API
      this.emitObservabilityEvent(
        'agent.progress',
        'Calling external API',
        request.context,
        {
          mode: request.mode,
          progress: 30,
        },
      );

      const startTime = Date.now();
      let response: unknown;

      try {
        if (!this.httpService) {
          throw new Error('HttpService not available');
        }
        if (!this.httpService) {
          throw new Error('HttpService not available');
        }
        // Use agent's configured timeout, falling back to execution.timeoutSeconds (from metadata), then default
        // Default 10 minutes (600000ms) to accommodate slow local models (Ollama/sovereign mode)
        const timeoutMs =
          this.ensureNumber(apiConfig.timeout) ??
          (definition.execution.timeoutSeconds
            ? definition.execution.timeoutSeconds * 1000
            : 600000);
        const observable = this.httpService.request({
          url,
          method: method,
          headers,
          data: body,
          params: queryParams,
          timeout: timeoutMs,
          validateStatus: () => true, // Don't throw on non-2xx status
        });

        response = await firstValueFrom(observable);
      } catch (error) {
        // Extract detailed error information
        let errorMessage = 'Unknown error';
        let errorDetails = '';

        if (error && typeof error === 'object') {
          // Handle Axios errors
          const axiosError = error as {
            message?: string;
            code?: string;
            response?: { status?: number; statusText?: string; data?: unknown };
            request?: { path?: string };
          };

          if (axiosError.code === 'ECONNREFUSED') {
            errorMessage = `Connection refused - service may not be running`;
            errorDetails = `Failed to connect to ${url}`;
          } else if (axiosError.code === 'ETIMEDOUT') {
            errorMessage = `Request timeout`;
            errorDetails = `Request to ${url} timed out`;
          } else if (axiosError.response) {
            errorMessage =
              `HTTP ${axiosError.response.status} ${axiosError.response.statusText || ''}`.trim();
            errorDetails = axiosError.response.data
              ? typeof axiosError.response.data === 'string'
                ? axiosError.response.data
                : JSON.stringify(axiosError.response.data)
              : '';
          } else if (axiosError.message) {
            errorMessage = axiosError.message;
            errorDetails = axiosError.code
              ? `Error code: ${axiosError.code}`
              : '';
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }

        const fullErrorMsg = errorDetails
          ? `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`
          : errorMessage;

        this.logger.error(`API call failed: ${fullErrorMsg}`, {
          url,
          method,
          error,
        });

        return TaskResponseDto.failure(AgentTaskMode.BUILD, fullErrorMsg);
      }

      const duration = Date.now() - startTime;

      // Observability: Processing API response
      this.emitObservabilityEvent(
        'agent.progress',
        'Processing API response',
        request.context,
        {
          mode: request.mode,
          progress: 60,
        },
      );

      // 6. Check response status
      const responseTyped = response as {
        status: number;
        data: unknown;
        headers: Record<string, unknown>;
      };
      const statusCode = responseTyped.status;
      const isSuccess = statusCode >= 200 && statusCode < 300;

      if (!isSuccess && apiConfig.failOnError !== false) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          `API returned error status ${statusCode}: ${JSON.stringify(responseTyped.data)}`,
        );
      }

      // 7. Format response data
      // Observability: Formatting response
      this.emitObservabilityEvent(
        'agent.progress',
        'Formatting response',
        request.context,
        {
          mode: request.mode,
          progress: 80,
        },
      );

      const responseData = responseTyped.data;

      // DEBUG: Log raw API response to trace HITL detection (BUILD mode)
      this.logger.debug(
        `🔍 [HITL-DEBUG-BUILD] Raw API response for ${definition.slug}: ${JSON.stringify(responseData).substring(0, 1000)}`,
      );

      // Check if response indicates HITL workflow (LangGraph agents return status: 'hitl_waiting')
      if (responseData && typeof responseData === 'object') {
        const dataObj = responseData as Record<string, unknown>;

        // LangGraph returns { success: true, data: { status: 'hitl_waiting', ... } }
        // Or sometimes { status: 'hitl_waiting', ... } directly
        const nestedData =
          dataObj.data && typeof dataObj.data === 'object'
            ? (dataObj.data as Record<string, unknown>)
            : null;

        const hitlStatus = (nestedData?.status || dataObj.status) as
          | string
          | undefined;
        const hitlPending = (nestedData?.hitlPending || dataObj.hitlPending) as
          | boolean
          | undefined;

        this.logger.debug(
          `🔍 [HITL-DEBUG-BUILD] Checking HITL: status=${hitlStatus}, hitlPending=${hitlPending}, nestedData=${JSON.stringify(nestedData)?.substring(0, 300)}`,
        );

        if (hitlStatus === 'hitl_waiting' || hitlPending === true) {
          // Extract HITL payload from response
          const source = nestedData || dataObj;
          // Use taskId from the request - this is the ID that should be used for HITL operations
          // LangGraph uses taskId as thread_id internally
          const hitlTaskId = taskId || (source.taskId as string);
          const topic =
            (source.topic as string) ||
            (source.userMessage as string) ||
            request.userMessage ||
            'Generated content';
          const generatedContent = source.generatedContent as
            | Record<string, unknown>
            | undefined;

          this.logger.log(
            `✅ [HITL-DEBUG-BUILD] Detected HITL waiting response: taskId=${hitlTaskId}, topic=${topic?.substring(0, 50)}...`,
          );

          // Create or find existing deliverable for HITL review
          // Deliverables track the content that needs human approval
          let deliverableId: string | undefined;
          try {
            // Check if deliverable already exists for this task
            const existingDeliverable =
              await this.deliverablesService.findByTaskId(hitlTaskId, userId);

            if (existingDeliverable) {
              deliverableId = existingDeliverable.id;
              this.logger.log(
                `📦 [HITL-BUILD] Found existing deliverable ${deliverableId} for task ${hitlTaskId}`,
              );
            } else {
              // Create new deliverable with generated content
              const contentForDeliverable =
                this.buildDeliverableContentFromHitl(
                  generatedContent as HitlGeneratedContent | undefined,
                );

              // Get deliverable type from agent config, fallback to DOCUMENT
              const agentDeliverableType = definition.config?.deliverable?.type;
              const deliverableType = agentDeliverableType
                ? Object.values(DeliverableType).includes(
                    agentDeliverableType as DeliverableType,
                  )
                  ? (agentDeliverableType as DeliverableType)
                  : DeliverableType.DOCUMENT
                : DeliverableType.DOCUMENT;

              this.logger.debug(
                `📦 [HITL-BUILD] Using deliverable type: ${deliverableType} (from agent config: ${agentDeliverableType || 'not set'})`,
              );

              // Create deliverable using executeAction with ExecutionContext
              const deliverableResult =
                await this.deliverablesService.executeAction(
                  'create',
                  {
                    title: topic.substring(0, 255) || 'HITL Review Content',
                    content: contentForDeliverable,
                    format: DeliverableFormat.MARKDOWN,
                    type: deliverableType,
                    agentName: definition.slug,
                    taskId: hitlTaskId,
                    metadata: {
                      hitlStatus: 'pending_review',
                      generatedAt: new Date().toISOString(),
                      provider,
                      model,
                    },
                  },
                  request.context,
                );

              if (!deliverableResult.success) {
                throw new Error(
                  deliverableResult.error?.message ||
                    'Failed to create deliverable',
                );
              }

              const deliverable = deliverableResult.data as { id: string };
              deliverableId = deliverable.id;
              this.logger.log(
                `📦 [HITL-BUILD] Created deliverable ${deliverableId} for HITL task ${hitlTaskId}`,
              );
            }
          } catch (deliverableError) {
            // Log error but don't fail - HITL can still proceed without deliverable
            this.logger.error(
              `⚠️ [HITL-BUILD] Failed to create/find deliverable for task ${hitlTaskId}:`,
              deliverableError,
            );
          }

          // Set hitl_pending flag on the task before returning
          try {
            await this.tasksService.updateHitlPending(hitlTaskId, true);
            this.logger.log(
              `✅ [HITL-BUILD] Set hitl_pending=true on task ${hitlTaskId}`,
            );
          } catch (hitlPendingError) {
            this.logger.error(
              `⚠️ [HITL-BUILD] Failed to set hitl_pending on task ${hitlTaskId}:`,
              hitlPendingError,
            );
          }

          return TaskResponseDto.hitlWaiting(
            {
              taskId: hitlTaskId,
              status: 'hitl_waiting',
              topic,
              hitlPending: true,
              generatedContent: generatedContent as
                | import('@orchestrator-ai/transport-types').HitlGeneratedContent
                | undefined,
              deliverableId,
            },
            {
              agentSlug: definition.slug,
              provider,
              model,
              apiUrl: url,
              method,
              statusCode,
              duration,
            },
          );
        }
      }

      // Extract message content for both conversation response and deliverable
      // This must happen BEFORE deliverable creation in BUILD mode
      let message: string = 'No response content';
      const metadata: Record<string, unknown> = {};

      const responseTransform = this.asRecord(apiConfig.responseTransform);
      if (responseTransform) {
        // Extract content using responseTransform.content path
        const contentPath = this.ensureString(responseTransform.content);
        if (contentPath && responseData && typeof responseData === 'object') {
          const path = contentPath.replace(/^\$\./, '');
          const dataObj = responseData as Record<string, unknown>;

          const pathParts = path.split('.');
          let value: unknown = dataObj;
          for (const part of pathParts) {
            if (value && typeof value === 'object' && part in value) {
              value = (value as Record<string, unknown>)[part];
            } else {
              value = undefined;
              break;
            }
          }

          if (value !== undefined && value !== null) {
            message = extractString(value);
          } else {
            // Fallback paths
            const fallbackPaths = [
              ['data', 'summary'],
              ['data', 'message'],
              ['summary'],
              ['message'],
              ['content'],
            ];

            let extracted = false;
            for (const fallbackPath of fallbackPaths) {
              let fallbackValue: unknown = dataObj;
              for (const part of fallbackPath) {
                if (
                  fallbackValue &&
                  typeof fallbackValue === 'object' &&
                  part in fallbackValue
                ) {
                  fallbackValue = (fallbackValue as Record<string, unknown>)[
                    part
                  ];
                } else {
                  fallbackValue = undefined;
                  break;
                }
              }
              if (
                fallbackValue !== undefined &&
                fallbackValue !== null &&
                typeof fallbackValue === 'string'
              ) {
                message = fallbackValue;
                extracted = true;
                break;
              }
            }

            if (!extracted) {
              message = extractString(responseData) || 'No response content';
            }
          }

          // Extract metadata if specified
          const metadataTransform = this.asRecord(responseTransform.metadata);
          if (
            metadataTransform &&
            responseData &&
            typeof responseData === 'object'
          ) {
            const dataObj = responseData as Record<string, unknown>;
            for (const [key, path] of Object.entries(metadataTransform)) {
              const fieldPath = String(path).replace(/^\$\./, '');
              const pathParts = fieldPath.split('.');
              let value: unknown = dataObj;
              for (const part of pathParts) {
                if (value && typeof value === 'object' && part in value) {
                  value = (value as Record<string, unknown>)[part];
                } else {
                  value = undefined;
                  break;
                }
              }
              metadata[key] = value;
            }
          }
        } else {
          message = extractString(responseData) || 'No response content';
        }
      } else {
        // Default extraction using helper function
        message = extractMessageFromResponse(responseData);
      }

      // For BUILD mode: Create deliverable with extracted message (markdown) instead of full JSON
      // Check if the extracted message looks like markdown
      const isMarkdown =
        message &&
        (message.includes('#') ||
          message.includes('**') ||
          message.includes('```') ||
          (message.includes('|') && message.includes('---'))); // Markdown table

      // Use the extracted message for deliverable content, not the full response
      // This ensures deliverables store just the markdown, matching other agents' behavior
      const deliverableFormat = isMarkdown
        ? 'markdown'
        : definition.config?.deliverable?.format || 'json';

      const formattedContent = isMarkdown
        ? message
        : this.formatApiResponse(responseData, deliverableFormat, {
            statusCode,
            headers: responseTyped.headers || {},
            duration,
          });

      // 8. Save deliverable (unless configured to skip and wait for completion)
      const deliverableConfig = this.asRecord(definition.config?.deliverable);
      const skipDeliverable = deliverableConfig?.skip === true;

      if (skipDeliverable) {
        this.logger.log(
          `Async agent ${definition.slug} - waiting for completion callback`,
        );

        // Wait for the completion callback to be triggered
        // The completion endpoint will emit 'task.completion' event with deliverable
        const completionPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => {
              this.eventEmitter.removeAllListeners(`task.completion.${taskId}`);
              reject(new Error('Task completion timeout after 15 minutes'));
            },
            15 * 60 * 1000,
          ); // 15 minute timeout to accommodate slow local models (Ollama/sovereign mode)

          this.eventEmitter.once(
            `task.completion.${taskId}`,
            (data: { deliverable: unknown; error?: string }) => {
              clearTimeout(timeout);
              if (data.error) {
                reject(new Error(data.error));
              } else {
                resolve(data.deliverable);
              }
            },
          );
        });

        try {
          const deliverable = await completionPromise;

          return TaskResponseDto.success(AgentTaskMode.BUILD, {
            content: deliverable,
            metadata: this.buildMetadata(request, {
              apiUrl: url,
              method,
              statusCode,
              duration,
              success: isSuccess,
              async: true,
            }),
          });
        } catch (error) {
          return TaskResponseDto.failure(
            AgentTaskMode.BUILD,
            error instanceof Error ? error.message : 'Task completion failed',
          );
        }
      }

      // Check if this is a LangGraph/forwardConverse agent
      // These agents need special handling but SHOULD still create deliverables
      const rawMetadata = definition.record?.metadata as Record<
        string,
        unknown
      >;
      const isLangGraphAgent = rawMetadata?.forwardConverse === true;

      if (isLangGraphAgent) {
        this.logger.log(
          `LangGraph agent ${definition.slug} - formatting response for deliverable creation`,
        );

        // Extract nested data from LangGraph response: { success: true, data: { ... } }
        const langGraphData =
          responseData && typeof responseData === 'object'
            ? (responseData as Record<string, unknown>).data || responseData
            : null;

        // Check if this is Marketing Swarm with versioned deliverable structure
        // Marketing Swarm returns: { data: { type: 'versioned', versions: [...], winner: {...} } }
        const langGraphDataObj = langGraphData as Record<
          string,
          unknown
        > | null;
        const hasVersionedDeliverable =
          langGraphDataObj?.type === 'versioned' &&
          Array.isArray(langGraphDataObj.versions);

        // Format content so createFromTaskResult can process it
        const langGraphContent = hasVersionedDeliverable
          ? {
              // Format as versioned deliverable for Marketing Swarm
              type: 'versioned',
              versions: langGraphDataObj.versions,
              winner: langGraphDataObj.winner,
              status: 'completed', // Ensure status is set so createFromTaskResult processes it
              ...langGraphDataObj,
            }
          : langGraphDataObj
            ? {
                // Include LangGraph-specific data for frontend extraction
                specialistOutputs: langGraphDataObj.specialistOutputs,
                legalMetadata: langGraphDataObj.legalMetadata,
                routingDecision: langGraphDataObj.routingDecision,
                response: langGraphDataObj.response,
                status: langGraphDataObj.status || 'completed', // Ensure status is set
                threadId: langGraphDataObj.threadId,
                // For CAD Agent and others, include the full response as output
                output: langGraphDataObj.response || formattedContent,
              }
            : { response: formattedContent, status: 'completed' };

        // Extract provider and model for metadata (same priority as earlier)
        const langGraphPayload = request.payload;
        const langGraphLlmOverride = langGraphPayload?.llmOverride as
          | { provider?: string; model?: string }
          | undefined;
        const langGraphConfig = langGraphPayload?.config as
          | { provider?: string; model?: string }
          | undefined;

        const langGraphProvider =
          langGraphLlmOverride?.provider ??
          langGraphConfig?.provider ??
          request.context?.provider ??
          null;
        const langGraphModel =
          langGraphLlmOverride?.model ??
          langGraphConfig?.model ??
          request.context?.model ??
          null;

        // Return response - controller will call createFromTaskResult which can now process it
        return TaskResponseDto.success(AgentTaskMode.BUILD, {
          content: langGraphContent,
          metadata: this.buildMetadata(request, {
            apiUrl: url,
            method,
            statusCode,
            duration,
            success: isSuccess,
            isLangGraph: true,
            ...(langGraphProvider && { provider: langGraphProvider }),
            ...(langGraphModel && { model: langGraphModel }),
          }),
        });
      }

      const targetDeliverableId = this.resolveDeliverableIdFromRequest(request);

      // Debug: Verify deliverablesService is available
      if (!this.deliverablesService) {
        this.logger.error('deliverablesService is undefined');
        throw new Error('DeliverablesService not injected');
      }
      if (typeof this.deliverablesService.executeAction !== 'function') {
        this.logger.error(
          'deliverablesService.executeAction is not a function',
          {
            deliverablesService: this.deliverablesService,
            type: typeof this.deliverablesService,
            constructor: this.deliverablesService?.constructor?.name,
            methods: Object.getOwnPropertyNames(
              Object.getPrototypeOf(this.deliverablesService),
            ),
          },
        );
        throw new Error('DeliverablesService.executeAction is not available');
      }

      // Extract provider and model for deliverable metadata
      // Priority: llmOverride (rerun) > payload.config > ExecutionContext
      const payloadForDeliverable = request.payload;
      const llmOverrideForDeliverable = payloadForDeliverable?.llmOverride as
        | { provider?: string; model?: string }
        | undefined;
      const configForDeliverable = payloadForDeliverable?.config as
        | { provider?: string; model?: string }
        | undefined;

      const deliverableProvider =
        llmOverrideForDeliverable?.provider ??
        configForDeliverable?.provider ??
        request.context?.provider ??
        null;
      const deliverableModel =
        llmOverrideForDeliverable?.model ??
        configForDeliverable?.model ??
        request.context?.model ??
        null;

      const deliverableResult = await this.deliverablesService.executeAction(
        'create',
        {
          title:
            ((request.payload as Record<string, unknown>)?.title as string) ||
            `API Response: ${definition.name}`,
          content: formattedContent,
          format: deliverableFormat,
          type: definition.config?.deliverable?.type || 'api-response',
          deliverableId: targetDeliverableId ?? undefined,
          agentName: definition.slug,
          organizationSlug: organizationSlug || 'default',
          taskId: taskId ?? undefined,
          metadata: {
            apiUrl: url,
            method,
            statusCode,
            duration,
            success: isSuccess,
            ...(deliverableProvider && { provider: deliverableProvider }),
            ...(deliverableModel && { model: deliverableModel }),
          },
        },
        // Use request.context directly - full ExecutionContext from transport-types
        request.context,
      );

      if (!deliverableResult.success) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          deliverableResult.error?.message || 'Failed to create deliverable',
        );
      }

      // Extract deliverable from result (createOrEnhance returns { deliverable, versions })
      const deliverableData = deliverableResult.data;

      // Ensure deliverable is accessible at payload.content.deliverable for frontend
      const contentWithDeliverable =
        deliverableData &&
        typeof deliverableData === 'object' &&
        'deliverable' in deliverableData
          ? deliverableData
          : { deliverable: deliverableData };

      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: contentWithDeliverable,
        metadata: this.buildMetadata(request, {
          apiUrl: url,
          method,
          statusCode,
          duration,
          success: isSuccess,
        }),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `API agent ${definition.slug} BUILD failed: ${errorMessage}`,
      );

      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        `Failed to execute API agent: ${errorMessage}`,
      );
    }
  }

  /**
   * Execute API call for CONVERSE mode
   *
   * NOTE: This duplicates HTTP request logic from executeBuild.
   * TODO: Refactor to extract shared HTTP request logic into a helper method.
   *
   * Key differences from executeBuild:
   * - Returns conversation message instead of deliverable
   * - Checks transport.api in addition to config.api (for data analyst agent)
   * - Uses requestTransform/responseTransform for LangGraph agents
   *
   * requestTransform: Maps frontend format to external API format
   *   Example: { question: "{{userMessage}}", userId: "{{userId}}" }
   *   Transforms: { userMessage: "how many users?" }
   *   Into: { question: "how many users?", userId: "..." }
   *
   * responseTransform: Extracts conversation message from API response
   *   Example: { content: "$.summary" }
   *   Extracts: summary field from response.data.summary
   *   Returns: Conversation message (not a deliverable)
   */
  private async executeApiCall(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
    mode: AgentTaskMode,
  ): Promise<TaskResponseDto> {
    try {
      // organizationSlug is required - fail fast if missing
      if (!organizationSlug) {
        return TaskResponseDto.failure(
          mode,
          'organizationSlug is required but was null or undefined',
        );
      }

      const userId = this.resolveUserId(request);
      const conversationId = this.resolveConversationId(request);
      const taskId =
        ((request.payload as Record<string, unknown>)?.taskId as
          | string
          | null) || null;

      if (!userId || !conversationId) {
        return TaskResponseDto.failure(
          mode,
          'Missing required userId or conversationId for API execution',
        );
      }

      // Check execution mode - handle websocket/polling differently
      const executionMode =
        ((request.payload as Record<string, unknown>)
          ?.executionMode as string) || 'immediate';

      // Register stream if using real-time/polling mode (for SSE progress updates)
      if (executionMode === 'real-time' || executionMode === 'polling') {
        this.logger.log(
          `🔌 API Agent ${definition.slug}: ${executionMode} mode detected - registering stream for progress updates`,
        );

        if (request.context) {
          const streamId = this.streamingService.registerStream(
            request.context,
            mode,
            request.userMessage ?? '',
          );
          this.logger.log(
            `✅ API Agent ${definition.slug}: Stream registered with streamId=${streamId} for progress updates`,
          );
        }
      }

      // Extract LLM configuration from payload (for observability and passing to LangGraph)
      const payload = request.payload;
      const config = payload?.config as
        | { provider?: string; model?: string }
        | undefined;
      const provider = config?.provider ?? null;
      const model = config?.model ?? null;

      // Get API configuration - check both config.api and transport.api
      // transport.api is used by data analyst and extended post writer agents (stored in endpoint field)
      // Note: transport.api.endpoint may be empty if database uses 'url' instead of 'endpoint'
      // So we check transport.raw?.url as fallback
      const apiConfig =
        this.asRecord(definition.config?.api) ??
        (definition.transport?.api
          ? {
              url:
                definition.transport.api.endpoint ||
                (definition.transport.raw &&
                typeof definition.transport.raw === 'object' &&
                'url' in definition.transport.raw &&
                typeof definition.transport.raw.url === 'string'
                  ? definition.transport.raw.url
                  : ''),
              method: definition.transport.api.method,
              headers: definition.transport.api.headers,
              timeout: definition.transport.api.timeout,
              requestTransform: definition.transport.api.requestTransform,
              responseTransform: definition.transport.api.responseTransform,
            }
          : null);
      if (!apiConfig) {
        return TaskResponseDto.failure(
          mode,
          'No API configuration found or URL missing',
        );
      }

      const urlTemplate =
        this.ensureString(apiConfig.url) ??
        this.ensureString(apiConfig.endpoint);
      if (!urlTemplate) {
        return TaskResponseDto.failure(
          mode,
          'API configuration missing URL string',
        );
      }

      // Create enriched request for interpolation
      // Include LLM config for passing to LangGraph endpoints
      const enrichedRequest = {
        ...request,
        userId,
        conversationId,
        taskId: taskId ?? undefined,
        userMessage: request.userMessage || '',
        payload: {
          ...(request.payload as Record<string, unknown>),
          provider,
          model,
        },
        llmSelection:
          provider && model
            ? {
                providerName: provider,
                modelName: model,
              }
            : undefined,
      };

      // Observability: Starting API call
      this.emitObservabilityEvent(
        'agent.progress',
        'Calling external API',
        request.context,
        {
          mode: request.mode,
          progress: 30,
        },
      );

      // Interpolate URL
      const url = this.interpolateString(urlTemplate, enrichedRequest);
      const method = (
        this.ensureString(apiConfig.method) ?? 'POST'
      ).toUpperCase();

      // Build headers
      const headersRecord = this.asRecord(apiConfig.headers);
      const headers = this.buildHeaders(
        headersRecord ? this.toPlainRecord(headersRecord) : {},
        enrichedRequest,
      );

      // Build request body - default includes all common fields
      // requestTransform is only used for special cases (e.g., n8n workflows with custom formats)
      // organizationSlug is already validated above
      let body: unknown = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const requestTransform = this.asRecord(apiConfig.requestTransform);
        if (requestTransform) {
          // Use requestTransform only if explicitly provided (for special cases)
          body = this.interpolateObject(
            this.toPlainRecord(requestTransform),
            enrichedRequest,
          );
          body = this.filterUnresolvedTemplates(body);

          // Ensure common fields are included even with custom transform
          if (body && typeof body === 'object') {
            const bodyObj = body as Record<string, unknown>;
            if (!('taskId' in bodyObj)) bodyObj.taskId = taskId;
            if (!('userId' in bodyObj)) bodyObj.userId = userId;
            if (!('conversationId' in bodyObj))
              bodyObj.conversationId = conversationId;
            if (!('organizationSlug' in bodyObj))
              bodyObj.organizationSlug = organizationSlug;
            if (provider && model && !('provider' in bodyObj))
              bodyObj.provider = provider;
            if (provider && model && !('model' in bodyObj))
              bodyObj.model = model;
          }
        } else if (apiConfig.body) {
          // Fallback to body config
          const bodyRecord = this.asRecord(apiConfig.body);
          if (bodyRecord) {
            body = this.interpolateObject(
              this.toPlainRecord(bodyRecord),
              enrichedRequest,
            );
            body = this.filterUnresolvedTemplates(body);
          }
        } else {
          // Default: Use ExecutionContext capsule as the single source of truth
          // All identity fields (taskId, userId, conversationId, agentSlug, orgSlug) are in context
          // Context is the capsule that flows through the entire system - no duplication

          // Extract documents and legalMetadata from request.metadata (set by controller's document processing)
          // LangGraph agents need documents in format: { name, content, type }
          // and legalMetadata at the top level for routing decisions
          const metadataDocuments = (request.metadata?.documents ||
            []) as Array<{
            filename?: string;
            extractedText?: string;
            mimeType?: string;
            legalMetadata?: unknown;
          }>;

          // Transform to LangGraph document format
          const documents = metadataDocuments
            .filter((doc) => doc.extractedText) // Only include docs with extracted text
            .map((doc) => ({
              name: doc.filename || 'unknown',
              content: doc.extractedText || '',
              type: doc.mimeType || 'application/octet-stream',
            }));

          // Extract legalMetadata from first document (for single document analysis)
          const firstDoc = metadataDocuments[0];
          const legalMetadata = firstDoc?.legalMetadata;

          if (documents.length > 0) {
            this.logger.log(
              `📄 [API-RUNNER] Including ${documents.length} document(s) with legalMetadata in LangGraph request (CONVERSE mode)`,
            );
          }

          body = {
            context: request.context,
            userMessage: request.userMessage || '',
            ...(documents.length > 0 ? { documents } : {}),
            ...(legalMetadata ? { legalMetadata } : {}),
          };
        }
      }

      this.logger.log(
        `Executing API call to ${url} for agent ${definition.slug} in ${mode} mode`,
      );

      // Execute HTTP request
      const startTime = Date.now();
      let response: unknown;

      try {
        if (!this.httpService) {
          throw new Error('HttpService not available');
        }
        // Use agent's configured timeout, falling back to execution.timeoutSeconds (from metadata), then default
        // Default 10 minutes (600000ms) to accommodate slow local models (Ollama/sovereign mode)
        const timeoutMs =
          this.ensureNumber(apiConfig.timeout) ??
          (definition.execution.timeoutSeconds
            ? definition.execution.timeoutSeconds * 1000
            : 600000);
        const observable = this.httpService.request({
          url,
          method: method,
          headers,
          data: body,
          timeout: timeoutMs,
          validateStatus: () => true,
        });

        response = await firstValueFrom(observable);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`API call failed: ${errorMessage}`, {
          url,
          method,
          error,
        });
        return TaskResponseDto.failure(
          mode,
          `API call failed: ${errorMessage}`,
        );
      }

      const responseTyped = response as {
        status: number;
        data: unknown;
        headers?: Record<string, unknown>;
      };
      const statusCode = responseTyped.status;
      const isSuccess = statusCode >= 200 && statusCode < 300;

      if (!isSuccess) {
        return TaskResponseDto.failure(
          mode,
          `API returned error status ${statusCode}: ${JSON.stringify(responseTyped.data)}`,
        );
      }

      const duration = Date.now() - startTime;

      // Observability: Processing API response
      this.emitObservabilityEvent(
        'agent.progress',
        'Processing API response',
        request.context,
        {
          mode: request.mode,
          progress: 60,
        },
      );

      // Transform response using responseTransform if available
      // responseTransform extracts conversation message from API response
      // Example: { content: "$.data.summary" } extracts response.data.summary
      // Note: responseTyped structure is { statusCode, duration, data: { success, data: {...} } }
      // So responseData = responseTyped.data = { success: true, data: { summary: "..." } }
      const responseData = responseTyped.data;

      // DEBUG: Log raw API response to trace HITL detection
      this.logger.debug(
        `🔍 [HITL-DEBUG] Raw API response for ${definition.slug}: ${JSON.stringify(responseData).substring(0, 500)}`,
      );

      // Check if response indicates HITL workflow (LangGraph agents return status: 'hitl_waiting')
      if (responseData && typeof responseData === 'object') {
        const dataObj = responseData as Record<string, unknown>;

        // LangGraph returns { success: true, data: { status: 'hitl_waiting', ... } }
        // Or sometimes { status: 'hitl_waiting', ... } directly
        const nestedData =
          dataObj.data && typeof dataObj.data === 'object'
            ? (dataObj.data as Record<string, unknown>)
            : null;

        const status = (nestedData?.status || dataObj.status) as
          | string
          | undefined;
        const hitlPending = (nestedData?.hitlPending || dataObj.hitlPending) as
          | boolean
          | undefined;

        this.logger.debug(
          `🔍 [HITL-DEBUG] Checking HITL: status=${status}, hitlPending=${hitlPending}`,
        );

        if (status === 'hitl_waiting' || hitlPending === true) {
          // Extract HITL payload from response
          const source = nestedData || dataObj;
          // Use taskId from the request - this is the ID that should be used for HITL operations
          // LangGraph uses taskId as thread_id internally
          const hitlTaskId = taskId || (source.taskId as string);
          const topic =
            (source.topic as string) ||
            (source.userMessage as string) ||
            request.userMessage ||
            'Generated content';
          const generatedContent = source.generatedContent as
            | Record<string, unknown>
            | undefined;

          this.logger.log(
            `✅ [HITL-DEBUG] Detected HITL waiting response: taskId=${hitlTaskId}, topic=${topic?.substring(0, 50)}...`,
          );

          return TaskResponseDto.hitlWaiting(
            {
              taskId: hitlTaskId,
              status: 'hitl_waiting',
              topic,
              hitlPending: true,
              generatedContent: generatedContent as
                | import('@orchestrator-ai/transport-types').HitlGeneratedContent
                | undefined,
            },
            {
              agentSlug: definition.slug,
              provider,
              model,
              apiUrl: url,
              method,
              statusCode,
              duration,
            },
          );
        }
      }

      let message: string = 'No response content';
      const metadata: Record<string, unknown> = {};

      const responseTransform = this.asRecord(apiConfig.responseTransform);
      if (responseTransform) {
        // Extract content using responseTransform.content path
        // Supports JSONPath-like notation: $.data.summary extracts data.summary
        const contentPath = this.ensureString(responseTransform.content);
        if (contentPath && responseData && typeof responseData === 'object') {
          // Handle nested paths like "data.summary" from "$.data.summary"
          const path = contentPath.replace(/^\$\./, '');
          const dataObj = responseData as Record<string, unknown>;

          // Support nested paths (e.g., "data.summary")
          const pathParts = path.split('.');
          let value: unknown = dataObj;
          for (const part of pathParts) {
            if (value && typeof value === 'object' && part in value) {
              value = (value as Record<string, unknown>)[part];
            } else {
              this.logger.debug(
                `Failed to extract path "${path}": part "${part}" not found in ${JSON.stringify(value)}`,
              );
              value = undefined;
              break;
            }
          }

          if (value !== undefined && value !== null) {
            message = extractString(value);
            this.logger.debug(
              `✅ Extracted message from path "${path}": ${message.substring(0, 100)}...`,
            );
          } else {
            // Path extraction failed - try fallback paths
            // These are ordered by likelihood/common patterns
            const fallbackPaths = [
              ['data', 'summary'], // LangGraph nested: { success: true, data: { summary: "..." } }
              ['data', 'message'], // Alternative nested structure
              ['summary'], // Direct summary field
              ['message'], // Direct message field
              ['content'], // Direct content field
              ['result'], // Direct result field
              ['response'], // Direct response field
            ];

            let extracted = false;
            for (const fallbackPath of fallbackPaths) {
              let fallbackValue: unknown = dataObj;
              let pathValid = true;
              for (const part of fallbackPath) {
                if (
                  fallbackValue &&
                  typeof fallbackValue === 'object' &&
                  part in fallbackValue
                ) {
                  fallbackValue = (fallbackValue as Record<string, unknown>)[
                    part
                  ];
                } else {
                  pathValid = false;
                  break;
                }
              }
              if (
                pathValid &&
                fallbackValue !== undefined &&
                fallbackValue !== null
              ) {
                // Only use string values, or convert objects to JSON
                if (typeof fallbackValue === 'string') {
                  message = fallbackValue;
                  this.logger.debug(
                    `✅ Extracted message from fallback path "${fallbackPath.join('.')}"`,
                  );
                  extracted = true;
                  break;
                } else if (typeof fallbackValue === 'object') {
                  // If it's an object, try to find a string field within it
                  const obj = fallbackValue as Record<string, unknown>;
                  const stringFields = [
                    'message',
                    'content',
                    'summary',
                    'text',
                    'response',
                  ];
                  for (const field of stringFields) {
                    if (obj[field] && typeof obj[field] === 'string') {
                      message = obj[field];
                      this.logger.debug(
                        `✅ Extracted message from fallback path "${fallbackPath.join('.')}.${field}"`,
                      );
                      extracted = true;
                      break;
                    }
                  }
                  if (extracted) break;
                }
              }
            }

            if (!extracted) {
              // Last resort: if responseData has a string field at the top level, use it
              // Otherwise, log warning but don't stringify the whole response (that breaks frontend)
              this.logger.warn(
                `⚠️ Could not extract message from path "${path}". Response keys: ${Object.keys(dataObj).join(', ')}`,
              );
              // Try to find any string value in the response
              const findStringValue = (
                obj: unknown,
                depth = 0,
              ): string | null => {
                if (depth > 3) return null; // Prevent infinite recursion
                if (typeof obj === 'string' && obj.length > 0) return obj;
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                  const record = obj as Record<string, unknown>;
                  // Check common message fields first
                  for (const key of [
                    'summary',
                    'message',
                    'content',
                    'text',
                    'response',
                  ]) {
                    if (key in record) {
                      const found = findStringValue(record[key], depth + 1);
                      if (found) return found;
                    }
                  }
                  // Then check all fields
                  for (const value of Object.values(record)) {
                    const found = findStringValue(value, depth + 1);
                    if (found) return found;
                  }
                }
                return null;
              };

              const foundString = findStringValue(dataObj);
              if (foundString) {
                message = foundString;
                this.logger.debug('✅ Found message via deep search');
              } else {
                // Final fallback: return a user-friendly message instead of raw JSON
                message =
                  'Response received but could not extract message content.';
                this.logger.error(
                  `❌ Failed to extract message. Full response structure: ${JSON.stringify(dataObj).substring(0, 500)}`,
                );
              }
            }
          }
        } else {
          message = extractString(responseData) || 'No response content';
        }

        // Extract metadata if specified
        const metadataTransform = this.asRecord(responseTransform.metadata);
        if (
          metadataTransform &&
          responseData &&
          typeof responseData === 'object'
        ) {
          const dataObj = responseData as Record<string, unknown>;
          for (const [key, path] of Object.entries(metadataTransform)) {
            const fieldPath = String(path).replace(/^\$\./, '');
            // Support nested paths
            const pathParts = fieldPath.split('.');
            let value: unknown = dataObj;
            for (const part of pathParts) {
              if (value && typeof value === 'object' && part in value) {
                value = (value as Record<string, unknown>)[part];
              } else {
                value = undefined;
                break;
              }
            }
            metadata[key] = value;
          }
        }
      } else {
        // Default: try to extract summary or message from response
        // Handle LangGraph response format: { success: true, data: { summary: "..." } }
        message = extractMessageFromResponse(responseData);
      }

      // For BUILD mode: Create deliverable with extracted message (markdown) instead of full JSON
      // Check if the extracted message looks like markdown
      const isMarkdown =
        message &&
        (message.includes('#') ||
          message.includes('**') ||
          message.includes('```') ||
          (message.includes('|') && message.includes('---'))); // Markdown table

      // Use the extracted message for deliverable content, not the full response
      // This ensures deliverables store just the markdown, matching other agents' behavior
      const deliverableFormat = isMarkdown
        ? 'markdown'
        : definition.config?.deliverable?.format || 'json';

      const formattedContent = isMarkdown
        ? message
        : this.formatApiResponse(responseData, deliverableFormat, {
            statusCode,
            headers: responseTyped.headers || {},
            duration,
          });

      // Observability: Completed
      this.emitObservabilityEvent(
        'agent.completed',
        'API call completed',
        request.context,
        {
          mode: request.mode,
          progress: 100,
        },
      );

      // Extract legalMetadata from LangGraph response if present
      // LangGraph returns: { success: true, data: { response: "...", legalMetadata: {...} } }
      let legalMetadata: unknown = undefined;
      if (responseData && typeof responseData === 'object') {
        const dataObj = responseData as Record<string, unknown>;
        const nestedData =
          dataObj.data && typeof dataObj.data === 'object'
            ? (dataObj.data as Record<string, unknown>)
            : null;
        legalMetadata = nestedData?.legalMetadata || dataObj.legalMetadata;
      }

      return TaskResponseDto.success(mode, {
        content: {
          message: formattedContent,
          ...(legalMetadata ? { legalMetadata } : {}),
        },
        metadata: {
          ...metadata,
          provider,
          model,
          apiUrl: url,
          method,
          statusCode,
          duration,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `API agent ${definition.slug} ${mode} failed: ${errorMessage}`,
      );
      return TaskResponseDto.failure(
        mode,
        `Failed to execute API agent: ${errorMessage}`,
      );
    }
  }

  /**
   * Extract message from API response using responseTransform
   * Shared logic used by both BUILD and CONVERSE modes
   */
  private extractMessageFromResponse(
    responseData: unknown,
    responseTransform: Record<string, unknown> | null,
  ): { message: string; metadata: Record<string, unknown> } {
    let message: string = 'No response content';
    const metadata: Record<string, unknown> = {};

    if (responseTransform) {
      // Extract content using responseTransform.content path
      const contentPath = this.ensureString(responseTransform.content);
      if (contentPath && responseData && typeof responseData === 'object') {
        const path = contentPath.replace(/^\$\./, '');
        const dataObj = responseData as Record<string, unknown>;

        const pathParts = path.split('.');
        let value: unknown = dataObj;
        for (const part of pathParts) {
          if (value && typeof value === 'object' && part in value) {
            value = (value as Record<string, unknown>)[part];
          } else {
            value = undefined;
            break;
          }
        }

        if (value !== undefined && value !== null) {
          message = extractString(value);
        } else {
          // Fallback paths
          const fallbackPaths = [
            ['data', 'summary'],
            ['data', 'message'],
            ['summary'],
            ['message'],
            ['content'],
            ['result'],
            ['response'],
          ];

          let extracted = false;
          for (const fallbackPath of fallbackPaths) {
            let fallbackValue: unknown = dataObj;
            let pathValid = true;
            for (const part of fallbackPath) {
              if (
                fallbackValue &&
                typeof fallbackValue === 'object' &&
                part in fallbackValue
              ) {
                fallbackValue = (fallbackValue as Record<string, unknown>)[
                  part
                ];
              } else {
                pathValid = false;
                break;
              }
            }
            if (
              pathValid &&
              fallbackValue !== undefined &&
              fallbackValue !== null
            ) {
              if (typeof fallbackValue === 'string') {
                message = fallbackValue;
                extracted = true;
                break;
              } else if (typeof fallbackValue === 'object') {
                const obj = fallbackValue as Record<string, unknown>;
                const stringFields = [
                  'message',
                  'content',
                  'summary',
                  'text',
                  'response',
                ];
                for (const field of stringFields) {
                  if (obj[field] && typeof obj[field] === 'string') {
                    message = obj[field];
                    extracted = true;
                    break;
                  }
                }
                if (extracted) break;
              }
            }
          }

          if (!extracted) {
            // Deep search for any string value
            const findStringValue = (
              obj: unknown,
              depth = 0,
            ): string | null => {
              if (depth > 3) return null;
              if (typeof obj === 'string' && obj.length > 0) return obj;
              if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const record = obj as Record<string, unknown>;
                for (const key of [
                  'summary',
                  'message',
                  'content',
                  'text',
                  'response',
                ]) {
                  if (key in record) {
                    const found = findStringValue(record[key], depth + 1);
                    if (found) return found;
                  }
                }
                for (const value of Object.values(record)) {
                  const found = findStringValue(value, depth + 1);
                  if (found) return found;
                }
              }
              return null;
            };

            const foundString = findStringValue(dataObj);
            if (foundString) {
              message = foundString;
            } else {
              message =
                'Response received but could not extract message content.';
            }
          }
        }
      } else {
        message = extractString(responseData) || 'No response content';
      }

      // Extract metadata if specified
      const metadataTransform = this.asRecord(responseTransform.metadata);
      if (
        metadataTransform &&
        responseData &&
        typeof responseData === 'object'
      ) {
        const dataObj = responseData as Record<string, unknown>;
        for (const [key, path] of Object.entries(metadataTransform)) {
          const fieldPath = String(path).replace(/^\$\./, '');
          const pathParts = fieldPath.split('.');
          let value: unknown = dataObj;
          for (const part of pathParts) {
            if (value && typeof value === 'object' && part in value) {
              value = (value as Record<string, unknown>)[part];
            } else {
              value = undefined;
              break;
            }
          }
          metadata[key] = value;
        }
      }
    } else {
      // Default extraction using helper function
      message = extractMessageFromResponse(responseData);
    }

    return { message, metadata };
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
    return Object.fromEntries(Object.entries(record)) as Record<
      string,
      unknown
    >;
  }

  private ensureString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private ensureNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  /**
   * Build request headers with interpolation and authentication
   */
  private buildHeaders(
    configHeaders: Record<string, unknown>,
    request: TaskRequestDto,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Orchestrator-AI/1.0',
    };

    // Add configured headers with interpolation
    for (const [key, value] of Object.entries(configHeaders)) {
      if (typeof value === 'string') {
        headers[key] = this.interpolateString(value, request);
      } else {
        headers[key] = String(value);
      }
    }

    return headers;
  }

  /**
   * Interpolate a string with request data
   * Supports {{payload.field}}, {{metadata.field}}, {{userMessage}}, {{taskId}}, {{conversationId}}, {{userId}} syntax
   * Also supports {{env.VAR_NAME}} for environment variables
   */
  private interpolateString(template: string, request: TaskRequestDto): string {
    return template.replace(
      /\{\{([^}]+)\}\}/g,
      (match: string, path: string) => {
        const trimmedPath = path.trim();
        const keys = trimmedPath.split('.');

        // Handle environment variables: {{env.VAR_NAME}}
        if (keys[0] === 'env' && keys.length === 2 && keys[1]) {
          const envVar = keys[1];
          const envValue = this.configService.get<string>(envVar);
          if (envValue !== undefined) {
            return envValue;
          }
          // No defaults - fail fast if required env vars are missing
          // Return empty string if env var not found (will be filtered out later)
          return '';
        }

        // Handle combined URL construction: {{env.AGENT_BASE_URL}}:{{env.API_PORT}}
        // This pattern appears in templates like "{{env.AGENT_BASE_URL}}:{{env.API_PORT}}/path"
        // We handle it here by checking if the next part of the template is :{{env.API_PORT}}
        // Actually, this is handled by the regex replacement above - each {{...}} is replaced separately

        // Handle request data interpolation
        let value: unknown = request;
        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return match; // Keep original if not found
          }
        }

        return typeof value === 'string' ? value : JSON.stringify(value);
      },
    );
  }

  /**
   * Interpolate an object recursively with request data
   */
  private interpolateObject(
    obj: Record<string, unknown>,
    request: TaskRequestDto,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, request);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateObject(
          value as Record<string, unknown>,
          request,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Filter out fields with unresolved templates or empty strings (from missing env vars)
   * This ensures optional fields like statusWebhook are omitted if they can't be resolved
   */
  private filterUnresolvedTemplates(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      // For non-objects, check if it's a string with unresolved templates
      if (typeof obj === 'string') {
        return obj.includes('{{') ? undefined : obj;
      }
      return obj;
    }

    const record = obj as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      // Skip empty strings (from missing env vars) and unresolved templates
      if (typeof value === 'string') {
        // Skip if empty, has unresolved templates, or is a malformed URL (e.g., http://localhost:/path)
        if (
          value === '' ||
          value.includes('{{') ||
          this.isMalformedUrl(value)
        ) {
          continue; // Skip this field
        }
        filtered[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively filter nested objects
        const filteredValue = this.filterUnresolvedTemplates(value);
        if (filteredValue !== undefined) {
          filtered[key] = filteredValue;
        }
      } else {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Combine AGENT_BASE_URL and API_PORT into a complete URL
   * Handles cases where the template has {{env.AGENT_BASE_URL}}:{{env.API_PORT}}
   */
  private combineBaseUrlAndPort(urlString: string): string {
    const agentBaseUrl = this.configService.get<string>('AGENT_BASE_URL');
    const apiPort = this.configService.get<string>('API_PORT');

    // If URL contains the pattern "AGENT_BASE_URL:API_PORT" after interpolation
    // and both env vars exist, ensure they're properly combined
    if (agentBaseUrl && apiPort) {
      // Check if URL starts with base URL but might be missing port
      if (urlString.startsWith(agentBaseUrl)) {
        // If URL is exactly the base URL or base URL + path without port, add port
        const expectedWithPort = `${agentBaseUrl}:${apiPort}`;
        if (
          !urlString.startsWith(expectedWithPort) &&
          urlString !== agentBaseUrl
        ) {
          // Replace base URL with base URL + port
          urlString = urlString.replace(agentBaseUrl, expectedWithPort);
        }
      }
    }

    return urlString;
  }

  /**
   * Check if a string is a malformed URL (e.g., http://localhost:/path when port is missing)
   */
  private isMalformedUrl(value: string): boolean {
    // Must be a string that looks like a URL
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return false; // Not a URL, let other validation handle it
    }

    // Check for empty host: http://:port/path (colon immediately after ://)
    if (value.match(/:\/\/:/)) {
      return true; // Malformed: empty host
    }

    // Check for empty port in URL: http://host:/path (colon followed directly by slash)
    // Pattern matches: :// followed by hostname (one or more non-:/ chars), then :/ (colon + slash with no port)
    if (value.match(/:\/\/[^/:]+:\//)) {
      return true; // Malformed: has colon-slash but no port number
    }

    // Also check for URLs with just colon and no slash after host (edge case)
    if (value.match(/:\/\/[^/:]+:$/)) {
      return true; // Malformed: ends with colon
    }

    // Try URL constructor as final validation
    try {
      new URL(value);
      return false; // Valid URL
    } catch {
      return true; // URL constructor threw, so it's malformed
    }
  }

  /**
   * Format API response based on output format
   */
  private formatApiResponse(
    data: unknown,
    format: string,
    metadata: {
      statusCode: number;
      headers: Record<string, unknown>;
      duration: number;
    },
  ): string {
    // If data is an object with a 'markdown' field, extract it directly
    if (data && typeof data === 'object' && 'markdown' in data) {
      const markdownContent = (data as { markdown: unknown }).markdown;
      return typeof markdownContent === 'string'
        ? markdownContent
        : String(markdownContent);
    }

    // If data is already a string (assumed to be markdown), return it directly
    if (typeof data === 'string') {
      return data;
    }

    // Legacy behavior: wrap in JSON structure
    if (format === 'json') {
      return JSON.stringify(
        {
          statusCode: metadata.statusCode,
          duration: metadata.duration,
          data,
        },
        null,
        2,
      );
    } else if (format === 'markdown') {
      let markdown = '# API Response\n\n';
      markdown += `**Status Code:** ${metadata.statusCode}\n`;
      markdown += `**Duration:** ${metadata.duration}ms\n\n`;
      markdown += '## Response Data\n\n';
      markdown += '```json\n';
      markdown += JSON.stringify(data, null, 2);
      markdown += '\n```\n';
      return markdown;
    } else {
      // Plain text or fallback
      return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Execute API call asynchronously (for websocket/polling modes)
   * This runs the same logic as executeBuild but without waiting for completion
   */
  private async executeApiCallAsync(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
    userId: string,
    conversationId: string,
    taskId: string | null,
  ): Promise<void> {
    try {
      this.logger.log(`🚀 Starting async API execution for task ${taskId}`);

      // Create enriched request
      const payload = request.payload;
      const config = payload?.config as
        | { provider?: string; model?: string }
        | undefined;
      const provider = config?.provider ?? null;
      const model = config?.model ?? null;

      const enrichedRequest = {
        ...request,
        userId,
        conversationId,
        taskId: taskId ?? undefined,
        payload: {
          ...(request.payload as Record<string, unknown>),
          provider,
          model,
        },
      };

      // Get API configuration (same as sync version)
      const apiConfig = this.asRecord(definition.config?.api);
      if (!apiConfig) {
        this.logger.error(`No API configuration found for ${definition.slug}`);
        return;
      }

      const urlTemplate =
        this.ensureString(apiConfig.url) ??
        this.ensureString(apiConfig.endpoint);
      if (!urlTemplate) {
        this.logger.error(
          `API configuration missing URL for ${definition.slug}`,
        );
        return;
      }

      // Execute HTTP request
      const url = this.interpolateString(urlTemplate, enrichedRequest);
      const method = (
        this.ensureString(apiConfig.method) ?? 'GET'
      ).toUpperCase();

      const headersRecord = this.asRecord(apiConfig.headers);
      const headers = this.buildHeaders(
        headersRecord ? this.toPlainRecord(headersRecord) : {},
        enrichedRequest,
      );

      let body: unknown = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method) && apiConfig.body) {
        const bodyRecord = this.asRecord(apiConfig.body);
        if (bodyRecord) {
          body = this.interpolateObject(
            this.toPlainRecord(bodyRecord),
            enrichedRequest,
          );
        } else if (typeof apiConfig.body === 'string') {
          body = this.interpolateString(apiConfig.body, enrichedRequest);
        } else {
          body = apiConfig.body;
        }
      }

      let queryParams: Record<string, unknown> = {};
      const queryParamsRecord = this.asRecord(apiConfig.queryParams);
      if (queryParamsRecord) {
        queryParams = this.interpolateObject(
          this.toPlainRecord(queryParamsRecord),
          enrichedRequest,
        );
      }

      this.logger.log(`📡 Making async API call to ${url}`);
      const startTime = Date.now();

      if (!this.httpService) {
        throw new Error('HttpService not available');
      }
      // Use agent's configured timeout, falling back to execution.timeoutSeconds (from metadata), then default
      // Default 10 minutes (600000ms) to accommodate slow local models (Ollama/sovereign mode)
      const timeoutMs =
        this.ensureNumber(apiConfig.timeout) ??
        (definition.execution.timeoutSeconds
          ? definition.execution.timeoutSeconds * 1000
          : 600000);
      const observable = this.httpService.request({
        url,
        method: method,
        headers,
        data: body,
        params: queryParams,
        timeout: timeoutMs,
        validateStatus: () => true,
      });

      const response = await firstValueFrom(observable);
      const duration = Date.now() - startTime;

      const responseTyped = response as {
        status: number;
        data: unknown;
        headers: Record<string, unknown>;
      };

      this.logger.log(
        `✅ Async API call completed: ${responseTyped.status} in ${duration}ms`,
      );

      // Format response and create deliverable
      const responseData = responseTyped.data;
      const formattedContent = this.formatApiResponse(
        responseData,
        definition.config?.deliverable?.format || 'json',
        {
          statusCode: responseTyped.status,
          headers: responseTyped.headers || {},
          duration,
        },
      );

      const targetDeliverableId = this.resolveDeliverableIdFromRequest(request);

      const deliverableResult = await this.deliverablesService.executeAction(
        'create',
        {
          title:
            ((request.payload as Record<string, unknown>)?.title as string) ||
            `API Response: ${definition.name}`,
          content: formattedContent,
          format: definition.config?.deliverable?.format || 'json',
          type: definition.config?.deliverable?.type || 'api-response',
          deliverableId: targetDeliverableId ?? undefined,
        },
        // Use request.context directly - full ExecutionContext from transport-types
        request.context,
      );

      // Emit completion event with deliverable
      if (taskId) {
        this.eventEmitter.emit(`task.completion.${taskId}`, {
          deliverable: deliverableResult.data,
        });

        this.logger.log(`📨 Emitted task completion event for ${taskId}`);
      }
    } catch (error) {
      this.logger.error(`❌ Async API execution failed:`, error);

      if (taskId) {
        this.eventEmitter.emit(`task.completion.${taskId}`, {
          error:
            error instanceof Error ? error.message : 'Async execution failed',
        });
      }
    }
  }
}
