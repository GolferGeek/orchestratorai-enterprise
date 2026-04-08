/**
 * emit-thinking-events.ts
 *
 * Shared helper for emitting `thinking_started` and `thinking_completed`
 * observability events from any provider's `generateResponseWithReasoning` method.
 *
 * Design decisions:
 * - Accepts ExecutionContext whole — never destructures it.
 * - Uses ObservabilityEventsService.push() — same pattern as LLMService.
 * - `thinking_completed` is emitted ONLY when thinkingContent was captured
 *   (i.e. a real thinking phase occurred). Non-reasoning passthrough paths
 *   call emitThinkingStarted but must NOT call emitThinkingCompleted.
 * - Errors propagate — no try/catch swallowing per CLAUDE.md Rule 2.
 */

import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';

export interface ThinkingStartedDeps {
  observabilityService: ObservabilityEventsService;
  context: ExecutionContext;
  provider: string;
  model: string;
  startTime: number;
}

export interface ThinkingCompletedDeps {
  observabilityService: ObservabilityEventsService;
  context: ExecutionContext;
  provider: string;
  model: string;
  startTime: number;
  endTime: number;
  thinkingTokenCount?: number;
  thinkingCharCount?: number;
}

/**
 * Emit a `thinking_started` event before the reasoning API call.
 * Always awaited so the event reaches the buffer before the API round-trip begins.
 */
export async function emitThinkingStarted(
  deps: ThinkingStartedDeps,
): Promise<void> {
  await deps.observabilityService.push({
    context: deps.context,
    source_app: 'orchestrator-ai',
    hook_event_type: 'thinking_started',
    status: 'thinking_started',
    message: `${deps.provider}/${deps.model}: reasoning started`,
    progress: null,
    step: 'reasoning',
    payload: {
      provider: deps.provider,
      model: deps.model,
      startTime: deps.startTime,
    },
    timestamp: deps.startTime,
  });
}

/**
 * Emit a `thinking_completed` event after the reasoning API call returns.
 * Must only be called when thinkingContent was captured (real thinking occurred).
 */
export async function emitThinkingCompleted(
  deps: ThinkingCompletedDeps,
): Promise<void> {
  await deps.observabilityService.push({
    context: deps.context,
    source_app: 'orchestrator-ai',
    hook_event_type: 'thinking_completed',
    status: 'thinking_completed',
    message: `${deps.provider}/${deps.model}: reasoning completed`,
    progress: null,
    step: 'reasoning',
    payload: {
      provider: deps.provider,
      model: deps.model,
      startTime: deps.startTime,
      endTime: deps.endTime,
      durationMs: deps.endTime - deps.startTime,
      ...(deps.thinkingTokenCount !== undefined && {
        thinkingTokenCount: deps.thinkingTokenCount,
      }),
      ...(deps.thinkingCharCount !== undefined && {
        thinkingCharCount: deps.thinkingCharCount,
      }),
    },
    timestamp: deps.endTime,
  });
}
