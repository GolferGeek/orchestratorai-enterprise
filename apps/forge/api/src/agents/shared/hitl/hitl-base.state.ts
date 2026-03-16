import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type {
  HitlDecision,
  HitlStatus,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Base state annotation for all HITL-capable workflows.
 * Individual agents extend this with their domain-specific fields.
 *
 * KEY DESIGN DECISIONS:
 * 1. Holds an ExecutionContext that flows through the entire workflow
 * 2. All context fields come from ExecutionContext - no individual fields
 * 3. Uses context.taskId (passed to LangGraph as thread_id config)
 * 4. NO version tracking in state - API Runner handles via DeliverablesService
 * 5. NO direct DB access from LangGraph - framework-agnostic
 * 6. HITL state (pending, decision, feedback) stored here for checkpointer
 */
export const HitlBaseStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // === Execution Context ===
  // The full ExecutionContext that flows through the entire system
  // All context fields (userId, orgSlug, taskId, provider, model, etc.) come from here
  // Note: Default is a placeholder that MUST be overwritten when invoking the graph.
  // Runtime validation happens in graph nodes, not at state initialization.
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      taskId: '',
      planId: '',
      deliverableId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  // === HITL State ===
  // These are stored in LangGraph checkpointer - no separate table needed
  hitlDecision: Annotation<HitlDecision | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  hitlFeedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  hitlPending: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  // Track which node triggered HITL (for serialized HITL)
  hitlNodeName: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // === Workflow Status ===
  status: Annotation<HitlStatus>({
    reducer: (_, next) => next,
    default: () => 'started',
  }),
  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),
  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type HitlBaseState = typeof HitlBaseStateAnnotation.State;

/**
 * Helper to check if state extends HitlBaseState
 */
export function isHitlState(state: unknown): state is HitlBaseState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'executionContext' in state &&
    'hitlDecision' in state &&
    'hitlPending' in state
  );
}
