/**
 * Shared Server-Sent Events (SSE) typings for Agent-to-Agent streaming.
 * These types are consumed by both the API and web workspaces to ensure
 * consistent event payloads when streaming task progress.
 */

import type { ExecutionContext } from '../core/execution-context';

/**
 * Base SSE event contract.
 * All events inherit standard SSE fields plus strongly typed payloads.
 */
export interface BaseSSEEvent<EventType extends string = string, Data = unknown> {
  /** Event type identifier (SSE `event:` field). */
  event: EventType;
  /** Event payload (SSE `data:` field). */
  data: Data;
  /** Optional SSE id for replay support. */
  id?: string;
  /** Optional SSE retry interval in milliseconds. */
  retry?: number;
}

/**
 * Common context shared across agent stream events.
 *
 * Uses the full ExecutionContext capsule - context travels whole, never cherry-picked.
 */
export interface AgentStreamContext {
  /** Full ExecutionContext capsule (REQUIRED - never partial) */
  context: ExecutionContext;
  /** Unique stream identifier (per execution). */
  streamId: string;
  /** Agent task mode (plan, build, converse, etc.). */
  mode: string;
  /** The user's original message that triggered this stream (REQUIRED). */
  userMessage: string;
  /** ISO timestamp representing when the event was emitted. */
  timestamp: string;
}

/**
 * Metadata describing a chunk of streamed content.
 */
export interface AgentStreamChunkMetadata {
  /** Progress percentage (0-100). */
  progress?: number;
  /** Optional label for the current step/phase. */
  step?: string;
  /** Additional metadata surface. */
  [key: string]: unknown;
}

/**
 * Payload for agent stream chunk events.
 */
export interface AgentStreamChunkData extends AgentStreamContext {
  chunk: {
    /** Chunk type: partial (incremental update), final (complete response), or progress (observability update). */
    type: 'partial' | 'final' | 'progress';
    /** Streamed text/content. */
    content: string;
    /** Optional metadata for UI/analytics. */
    metadata?: AgentStreamChunkMetadata;
  };
}

/**
 * Payload for agent stream completion events.
 */
export interface AgentStreamCompleteData extends AgentStreamContext {
  type: 'complete';
}

/**
 * Payload for agent stream error events.
 */
export interface AgentStreamErrorData extends AgentStreamContext {
  type: 'error';
  /** Human-readable error message suitable for surfacing to clients. */
  error: string;
}

/**
 * Agent stream chunk SSE event.
 */
export type AgentStreamChunkSSEEvent = BaseSSEEvent<
  'agent_stream_chunk',
  AgentStreamChunkData
>;

/**
 * Agent stream completion SSE event.
 */
export type AgentStreamCompleteSSEEvent = BaseSSEEvent<
  'agent_stream_complete',
  AgentStreamCompleteData
>;

/**
 * Agent stream error SSE event.
 */
export type AgentStreamErrorSSEEvent = BaseSSEEvent<
  'agent_stream_error',
  AgentStreamErrorData
>;

/**
 * Payload for human-facing task progress updates.
 *
 * Uses full ExecutionContext capsule for complete observability.
 */
export interface TaskProgressData {
  /** Full ExecutionContext capsule (REQUIRED - never partial) */
  context: ExecutionContext;
  /** Progress percentage (0-100). */
  progress: number;
  /** Optional descriptive message. */
  message?: string;
  /** Task lifecycle status. */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** ISO timestamp emitted by the server. */
  timestamp: string;
}

/**
 * Task progress SSE event.
 */
export type TaskProgressSSEEvent = BaseSSEEvent<'task_progress', TaskProgressData>;

/**
 * Union of all SSE events emitted by the platform.
 */
export type SSEEvent =
  | AgentStreamChunkSSEEvent
  | AgentStreamCompleteSSEEvent
  | AgentStreamErrorSSEEvent
  | TaskProgressSSEEvent;

/**
 * Typed SSE event handler signature.
 */
export type SSEEventHandler<TEvent extends SSEEvent = SSEEvent> = (
  event: TEvent
) => void;

/**
 * Connection options for higher-level SSE clients.
 */
export interface SSEConnectionOptions {
  /** Maximum reconnection attempts before giving up. */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds. */
  reconnectDelay?: number;
  /** Initial connection timeout in milliseconds. */
  timeout?: number;
  /** Enable verbose debug logging. */
  debug?: boolean;
}

/**
 * Connection state enumeration surfaced to UI layers.
 */
export type SSEConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error';
