import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ObservabilityWebhookService,
  ObservabilityEventsService,
  type ObservabilityEventRecord,
} from '@orchestratorai/planes/observability';
import {
  ExecutionContext,
  isExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Workflow Status Update
 * Received from LangGraph agents, coded function agents, or any external workflow system.
 * ExecutionContext is REQUIRED — it is the capsule that flows through the entire system.
 */
interface WorkflowStatusUpdate {
  // Required fields
  conversationId: string;
  status: string;
  timestamp: string;

  // ExecutionContext capsule — REQUIRED
  context: ExecutionContext;

  // User message that triggered the task
  userMessage?: string;

  // Mode (plan, build, converse)
  mode?: string;

  // Optional workflow identification
  executionId?: string;
  workflowId?: string;
  workflowName?: string;

  // Optional progress fields
  step?: string;
  percent?: number;
  message?: string;
  node?: string;
  stage?: string;
  results?: Record<string, unknown>;

  // Optional sequence tracking
  sequence?: number;
  totalSteps?: number;

  // Nested data object
  data?: {
    sequence?: number;
    totalSteps?: number;
    [key: string]: unknown;
  };

  [key: string]: unknown;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  // Store status history per task
  private taskStatusHistory: Map<string, Record<string, unknown>[]> = new Map();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly observabilityService: ObservabilityWebhookService,
    private readonly observabilityEvents: ObservabilityEventsService,
  ) {}

  /**
   * Receive status updates from workflow systems (LangGraph, coded agents, etc.)
   * POST /webhooks/status
   *
   * ExecutionContext is REQUIRED — webhooks without valid context are rejected.
   */
  @Post('status')
  @HttpCode(204)
  async handleStatusUpdate(
    @Body() update: WorkflowStatusUpdate,
  ): Promise<void> {
    this.logger.log(
      `[WEBHOOK] Received status update: ${JSON.stringify({
        conversationId: update.conversationId,
        status: update.status,
        step: update.step,
        message: update.message?.substring(0, 50),
        hasContext: !!update.context,
      })}`,
    );

    if (!update.conversationId) {
      this.logger.warn('[WEBHOOK] Rejected: missing conversationId');
      return;
    }

    if (!update.context || !isExecutionContext(update.context)) {
      this.logger.warn(
        `[WEBHOOK] Rejected: missing or invalid ExecutionContext for task ${update.conversationId}`,
      );
      return;
    }

    this.logger.log(
      `[WEBHOOK] Context validated: userId=${update.context.userId}, conversationId=${update.context.conversationId}, agentSlug=${update.context.agentSlug}, orgSlug=${update.context.orgSlug}`,
    );

    // Build status history for this task
    if (!this.taskStatusHistory.has(update.conversationId)) {
      this.taskStatusHistory.set(update.conversationId, []);
    }

    const history = this.taskStatusHistory.get(update.conversationId)!;

    const sequence =
      update.sequence || update.data?.sequence || history.length + 1;
    const totalStepsFromUpdate = update.totalSteps || update.data?.totalSteps;

    const statusEntry = {
      timestamp: update.timestamp || new Date().toISOString(),
      status: update.status,
      step: update.step,
      message: update.message,
      sequence,
      totalSteps: totalStepsFromUpdate,
      data: update,
    };

    history.push(statusEntry);

    const stepName =
      update.step || update.stage || update.node || update.status;
    const stepIndex = this.calculateStepIndex(update.status, update.step);
    const totalStepsEstimated = this.estimateTotalSteps(update.status);
    const progress = update.percent ?? this.calculateProgress(update.status);

    // Emit workflow step progress event
    this.eventEmitter.emit('workflow.step.progress', {
      taskId: update.conversationId,
      step: stepName,
      stepIndex,
      totalSteps: totalStepsEstimated,
      status: update.status,
      message: update.message,
      progress,
    });

    // Emit A2A stream chunk for real-time SSE to frontend
    this.eventEmitter.emit('agent.stream.chunk', {
      context: update.context,
      streamId: update.conversationId,
      mode: update.mode || 'build',
      userMessage: update.userMessage || '',
      timestamp: new Date().toISOString(),
      chunk: {
        type: 'progress',
        content: update.message || stepName,
        metadata: {
          step: stepName,
          sequence,
          totalSteps: totalStepsFromUpdate,
          status: update.status,
          progress,
          mode: update.mode,
        },
      },
    });

    // Send the complete status history via event
    const eventData = {
      executionId: update.executionId,
      workflowId: update.workflowId,
      workflowName: update.workflowName,
      status: update.status,
      step: stepName,
      progress,
      timestamp: update.timestamp,
      conversationId: update.context.conversationId,
      statusHistory: history,
      data: update,
    };

    this.eventEmitter.emit('workflow.status.update', {
      taskId: update.conversationId,
      event: 'workflow_status_update',
      data: eventData,
    });

    this.eventEmitter.emit('workflow.status_update', {
      taskId: update.conversationId,
      conversationId: update.context.conversationId,
      executionId: update.executionId,
      status: update.status,
      progress,
      data: update,
    });

    // Store observability event and broadcast to admin stream
    await this.storeAndBroadcastObservabilityEvent(update, {
      stepName,
      progress,
      sequence,
      totalStepsFromUpdate,
    });

    this.logger.log(
      `[WEBHOOK] Status update processed successfully for task ${update.conversationId}`,
    );
  }

  /**
   * Store observability event in database and broadcast to admin clients.
   * Context is guaranteed to be valid (validated in handleStatusUpdate).
   */
  private async storeAndBroadcastObservabilityEvent(
    update: WorkflowStatusUpdate,
    computed: {
      stepName: string;
      progress: number;
      sequence: number;
      totalStepsFromUpdate?: number;
    },
  ): Promise<void> {
    this.logger.log(
      `[OBSERVABILITY] Building event for task ${update.conversationId}, status: ${update.status}`,
    );

    const now = Date.now();
    const conversationId = update.conversationId;

    const isValidUuid = (str: string | undefined | null): boolean => {
      if (!str) return false;
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    const validUserId = isValidUuid(update.context.userId)
      ? update.context.userId
      : null;
    const validConversationId = isValidUuid(update.context.conversationId)
      ? update.context.conversationId
      : null;

    const username = update.context.userId;

    const eventData: ObservabilityEventRecord = {
      context: update.context,
      source_app: 'orchestrator-ai',
      hook_event_type: update.status,
      status: update.status,
      message: update.message || null,
      progress: computed.progress,
      step: computed.stepName,
      payload: {
        ...update,
        sequence: computed.sequence,
        totalSteps: computed.totalStepsFromUpdate,
        username,
      },
      timestamp: now,
    };

    // Store in database
    const { error: dbError } = await this.db
      .from(null, 'observability_events')
      .insert({
        hook_event_type: update.status,
        source_app: 'orchestrator-ai',
        task_id: conversationId,
        user_id: validUserId,
        conversation_id: validConversationId,
        agent_slug: update.context.agentSlug || null,
        organization_slug: update.context.orgSlug || null,
        mode: (eventData.payload as Record<string, unknown>)?.mode || 'build',
        status: update.status,
        message: eventData.message || null,
        progress: eventData.progress || null,
        step: eventData.step || null,
        payload: eventData.payload || {},
        timestamp: now,
      });

    if (dbError) {
      this.logger.error(
        `[OBSERVABILITY] Failed to store observability event: ${dbError.message}`,
        dbError,
      );
    }

    // Emit to admin clients via EventEmitter
    this.eventEmitter.emit('observability.event', {
      ...eventData,
      eventType: update.status,
    });

    // Push into in-memory reactive buffer for shared SSE streams
    void this.observabilityEvents.push(eventData);
  }

  private calculateStepIndex(status: string, step?: string): number {
    const statusMap: Record<string, number> = {
      started: 0,
      initialization: 0,
      in_progress: 1,
      processing: 2,
      web_post_generated: 1,
      seo_content_generated: 2,
      social_content_generated: 3,
      completed: 4,
    };
    return statusMap[status] ?? statusMap[step || ''] ?? 1;
  }

  private estimateTotalSteps(_status: string): number {
    return 5;
  }

  private calculateProgress(status: string): number {
    const progressMap: Record<string, number> = {
      started: 1,
      initialization: 1,
      in_progress: 25,
      web_post_generated: 25,
      seo_content_generated: 50,
      social_content_generated: 75,
      completed: 100,
      failed: 0,
      error: 0,
    };
    return progressMap[status] ?? 50;
  }
}
