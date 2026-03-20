import { Annotation } from '@langchain/langgraph';
import { HitlBaseStateAnnotation } from '../shared/hitl/hitl-base.state';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  HitlGeneratedContent,
  HitlStatus,
  HitlResponse,
  HitlResumeInput,
} from '../shared/types/forge-types';

// Re-export HITL types
export type { HitlResponse, HitlResumeInput };

/**
 * Generated content structure
 * Extends HitlGeneratedContent for consistency with transport types
 */
export interface GeneratedContent extends HitlGeneratedContent {
  blogPost: string;
  seoDescription: string;
  socialPosts: string[];
}

/**
 * Extended Post Writer input interface
 * Validation is handled by NestJS DTOs at the controller level
 *
 * The ExecutionContext flows through the entire workflow.
 * All identification and LLM configuration comes from context.
 */
export interface ExtendedPostWriterInput {
  /** ExecutionContext - the core context that flows through the system */
  context: ExecutionContext;
  /** User's message/prompt */
  userMessage: string;
  /** Additional context for content generation */
  additionalContext?: string;
  /** Keywords for SEO */
  keywords?: string[];
  /** Writing tone */
  tone?: string;
}

/**
 * Result from Extended Post Writer generation
 */
export interface ExtendedPostWriterResult {
  taskId: string;
  status: HitlStatus;
  userMessage: string;
  generatedContent?: GeneratedContent;
  finalContent?: GeneratedContent;
  error?: string;
  duration?: number;
}

/**
 * Status response for checking thread state
 */
export interface ExtendedPostWriterStatus {
  taskId: string;
  status: HitlStatus;
  userMessage: string;
  generatedContent?: GeneratedContent;
  finalContent?: GeneratedContent;
  hitlPending: boolean;
  error?: string;
}

/**
 * Extended Post Writer State Annotation
 *
 * Extends HitlBaseStateAnnotation with domain-specific content fields.
 * Uses taskId consistently (no separate threadId - taskId IS the thread_id).
 *
 * KEY DESIGN DECISIONS:
 * 1. Extends HitlBaseStateAnnotation for HITL state management
 * 2. Uses taskId (passed to LangGraph as thread_id config)
 * 3. No version tracking in state - API Runner handles via DeliverablesService
 * 4. Domain-specific: blogPost, seoDescription, socialPosts
 */
export const ExtendedPostWriterStateAnnotation = Annotation.Root({
  // Include all HITL base state (includes taskId, hitlDecision, etc.)
  ...HitlBaseStateAnnotation.spec,

  // === User Input ===
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  topic: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  context: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  keywords: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  tone: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'professional',
  }),

  // === Generated Content ===
  blogPost: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  seoDescription: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  socialPosts: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // === Final Content (after HITL approval) ===
  finalContent: Annotation<GeneratedContent | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // === Generation Tracking ===
  generationCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
});

export type ExtendedPostWriterState =
  typeof ExtendedPostWriterStateAnnotation.State;
