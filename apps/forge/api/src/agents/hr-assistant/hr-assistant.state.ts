import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * HR Source citation — a single retrieved document chunk
 */
export interface HrSource {
  score: number;
  excerpt: string;
  section: string;
  documentId: string;
}

/**
 * Input to the HR Assistant workflow.
 *
 * ExecutionContext flows through via the context field.
 * Provider/model come from context.provider and context.model.
 * The question field maps from io_schema input.question.
 */
export interface HrAssistantInput {
  /** Execution context — contains orgSlug, userId, taskId, provider, model, etc. */
  context: ExecutionContext;
  /** The HR policy question asked by the user */
  userMessage: string;
}

/**
 * Result from HR Assistant workflow execution
 */
export interface HrAssistantResult {
  taskId: string;
  status: 'completed' | 'failed';
  userMessage: string;
  result?: string;
  sources?: HrSource[];
  error?: string;
  duration: number;
}

/**
 * HR Assistant State Annotation
 *
 * PATTERN_B: RAG Retrieve → LLM Call
 *
 * ExecutionContext is stored whole and passed through all nodes.
 * No HITL — does NOT extend HitlBaseStateAnnotation.
 */
export const HrAssistantStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // ExecutionContext — the core context that flows through the system.
  // Note: Default is a placeholder that MUST be overwritten when invoking the graph.
  // Runtime validation happens in graph nodes, not at state initialization.
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  // The HR policy question (mapped from io_schema input.question)
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Formatted text block built from RAG results — passed to LLM
  retrievedContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Citation array built from RAG results
  sources: Annotation<HrSource[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // LLM answer
  result: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Status tracking
  status: Annotation<
    'pending' | 'running' | 'retrieving' | 'completed' | 'failed'
  >({
    reducer: (_, next) => next,
    default: () => 'pending',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Workflow metadata
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),
});

export type HrAssistantState = typeof HrAssistantStateAnnotation.State;
