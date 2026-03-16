import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Data Analyst input interface
 * Validation is handled by NestJS DTOs at the controller level
 *
 * Context flows through via ExecutionContext parameter.
 * Provider/model come from context.provider and context.model.
 */
export interface DataAnalystInput {
  /** Execution context - contains orgSlug, userId, conversationId, taskId, provider, model, etc. */
  context: ExecutionContext;
  userMessage: string;
}

/**
 * Result from Data Analyst execution
 */
export interface DataAnalystResult {
  taskId: string;
  status: 'completed' | 'failed';
  userMessage: string;
  summary?: string;
  generatedSql?: string;
  sqlResults?: string;
  error?: string;
  duration: number;
}

/**
 * Status response for checking thread state
 */
export interface DataAnalystStatus {
  taskId: string;
  status: DataAnalystState['status'];
  userMessage: string;
  summary?: string;
  error?: string;
}

/**
 * Tool result structure
 */
export interface ToolResult {
  toolName: string;
  result: string;
  success: boolean;
  error?: string;
}

/**
 * Data Analyst State Annotation
 *
 * Uses ExecutionContext for all identification and configuration.
 * No individual fields for taskId, userId, etc.
 */
export const DataAnalystStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // ExecutionContext - the core context that flows through the system
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

  // User's message/prompt
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Schema discovery
  availableTables: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  selectedTables: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  tableSchemas: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // SQL execution
  generatedSql: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  sqlResults: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Tool tracking
  toolResults: Annotation<ToolResult[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Final output
  summary: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Status tracking
  status: Annotation<
    | 'started'
    | 'discovering'
    | 'querying'
    | 'summarizing'
    | 'completed'
    | 'failed'
  >({
    reducer: (_, next) => next,
    default: () => 'started',
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

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type DataAnalystState = typeof DataAnalystStateAnnotation.State;
