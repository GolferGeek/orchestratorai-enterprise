import {
  TaskResponse,
  TaskResponsePayload,
  AgentTaskMode,
  HitlGeneratedContent,
  HitlStatus,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';

// Re-export shared types
export { TaskResponse, TaskResponsePayload };

export interface HumanResponsePayload {
  message: string;
  reason?: string;
}

/**
 * HITL Response payload for human-in-the-loop workflows
 * Note: Uses taskId consistently (LangGraph uses it as thread_id internally)
 */
export interface HitlResponsePayload {
  taskId: string;
  status: HitlStatus;
  topic: string;
  hitlPending: boolean;
  generatedContent?: HitlGeneratedContent;
  finalContent?: HitlGeneratedContent;
  deliverableId?: string;
  error?: string;
  duration?: number;
}

export class TaskResponseDto implements TaskResponse {
  constructor(
    public readonly success: boolean,
    public readonly mode: string,
    public readonly payload: TaskResponsePayload,
    public readonly humanResponse?: HumanResponsePayload,
    public readonly context?: ExecutionContext,
  ) {}

  static success(mode: string, payload: TaskResponsePayload) {
    return new TaskResponseDto(true, mode, payload);
  }

  /**
   * Return a new TaskResponseDto with context attached
   * Use this to add the ExecutionContext capsule to any response
   */
  withContext(ctx: ExecutionContext): TaskResponseDto {
    return new TaskResponseDto(
      this.success,
      this.mode,
      this.payload,
      this.humanResponse,
      ctx,
    );
  }

  static human(
    message: string,
    metadataOrReason?: string | Record<string, unknown>,
    maybeReason?: string,
  ) {
    let reason: string | undefined = undefined;
    let metadata: Record<string, unknown> | undefined = undefined;
    if (typeof metadataOrReason === 'string') {
      reason = metadataOrReason;
    } else if (metadataOrReason && typeof metadataOrReason === 'object') {
      metadata = metadataOrReason;
    }
    if (typeof maybeReason === 'string') {
      reason = maybeReason;
    }

    // Changed from 'orchestrate' to 'converse' - human review is not orchestration-specific
    return new TaskResponseDto(
      false,
      'converse',
      {
        content: {
          action: 'run_human_response',
          message,
          reason,
        },
        metadata: metadata || {},
      },
      {
        message,
        reason,
      },
    );
  }

  static failure(mode: string, reason: string) {
    return new TaskResponseDto(false, mode, {
      content: {},
      metadata: { reason },
    });
  }

  /**
   * Create a HITL waiting response - task is paused awaiting human decision
   */
  static hitlWaiting(
    payload: HitlResponsePayload,
    metadata?: Record<string, unknown>,
  ) {
    return new TaskResponseDto(true, AgentTaskMode.HITL, {
      content: {
        ...payload,
        status: 'hitl_waiting' as HitlStatus,
        hitlPending: true,
      },
      metadata: {
        ...metadata,
        hitlStatus: 'waiting',
      },
    });
  }

  /**
   * Create a HITL completed response - human approved or edited content
   */
  static hitlCompleted(
    payload: HitlResponsePayload,
    metadata?: Record<string, unknown>,
  ) {
    return new TaskResponseDto(true, AgentTaskMode.HITL, {
      content: {
        ...payload,
        status: 'completed' as HitlStatus,
        hitlPending: false,
      },
      metadata: {
        ...metadata,
        hitlStatus: 'completed',
      },
    });
  }

  /**
   * Create a HITL rejected response - human rejected content
   */
  static hitlRejected(
    payload: HitlResponsePayload,
    metadata?: Record<string, unknown>,
  ) {
    return new TaskResponseDto(true, AgentTaskMode.HITL, {
      content: {
        ...payload,
        status: 'rejected' as HitlStatus,
        hitlPending: false,
      },
      metadata: {
        ...metadata,
        hitlStatus: 'rejected',
      },
    });
  }

  /**
   * Create a HITL status response - for status queries
   */
  static hitlStatus(
    payload: HitlResponsePayload,
    metadata?: Record<string, unknown>,
  ) {
    return new TaskResponseDto(true, AgentTaskMode.HITL, {
      content: payload,
      metadata: {
        ...metadata,
        hitlStatus: payload.status,
      },
    });
  }
}
