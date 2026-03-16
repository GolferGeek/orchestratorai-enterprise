import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { z } from 'zod';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Zod schema for validating workflow input
 *
 * @deprecated This schema is deprecated. Use ExecutionContext directly instead of individual fields.
 * For new workflows, pass the full ExecutionContext object and access fields from it.
 */
export const WorkflowInputSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  userId: z.string().min(1, 'userId is required'),
  conversationId: z.string().optional(),
  organizationSlug: z.string().optional(),
  userMessage: z.string().min(1, 'userMessage is required'),
  agentSlug: z.string().min(1, 'agentSlug is required'),
  provider: z.string().default('anthropic'),
  model: z.string().default('claude-sonnet-4-20250514'),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

/**
 * Zod schema for HITL state
 */
export const HitlStateSchema = z.object({
  hitlRequest: z
    .object({
      taskId: z.string(),
      threadId: z.string(),
      agentSlug: z.string(),
      userId: z.string(),
      conversationId: z.string().optional(),
      organizationSlug: z.string().optional(),
      pendingContent: z.unknown(),
      contentType: z.string(),
      message: z.string().optional(),
    })
    .optional(),
  hitlResponse: z
    .object({
      decision: z.enum(['approve', 'edit', 'reject']),
      editedContent: z.unknown().optional(),
      feedback: z.string().optional(),
    })
    .optional(),
  hitlStatus: z.enum(['none', 'waiting', 'resumed']).default('none'),
});

export type HitlStateType = z.infer<typeof HitlStateSchema>;

/**
 * Zod schema for workflow execution metadata
 */
export const WorkflowMetadataSchema = z.object({
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  currentStep: z.string().optional(),
  stepCount: z.number().default(0),
  errors: z.array(z.string()).default([]),
});

export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;

/**
 * Base state annotation for all LangGraph workflows
 *
 * @deprecated Use HitlBaseStateAnnotation instead, which correctly uses ExecutionContext capsule.
 *
 * MIGRATION PATH:
 * 1. Replace BaseStateAnnotation with HitlBaseStateAnnotation in your workflow state
 * 2. Update state initialization to pass executionContext instead of individual fields
 * 3. Access context fields via state.executionContext.fieldName
 * 4. Remove usage of individual fields (taskId, userId, etc.)
 *
 * BACKWARD COMPATIBILITY:
 * - Individual fields are kept for backward compatibility
 * - New executionContext field added for migration
 * - Both patterns work during transition period
 *
 * See: apps/langgraph/src/hitl/hitl-base.state.ts for the correct pattern
 * See: .claude/skills/execution-context-skill for ExecutionContext capsule pattern
 *
 * This provides common fields that all workflows should have:
 * - Task/user identification (DEPRECATED - use executionContext)
 * - Message history (via MessagesAnnotation)
 * - HITL state
 * - Workflow metadata
 *
 * Extend this for agent-specific state fields.
 */
export const BaseStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // === NEW: ExecutionContext Capsule (PREFERRED) ===
  // All context fields should come from here in new code
  // This is the correct pattern per execution-context-skill
  executionContext: Annotation<ExecutionContext | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // === DEPRECATED: Individual Fields (kept for backward compatibility) ===
  // TODO: Remove these fields after all workflows migrate to executionContext
  // Migration: Use state.executionContext.taskId instead of state.taskId

  // Task identification
  /** @deprecated Use executionContext.taskId instead */
  taskId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /** @deprecated Use executionContext.taskId (passed as thread_id) instead */
  threadId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // User identification
  /** @deprecated Use executionContext.userId instead */
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /** @deprecated Use executionContext.conversationId instead */
  conversationId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /** @deprecated Use executionContext.orgSlug instead */
  organizationSlug: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Agent identification
  /** @deprecated Use executionContext.agentSlug instead */
  agentSlug: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // LLM configuration
  /** @deprecated Use executionContext.provider instead */
  provider: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'anthropic',
  }),

  /** @deprecated Use executionContext.model instead */
  model: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'claude-sonnet-4-20250514',
  }),

  // User input
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Workflow result
  result: Annotation<unknown>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Error state
  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // HITL state fields
  hitlRequest: Annotation<HitlStateType['hitlRequest']>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  hitlResponse: Annotation<HitlStateType['hitlResponse']>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  hitlStatus: Annotation<'none' | 'waiting' | 'resumed'>({
    reducer: (_, next) => next,
    default: () => 'none',
  }),

  // Workflow metadata
  metadata: Annotation<WorkflowMetadata>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({
      stepCount: 0,
      errors: [],
    }),
  }),
});

export type BaseState = typeof BaseStateAnnotation.State;

/**
 * Validate workflow input using Zod schema
 * Throws ZodError if validation fails
 */
export function validateWorkflowInput(input: unknown): WorkflowInput {
  return WorkflowInputSchema.parse(input);
}

/**
 * Safe validation that returns a result object instead of throwing
 */
export function safeValidateWorkflowInput(input: unknown): {
  success: boolean;
  data?: WorkflowInput;
  error?: z.ZodError;
} {
  const result = WorkflowInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod validation errors into a human-readable string
 */
export function formatValidationErrors(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}
