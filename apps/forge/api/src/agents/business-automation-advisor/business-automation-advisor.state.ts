import { Annotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Agent recommendation structure from the LLM
 */
export interface AgentRecommendation {
  name: string;
  tagline: string;
  description: string;
  use_case_example: string;
  time_saved: string;
  wow_factor: string;
  category: string;
}

/**
 * Input for Business Automation Advisor
 */
export interface BusinessAutomationAdvisorInput {
  context: ExecutionContext;
  industry: string;
}

/**
 * Result from Business Automation Advisor execution
 */
export interface BusinessAutomationAdvisorResult {
  status: 'success' | 'partial' | 'error';
  message: string;
  data?: {
    industry: string;
    industryDescription: string;
    recommendationCount: number;
    isFallback: boolean;
    recommendations: AgentRecommendation[];
    processingTimeMs: number;
  };
  error?: string;
}

/**
 * Business Automation Advisor State Annotation
 *
 * Simple state for the workflow:
 * 1. Take industry input
 * 2. Normalize industry name
 * 3. Generate agent recommendations
 * 4. Return results
 */
export const BusinessAutomationAdvisorStateAnnotation = Annotation.Root({
  // ExecutionContext - the core context that flows through the system
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

  // User's raw industry input
  industryInput: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Normalized industry name (from first LLM call)
  normalizedIndustry: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Industry description (from first LLM call)
  industryDescription: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Common business types (from first LLM call)
  commonBusinessTypes: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Agent recommendations (from second LLM call)
  recommendations: Annotation<AgentRecommendation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Whether fallback recommendations were used
  isFallback: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Status tracking
  status: Annotation<
    'started' | 'normalizing' | 'generating' | 'completed' | 'failed'
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

export type BusinessAutomationAdvisorState =
  typeof BusinessAutomationAdvisorStateAnnotation.State;
