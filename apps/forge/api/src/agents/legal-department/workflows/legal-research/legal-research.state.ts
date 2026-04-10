/**
 * Legal Research Deep Dive — State Annotation.
 *
 * Separate state from the document-analysis/contract-review workflows because
 * the research workflow has fundamentally different state needs: a recursive
 * research tree, depth tracking, citation grounding, and budget controls.
 *
 * See: docs/efforts/current/legal-research-deep-dive/prd.md §4.1
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// ── Domain Interfaces ───────────────────────────────────────────────

export interface Citation {
  text: string;
  source: string;
  documentId: string;
  chunkId: string;
  verified: boolean;
  relevanceScore: number;
}

export interface ResearchTreeNode {
  id: string;
  parentId: string | null;
  question: string;
  depth: number;
  status: 'pending' | 'researching' | 'answered' | 'skipped';
  findings?: string;
  citations?: Citation[];
  confidence?: 'high' | 'medium' | 'low';
  childIds: string[];
}

export interface ResearchConfig {
  maxDepth: number;
  maxSubQuestionsPerLevel: number;
  tokenBudget: number | null;
  timeBudgetMs: number | null;
}

// ── State Annotation ────────────────────────────────────────────────

export const LegalResearchStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

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

  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  jurisdiction: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  practiceArea: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  keyFacts: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  researchConfig: Annotation<ResearchConfig>({
    reducer: (_, next) => next,
    default: () => ({
      maxDepth: 3,
      maxSubQuestionsPerLevel: 3,
      tokenBudget: null,
      timeBudgetMs: null,
    }),
  }),

  researchTree: Annotation<ResearchTreeNode[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  currentDepth: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** Queue of ResearchTreeNode IDs to research next. */
  pendingQuestions: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** ID of the node currently being researched. */
  currentResearchTarget: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  tokenUsage: Annotation<{ input: number; output: number }>({
    reducer: (_, next) => next,
    default: () => ({ input: 0, output: 0 }),
  }),

  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  memo: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  report: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  status: Annotation<'started' | 'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'started',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /**
   * HITL routing flag: set by hitl-checkpoint when the decision is
   * 'deepen' or 'redirect', read by the depth_controller / research_dispatcher.
   */
  hitlAction: Annotation<
    | undefined
    | {
        type: 'deepen';
        targetNodeIds: string[];
        guidance?: string;
      }
    | {
        type: 'redirect';
        targetNodeId: string;
        replacementQuestions: string[];
      }
  >({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type LegalResearchState = typeof LegalResearchStateAnnotation.State;
