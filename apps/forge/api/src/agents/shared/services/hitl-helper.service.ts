import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityService } from './observability.service';

/**
 * Human-in-the-loop decision types
 */
export type HitlDecision = 'approve' | 'edit' | 'reject';

/**
 * HITL request structure for interrupts
 */
export interface HitlRequest {
  taskId: string;
  threadId: string;
  agentSlug: string;
  userId: string;
  conversationId?: string;
  organizationSlug?: string;
  pendingContent: unknown;
  contentType: string;
  message?: string;
}

/**
 * HITL response structure after resume
 */
export interface HitlResponse {
  decision: HitlDecision;
  editedContent?: unknown;
  feedback?: string;
}

/**
 * State required for HITL operations
 */
export interface HitlState {
  hitlRequest?: HitlRequest;
  hitlResponse?: HitlResponse;
  hitlStatus?: 'none' | 'waiting' | 'resumed';
}

/**
 * HITLHelperService
 *
 * Helper service for managing human-in-the-loop patterns in LangGraph workflows.
 *
 * IMPORTANT: This service does NOT call interrupt() itself. The interrupt() function
 * must be called directly in graph nodes. This service only handles:
 * - Preparing state for HITL interrupts
 * - Emitting observability events
 * - Processing resume responses
 *
 * Usage in graph nodes:
 * ```typescript
 * // In a graph node
 * const hitlState = this.hitlHelper.prepareInterrupt({...});
 * const interruptValue = interrupt({ reason: 'review', ...hitlState.hitlRequest });
 * // Graph pauses here until resume
 * ```
 */
@Injectable()
export class HITLHelperService {
  private readonly logger = new Logger(HITLHelperService.name);

  constructor(private readonly observability: ObservabilityService) {}

  /**
   * Prepare state for an HITL interrupt.
   * Call this BEFORE calling interrupt() in your graph node.
   *
   * Returns updated state with HITL request info and emits observability event.
   */
  async prepareInterrupt<S extends HitlState>(
    currentState: S,
    request: HitlRequest,
    executionContext: ExecutionContext,
  ): Promise<S> {
    this.logger.log(
      `Preparing HITL interrupt for task ${request.taskId}, thread ${request.threadId}`,
    );

    await this.observability.emitHitlWaiting(
      executionContext,
      request.threadId,
      request.pendingContent,
      request.message || `Awaiting review for ${request.contentType}`,
    );

    return {
      ...currentState,
      hitlRequest: request,
      hitlStatus: 'waiting' as const,
    };
  }

  /**
   * Process an HITL resume response.
   * Call this after the graph resumes from interrupt.
   *
   * Returns updated state with HITL response and appropriate content.
   */
  async processResume<S extends HitlState>(
    currentState: S,
    response: HitlResponse,
    executionContext: ExecutionContext,
  ): Promise<S> {
    const request = currentState.hitlRequest;
    if (!request) {
      throw new Error('Cannot process resume without prior HITL request');
    }

    this.logger.log(
      `Processing HITL resume for task ${request.taskId}: ${response.decision}`,
    );

    await this.observability.emitHitlResumed(
      executionContext,
      request.threadId,
      response.decision,
      response.feedback || `Decision: ${response.decision}`,
    );

    return {
      ...currentState,
      hitlResponse: response,
      hitlStatus: 'resumed' as const,
    };
  }

  /**
   * Get the content to use based on HITL decision.
   * - approve: returns original pending content
   * - edit: returns edited content
   * - reject: returns null (caller should handle rejection)
   */
  getResolvedContent<T>(state: HitlState): T | null {
    if (!state.hitlResponse || !state.hitlRequest) {
      return null;
    }

    switch (state.hitlResponse.decision) {
      case 'approve':
        return state.hitlRequest.pendingContent as T;
      case 'edit':
        return (state.hitlResponse.editedContent as T) || null;
      case 'reject':
        return null;
      default:
        return null;
    }
  }

  /**
   * Check if the HITL decision was rejection
   */
  wasRejected(state: HitlState): boolean {
    return state.hitlResponse?.decision === 'reject';
  }

  /**
   * Check if there's a pending HITL request
   */
  isWaiting(state: HitlState): boolean {
    return state.hitlStatus === 'waiting';
  }

  /**
   * Check if HITL has been resumed
   */
  isResumed(state: HitlState): boolean {
    return state.hitlStatus === 'resumed';
  }

  /**
   * Clear HITL state after processing
   */
  clearHitlState<S extends HitlState>(state: S): S {
    return {
      ...state,
      hitlRequest: undefined,
      hitlResponse: undefined,
      hitlStatus: 'none' as const,
    };
  }

  /**
   * Build interrupt value for the LangGraph interrupt() call.
   * Use this to create the value passed to interrupt().
   */
  buildInterruptValue(request: HitlRequest): Record<string, unknown> {
    return {
      reason: 'human_review',
      taskId: request.taskId,
      threadId: request.threadId,
      agentSlug: request.agentSlug,
      userId: request.userId,
      conversationId: request.conversationId,
      contentType: request.contentType,
      pendingContent: request.pendingContent,
      message: request.message,
    };
  }
}
