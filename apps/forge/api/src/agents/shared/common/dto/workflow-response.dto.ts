import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Standard response format for all workflow operations in LangGraph.
 *
 * ## Purpose
 * This DTO provides a consistent response structure across all workflows, enabling:
 * - Uniform success/failure handling
 * - Context continuity via ExecutionContext propagation
 * - Observability through execution metadata
 * - Backward compatibility with legacy fields
 *
 * ## When to Use This DTO
 * Use `WorkflowResponseDto` for:
 * - All workflow execution endpoints that need standard response format
 * - Operations where you want to return updated ExecutionContext to frontend
 * - Generic workflow responses that don't require custom response shapes
 *
 * ## When to Use Agent-Specific Response DTOs
 * Create a custom response DTO when:
 * - Workflow returns complex, structured output beyond key-value pairs
 * - Response schema needs strong typing for frontend consumption
 * - Domain-specific validation or transformation is required
 *
 * ## ExecutionContext Capsule Pattern in Responses
 * This DTO follows the ExecutionContext "capsule" pattern for responses:
 * - Backend may update ExecutionContext (e.g., update provider, model)
 * - Full capsule is returned so frontend can update its store
 * - Frontend uses returned context for subsequent operations
 * - Ensures context stays synchronized across frontend and backend
 *
 * ## Backward Compatibility
 * `conversationId` is maintained as a top-level field for backward
 * compatibility with existing clients. New code should prefer accessing
 * via `context.conversationId`.
 *
 * ## Metadata Usage
 * The `metadata` field provides execution details useful for:
 * - Performance monitoring (executionTime)
 * - Workflow observability (stepsCompleted)
 * - LLM tracking (provider, model)
 * - Cost calculation and analytics
 *
 * @example
 * ```typescript
 * // Backend: Return response with updated ExecutionContext
 * return {
 *   success: true,
 *   conversationId: context.conversationId,
 *   data: {
 *     result: 'Analysis complete',
 *     insights: [...],
 *   },
 *   metadata: {
 *     executionTime: 1234,
 *     stepsCompleted: 5,
 *     provider: context.provider,
 *     model: context.model,
 *   },
 *   context,
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Frontend: Update store with returned ExecutionContext
 * const response = await workflowService.execute(dto);
 * if (response.context) {
 *   executionContextStore.update(response.context); // Sync updated context
 * }
 * // Use response data
 * console.log(response.data.result);
 * ```
 *
 * @see {@link WorkflowRequestDto} Corresponding request DTO
 * @see {@link ExecutionContext} The complete capsule structure
 */
export class WorkflowResponseDto {
  /**
   * Indicates whether the workflow execution succeeded.
   *
   * - `true`: Workflow completed successfully, check `data` for results
   * - `false`: Workflow failed, check `data` for error details
   *
   * @type {boolean}
   * @example true
   */
  success!: boolean;

  /**
   * Conversation ID associated with this workflow execution.
   *
   * @deprecated Prefer accessing via `context.conversationId`. This field is
   * maintained for backward compatibility with existing clients.
   *
   * @type {string}
   * @example '550e8400-e29b-41d4-a716-446655440001'
   */
  conversationId?: string;

  /**
   * Workflow-specific output data.
   *
   * Structure varies by workflow type. Common patterns:
   * - Analysis results (for data analyst workflows)
   * - Generated content (for writer workflows)
   * - Task outputs (for task execution workflows)
   * - Error details (when success is false)
   *
   * This field is intentionally loosely-typed to support diverse workflow outputs.
   * For strongly-typed responses, create an agent-specific response DTO.
   *
   * @type {Record<string, unknown>}
   * @example { analysis: [...], recommendations: [...] }
   * @example { content: '...', wordCount: 500 }
   * @example { error: 'Validation failed', details: {...} }
   */
  data!: Record<string, unknown>;

  /**
   * Optional execution metadata for observability and analytics.
   *
   * Provides insights into workflow execution characteristics:
   * - `executionTime`: Total execution time in milliseconds
   * - `stepsCompleted`: Number of workflow steps completed
   * - `provider`: LLM provider used (e.g., 'anthropic', 'openai')
   * - `model`: LLM model used (e.g., 'claude-opus-4-5', 'gpt-4')
   *
   * @optional
   * @type {object}
   * @example { executionTime: 1234, stepsCompleted: 5, provider: 'anthropic', model: 'claude-opus-4-5' }
   */
  metadata?: {
    /**
     * Total workflow execution time in milliseconds.
     * @type {number}
     * @example 1234
     */
    executionTime?: number;

    /**
     * Number of workflow steps completed (includes all nodes traversed).
     * @type {number}
     * @example 5
     */
    stepsCompleted?: number;

    /**
     * LLM provider used for this workflow execution.
     * @type {string}
     * @example 'anthropic'
     */
    provider?: string;

    /**
     * LLM model used for this workflow execution.
     * @type {string}
     * @example 'claude-opus-4-5'
     */
    model?: string;
  };

  /**
   * Full ExecutionContext capsule for context continuity across operations.
   *
   * ## Why Return ExecutionContext?
   * Including ExecutionContext in responses enables:
   * 1. **Context Continuity**: Multi-step workflows can propagate updated context
   * 2. **Updated Fields**: Backend may update provider/model during execution
   * 3. **Complete Observability**: Frontend has full context for subsequent operations
   * 4. **Simplified Frontend**: No need to reassemble context from individual fields
   *
   * ## Frontend Usage
   * The frontend should update its `executionContextStore` with the returned context:
   * ```typescript
   * const response = await workflowService.execute(dto);
   * if (response.context) {
   *   executionContextStore.update(response.context); // Sync updated context
   * }
   * ```
   *
   * ## Backend Updates
   * Backend may update ExecutionContext during workflow execution:
   * - Update `provider` or `model` if changed during execution
   *
   * @optional (but RECOMMENDED for all workflows)
   * @type {ExecutionContext}
   * @example
   * ```typescript
   * {
   *   orgSlug: 'acme-corp',
   *   userId: '550e8400-e29b-41d4-a716-446655440000',
   *   conversationId: '550e8400-e29b-41d4-a716-446655440001',
   *   agentSlug: 'data-analyst',
   *   agentType: 'langgraph',
   *   provider: 'anthropic',
   *   model: 'claude-opus-4-5'
   * }
   * ```
   */
  context?: ExecutionContext;
}
