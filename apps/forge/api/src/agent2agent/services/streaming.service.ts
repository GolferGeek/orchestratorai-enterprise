/**
 * @fileoverview
 * Streaming Service - SSE Protocol Implementation
 *
 * This file implements the Server-Sent Events (SSE) streaming protocol for
 * real-time agent task progress updates in the Orchestrator AI A2A system.
 *
 * ## Client Integration Guide
 *
 * ### Step 1: Create a Task
 * ```typescript
 * const response = await fetch('/api/agent/execute', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     mode: 'build',
 *     message: 'Create a new feature'
 *   })
 * });
 * const { streamId } = await response.json();
 * ```
 *
 * ### Step 2: Connect to SSE Stream
 * ```typescript
 * const eventSource = new EventSource(`/api/agent/stream/${streamId}`);
 *
 * // Handle progress updates
 * eventSource.addEventListener('agent.stream.chunk', (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Progress:', data.chunk.content);
 *   console.log('Step:', data.chunk.metadata.step);
 *   console.log('Progress %:', data.chunk.metadata.progress);
 * });
 *
 * // Handle completion
 * eventSource.addEventListener('agent.stream.complete', (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Task completed!');
 *   eventSource.close();
 * });
 *
 * // Handle errors
 * eventSource.addEventListener('agent.stream.error', (event) => {
 *   const data = JSON.parse(event.data);
 *   console.error('Task failed:', data.error);
 *   eventSource.close();
 * });
 *
 * // Handle connection errors
 * eventSource.onerror = (error) => {
 *   console.error('Connection error:', error);
 *   eventSource.close();
 * };
 * ```
 *
 * ### Event Types Reference
 *
 * #### agent.stream.chunk (Progress Update)
 * ```json
 * {
 *   "context": {
 *     "orgSlug": "acme-corp",
 *     "userId": "user-123",
 *     "conversationId": "conv-456",
 *     "taskId": "task-789",
 *     "agentSlug": "orchestrator"
 *   },
 *   "streamId": "task-789",
 *   "mode": "build",
 *   "userMessage": "Create a new feature",
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "chunk": {
 *     "type": "progress",
 *     "content": "Analyzing requirements...",
 *     "metadata": {
 *       "step": "analysis",
 *       "progress": 25,
 *       "status": "in_progress",
 *       "sequence": 1,
 *       "totalSteps": 4
 *     }
 *   }
 * }
 * ```
 *
 * #### agent.stream.complete (Task Completion)
 * ```json
 * {
 *   "context": { ... },
 *   "streamId": "task-789",
 *   "mode": "build",
 *   "userMessage": "Create a new feature",
 *   "timestamp": "2024-01-15T10:35:00.000Z",
 *   "type": "complete"
 * }
 * ```
 *
 * #### agent.stream.error (Task Failure)
 * ```json
 * {
 *   "context": { ... },
 *   "streamId": "task-789",
 *   "mode": "build",
 *   "userMessage": "Create a new feature",
 *   "timestamp": "2024-01-15T10:33:00.000Z",
 *   "type": "error",
 *   "error": "Failed to connect to external agent API"
 * }
 * ```
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ExecutionContext,
  AgentStreamChunkData,
  AgentStreamCompleteData,
  AgentStreamErrorData,
} from '@orchestrator-ai/transport-types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskStatusService } from '../tasks/task-status.service';
import {
  ObservabilityEventsService,
  ObservabilityEventRecord,
} from '../../observability/observability-events.service';

/**
 * Streaming Service - SSE Protocol Implementation
 *
 * Centralized service for managing Server-Sent Events (SSE) streaming in the A2A protocol.
 * Provides real-time progress updates for long-running agent tasks.
 *
 * ## Responsibilities
 * - Registers stream sessions and creates taskId <-> streamId mappings
 * - Emits properly formatted A2A SSE events with full ExecutionContext
 * - Pushes events to ObservabilityEventsService for admin monitoring
 * - Used by both BaseAgentRunner (when creating tasks) and WebhookController (when receiving updates)
 *
 * ## SSE Event Types
 * This service emits three types of SSE events following the A2A protocol:
 *
 * 1. **agent.stream.chunk** - Progress updates during task execution
 *    - Contains incremental progress information
 *    - May include step details, status, and content
 *    - Can be emitted multiple times per task
 *
 * 2. **agent.stream.complete** - Task completion notification
 *    - Emitted once when task completes successfully
 *    - Signals end of stream
 *
 * 3. **agent.stream.error** - Error notification
 *    - Emitted when task fails
 *    - Contains error message
 *    - Signals end of stream
 *
 * ## Event Flow
 * ```
 * 1. Client creates task → registerStream() returns streamId
 * 2. Client connects to SSE endpoint with streamId
 * 3. Agent execution begins → emitProgress() called multiple times
 * 4. Agent completes → emitComplete() OR emitError()
 * 5. Stream closes
 * ```
 *
 * ## A2A Protocol Compliance
 * All events include:
 * - ExecutionContext (orgSlug, userId, conversationId, taskId, agentSlug)
 * - ISO timestamp
 * - streamId (equals taskId)
 * - mode (build, converse, plan, hitl)
 * - userMessage (original user request)
 *
 * ## Integration Points
 * - **BaseAgentRunner**: Calls registerStream() and emitProgress/Complete/Error
 * - **WebhookController**: Receives webhook callbacks and calls emitProgress()
 * - **TaskStatusService**: Manages stream session registration
 * - **ObservabilityEventsService**: Receives all events for admin monitoring
 *
 * @see {@link AgentStreamChunkData} for chunk event payload format
 * @see {@link AgentStreamCompleteData} for complete event payload format
 * @see {@link AgentStreamErrorData} for error event payload format
 *
 * @example
 * ```typescript
 * // 1. Register stream
 * const streamId = streamingService.registerStream(context, 'build', 'Create a new feature');
 *
 * // 2. Emit progress
 * streamingService.emitProgress(
 *   context,
 *   'Analyzing requirements...',
 *   'Create a new feature',
 *   { step: 'analysis', progress: 25 }
 * );
 *
 * // 3. Complete or error
 * streamingService.emitComplete(context, 'Create a new feature', 'build');
 * // OR
 * streamingService.emitError(context, 'Create a new feature', 'build', 'Failed to connect');
 * ```
 */
@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly taskStatusService: TaskStatusService,
    private readonly observabilityEvents: ObservabilityEventsService,
  ) {}

  /**
   * Register a new stream session for a task.
   *
   * Called by agent runners when creating a task in SSE mode. Registers the
   * stream session with TaskStatusService to enable SSE endpoint discovery.
   *
   * For simplicity, streamId equals taskId - the frontend already knows the
   * taskId from the task creation response, so it can immediately connect to
   * the SSE endpoint using that ID.
   *
   * @param context - ExecutionContext containing task metadata
   * @param _mode - Agent mode (build, converse, plan, hitl) - currently unused
   * @param _userMessage - Original user message - currently unused
   * @returns streamId to be returned to the frontend (equals taskId)
   *
   * @example
   * ```typescript
   * const streamId = registerStream(context, 'build', 'Create a feature');
   * // Returns: context.taskId (e.g., 'task-123')
   * // Frontend can now connect to: GET /agent/stream/:streamId
   * ```
   */
  registerStream(
    context: ExecutionContext,
    _mode: string,
    _userMessage: string,
  ): string {
    // Use taskId as streamId for simplicity - frontend already knows the taskId
    const streamId = context.taskId;

    // Register stream session in task-status service
    // This allows SSE connections to find the stream
    this.taskStatusService.registerStreamSession({
      taskId: context.taskId,
      streamId,
      agentSlug: context.agentSlug,
      organizationSlug: context.orgSlug || 'global',
      userId: context.userId,
      conversationId: context.conversationId,
    });

    return streamId;
  }

  /**
   * Emit a progress update (chunk) event.
   *
   * Emits an 'agent.stream.chunk' event following the A2A protocol format.
   * Called by webhook controller when receiving status updates from external agents,
   * or by agent runners during task execution.
   *
   * ## Event Payload Format (AgentStreamChunkData)
   * ```typescript
   * {
   *   context: ExecutionContext,        // Full execution context
   *   streamId: string,                 // Stream ID (equals taskId)
   *   mode: 'build' | 'converse' | ..., // Agent mode
   *   userMessage: string,              // Original user request
   *   timestamp: string,                // ISO 8601 timestamp
   *   chunk: {
   *     type: 'progress',               // Chunk type (always 'progress')
   *     content: string,                // Progress message
   *     metadata: {
   *       step?: string,                // Current step name
   *       progress?: number,            // Progress percentage (0-100)
   *       status?: string,              // Status (e.g., 'in_progress')
   *       sequence?: number,            // Sequence number for ordering
   *       totalSteps?: number,          // Total number of steps
   *       mode?: string,                // Override mode if needed
   *       [key: string]: unknown        // Additional custom metadata
   *     }
   *   }
   * }
   * ```
   *
   * ## SSE Wire Format
   * When sent over SSE, the event is formatted as:
   * ```
   * event: agent.stream.chunk
   * data: {"context":{...},"streamId":"task-123","mode":"build",...}
   * ```
   *
   * @param context - ExecutionContext containing task metadata
   * @param content - Human-readable progress message
   * @param userMessage - Original user request message
   * @param metadata - Optional metadata with step, progress, etc.
   *
   * @example
   * ```typescript
   * emitProgress(
   *   context,
   *   'Analyzing requirements...',
   *   'Create a new feature',
   *   {
   *     step: 'analysis',
   *     progress: 25,
   *     status: 'in_progress',
   *     sequence: 1,
   *     totalSteps: 4
   *   }
   * );
   * ```
   */
  emitProgress(
    context: ExecutionContext,
    content: string,
    userMessage: string,
    metadata?: {
      step?: string;
      progress?: number;
      status?: string;
      sequence?: number;
      totalSteps?: number;
      mode?: string;
      [key: string]: unknown;
    },
  ): void {
    const eventPayload: AgentStreamChunkData = {
      context,
      streamId: context.taskId,
      mode: metadata?.mode || 'build',
      userMessage,
      timestamp: new Date().toISOString(),
      chunk: {
        type: 'progress',
        content,
        metadata: metadata || {},
      },
    };

    // Emit A2A formatted stream chunk event (for user-facing SSE)
    this.eventEmitter.emit('agent.stream.chunk', eventPayload);

    // Push to observability buffer (for admin monitoring)
    this.pushToObservability(context, 'agent.stream.chunk', content, metadata);
  }

  /**
   * Push event to ObservabilityEventsService for admin monitoring.
   *
   * Creates an observability event record and pushes it to the buffer.
   * This enables admin monitoring dashboards to track agent task progress.
   *
   * The observability event includes:
   * - Full ExecutionContext
   * - Event type (e.g., 'agent.stream.chunk')
   * - Human-readable message
   * - Progress and step information (if available)
   * - Complete metadata payload
   * - Numeric timestamp (milliseconds since epoch)
   *
   * @param context - ExecutionContext
   * @param eventType - Event type identifier
   * @param message - Human-readable message (null for events without message)
   * @param metadata - Optional metadata (progress, step, etc.)
   *
   * Note: Uses void to explicitly ignore the promise returned by push().
   * Observability events are fire-and-forget to avoid blocking stream emissions.
   */
  private pushToObservability(
    context: ExecutionContext,
    eventType: string,
    message: string | null,
    metadata?: Record<string, unknown>,
  ): void {
    const observabilityEvent: ObservabilityEventRecord = {
      context,
      source_app: 'orchestrator-ai',
      hook_event_type: eventType,
      status: eventType,
      message,
      progress: (metadata?.progress as number) ?? null,
      step: (metadata?.step as string) ?? null,
      payload: metadata || {},
      timestamp: Date.now(),
    };

    this.logger.log(
      `📊 Pushing ${eventType} to observability buffer for task ${context.taskId}`,
    );
    void this.observabilityEvents.push(observabilityEvent);
  }

  /**
   * Emit an observability-only event (no user-facing SSE).
   *
   * Used for internal agent lifecycle events that should be tracked in the
   * observability system but not sent to end users via SSE. This is useful
   * for events like:
   * - agent.started - Agent execution begins
   * - agent.progress - Internal progress checkpoints
   * - agent.completed - Agent execution completes
   *
   * Unlike emitProgress(), this method does NOT emit SSE events to the
   * event emitter. It only pushes to the observability buffer.
   *
   * @param context - ExecutionContext containing task metadata
   * @param eventType - Event type (e.g., 'agent.started', 'agent.progress', 'agent.completed')
   * @param message - Human-readable message describing the event
   * @param metadata - Additional metadata (progress, step, mode, etc.)
   *
   * @example
   * ```typescript
   * // Log agent start without sending SSE to user
   * emitObservabilityOnly(
   *   context,
   *   'agent.started',
   *   'Agent execution started',
   *   { mode: 'build' }
   * );
   *
   * // Log internal checkpoint
   * emitObservabilityOnly(
   *   context,
   *   'agent.checkpoint',
   *   'Completed requirements gathering',
   *   { step: 'requirements', progress: 40 }
   * );
   * ```
   */
  emitObservabilityOnly(
    context: ExecutionContext,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    // Push directly to observability buffer without emitting user-facing SSE
    this.pushToObservability(context, eventType, message, metadata);
  }

  /**
   * Emit a completion event.
   *
   * Signals that the agent task has completed successfully. This is the final
   * event in the SSE stream lifecycle and indicates the client can close the
   * connection.
   *
   * ## Event Payload Format (AgentStreamCompleteData)
   * ```typescript
   * {
   *   context: ExecutionContext,        // Full execution context
   *   streamId: string,                 // Stream ID (equals taskId)
   *   mode: 'build' | 'converse' | ..., // Agent mode
   *   userMessage: string,              // Original user request
   *   timestamp: string,                // ISO 8601 timestamp
   *   type: 'complete'                  // Event type
   * }
   * ```
   *
   * ## SSE Wire Format
   * ```
   * event: agent.stream.complete
   * data: {"context":{...},"streamId":"task-123","type":"complete",...}
   * ```
   *
   * @param context - ExecutionContext containing task metadata
   * @param userMessage - Original user request message
   * @param mode - Agent mode (build, converse, plan, hitl)
   *
   * @example
   * ```typescript
   * emitComplete(context, 'Create a new feature', 'build');
   * // Client receives completion event and closes SSE connection
   * ```
   */
  emitComplete(
    context: ExecutionContext,
    userMessage: string,
    mode: string,
  ): void {
    const eventPayload: AgentStreamCompleteData = {
      context,
      streamId: context.taskId,
      mode,
      userMessage,
      timestamp: new Date().toISOString(),
      type: 'complete',
    };

    // Emit A2A formatted complete event
    this.eventEmitter.emit('agent.stream.complete', eventPayload);
  }

  /**
   * Emit an error event.
   *
   * Signals that the agent task has failed. This is a terminal event in the
   * SSE stream lifecycle and indicates the client should close the connection
   * and display an error to the user.
   *
   * ## Event Payload Format (AgentStreamErrorData)
   * ```typescript
   * {
   *   context: ExecutionContext,        // Full execution context
   *   streamId: string,                 // Stream ID (equals taskId)
   *   mode: 'build' | 'converse' | ..., // Agent mode
   *   userMessage: string,              // Original user request
   *   timestamp: string,                // ISO 8601 timestamp
   *   type: 'error',                    // Event type
   *   error: string                     // Error message
   * }
   * ```
   *
   * ## SSE Wire Format
   * ```
   * event: agent.stream.error
   * data: {"context":{...},"streamId":"task-123","type":"error","error":"...",...}
   * ```
   *
   * @param context - ExecutionContext containing task metadata
   * @param userMessage - Original user request message
   * @param mode - Agent mode (build, converse, plan, hitl)
   * @param error - Error message describing what went wrong
   *
   * @example
   * ```typescript
   * emitError(
   *   context,
   *   'Create a new feature',
   *   'build',
   *   'Failed to connect to external agent API'
   * );
   * // Client receives error event and displays error to user
   * ```
   */
  emitError(
    context: ExecutionContext,
    userMessage: string,
    mode: string,
    error: string,
  ): void {
    this.logger.error(`❌ Stream error for task ${context.taskId}: ${error}`);

    const eventPayload: AgentStreamErrorData = {
      context,
      streamId: context.taskId,
      mode,
      userMessage,
      timestamp: new Date().toISOString(),
      type: 'error',
      error,
    };

    // Emit A2A formatted error event
    this.eventEmitter.emit('agent.stream.error', eventPayload);
  }
}
