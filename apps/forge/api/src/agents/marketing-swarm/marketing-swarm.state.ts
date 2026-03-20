import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Agent configuration with personality and LLM settings
 */
export interface AgentConfig {
  agentSlug: string;
  llmConfigId: string;
  llmProvider: string;
  llmModel: string;
  displayName?: string;
}

/**
 * Swarm configuration - selected agents per role
 */
export interface SwarmConfig {
  writers: AgentConfig[];
  editors: AgentConfig[];
  evaluators: AgentConfig[];
  maxEditCycles: number;
}

/**
 * Prompt data from the 8-question interview
 */
export interface PromptData {
  topic: string;
  audience: string;
  goal: string;
  keyPoints: string[];
  tone: string;
  constraints?: string;
  examples?: string;
  additionalContext?: string;
}

/**
 * Execution queue item - tracks each step
 */
export interface QueueItem {
  id: string;
  stepType: 'write' | 'edit' | 'evaluate';
  sequence: number;
  agentSlug: string;
  llmConfigId: string;
  provider: string;
  dependsOn: string[];
  inputOutputId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  resultId?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Output from a writer or editor
 */
export interface SwarmOutput {
  id: string;
  writerAgentSlug: string;
  writerLlmConfigId: string;
  editorAgentSlug?: string;
  editorLlmConfigId?: string;
  content: string;
  editCycle: number;
  status: 'draft' | 'editing' | 'approved' | 'final' | 'max_cycles_reached';
  editorFeedback?: string;
  editorApproved?: boolean;
  llmMetadata?: {
    tokensUsed?: number;
    latencyMs?: number;
  };
}

/**
 * Evaluation from an evaluator
 */
export interface SwarmEvaluation {
  id: string;
  outputId: string;
  evaluatorAgentSlug: string;
  evaluatorLlmConfigId: string;
  score: number;
  reasoning: string;
  criteriaScores?: Record<string, number>;
  llmMetadata?: {
    tokensUsed?: number;
    latencyMs?: number;
  };
}

/**
 * Marketing Swarm input interface
 */
export interface MarketingSwarmInput {
  context: ExecutionContext;
  contentTypeSlug: string;
  contentTypeContext: string;
  promptData: PromptData;
  config: SwarmConfig;
}

/**
 * Marketing Swarm result
 */
export interface MarketingSwarmResult {
  taskId: string;
  status: 'completed' | 'failed';
  outputs: SwarmOutput[];
  evaluations: SwarmEvaluation[];
  rankedResults: Array<{
    outputId: string;
    averageScore: number;
    weightedScore?: number;
  }>;
  error?: string;
  duration: number;
}

/**
 * Marketing Swarm State Annotation
 */
export const MarketingSwarmStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  // ExecutionContext - the core context
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: 'marketing-swarm',
      agentType: 'api',
      provider: '',
      model: '',
    }),
  }),

  // Content type info
  contentTypeSlug: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  contentTypeContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Prompt data from interview
  promptData: Annotation<PromptData>({
    reducer: (_, next) => next,
    default: () => ({
      topic: '',
      audience: '',
      goal: '',
      keyPoints: [],
      tone: '',
    }),
  }),

  // Swarm configuration
  config: Annotation<SwarmConfig>({
    reducer: (_, next) => next,
    default: () => ({
      writers: [],
      editors: [],
      evaluators: [],
      maxEditCycles: 3,
    }),
  }),

  // Execution queue
  executionQueue: Annotation<QueueItem[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Current step being processed
  currentStepIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Outputs (drafts and revisions)
  outputs: Annotation<SwarmOutput[]>({
    reducer: (prev, next) => {
      // Merge by id - update existing or add new
      const merged = [...prev];
      for (const newOutput of next) {
        const existingIndex = merged.findIndex((o) => o.id === newOutput.id);
        if (existingIndex >= 0) {
          merged[existingIndex] = newOutput;
        } else {
          merged.push(newOutput);
        }
      }
      return merged;
    },
    default: () => [],
  }),

  // Evaluations
  evaluations: Annotation<SwarmEvaluation[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Workflow phase
  phase: Annotation<
    | 'initializing'
    | 'writing'
    | 'editing'
    | 'evaluating'
    | 'ranking'
    | 'completed'
    | 'failed'
  >({
    reducer: (_, next) => next,
    default: () => 'initializing',
  }),

  // Error tracking
  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Timestamps
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type MarketingSwarmState = typeof MarketingSwarmStateAnnotation.State;
