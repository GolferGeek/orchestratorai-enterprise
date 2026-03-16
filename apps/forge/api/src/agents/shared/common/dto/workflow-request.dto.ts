import { IsString, IsOptional, IsUrl, IsObject } from 'class-validator';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../validators/execution-context.validator';

/**
 * Generic workflow request DTO for simple workflows that don't require agent-specific DTOs.
 *
 * ## Purpose
 * This DTO provides a minimal, reusable interface for workflows that only need:
 * - ExecutionContext (for observability, LLM calls, and context continuity)
 * - A text prompt/message
 * - Optional webhook and metadata
 *
 * ## When to Use This DTO
 * Use `WorkflowRequestDto` for:
 * - Simple, single-purpose workflows with minimal input requirements
 * - Rapid prototyping of new workflows
 * - Generic task execution endpoints that accept any workflow type
 *
 * ## When to Use Agent-Specific DTOs
 * Create a custom DTO (e.g., `DataAnalystRequestDto`, `ExtendedPostWriterRequestDto`) when:
 * - Workflow requires multiple, structured inputs (e.g., keywords, tone, context info)
 * - Input validation needs to be specific to the workflow domain
 * - You need strongly-typed fields beyond just a prompt
 *
 * ## ExecutionContext Capsule Pattern
 * This DTO follows the ExecutionContext "capsule" pattern:
 * - ExecutionContext is received as a complete object from the front-end
 * - Never construct ExecutionContext in backend - it's created on front-end
 * - Pass the full capsule through all services, LLM calls, and observability events
 * - ExecutionContext contains: orgSlug, userId, conversationId, taskId, planId,
 *   deliverableId, agentSlug, agentType, provider, model
 *
 * ## Validation
 * ExecutionContext validation is performed by the `@IsValidExecutionContext()` decorator,
 * which uses the `isExecutionContext()` type guard from `@orchestrator-ai/transport-types`.
 * This ensures the capsule has all required fields before workflow execution begins.
 *
 * @example
 * ```typescript
 * // Front-end: Send request with ExecutionContext capsule
 * const response = await axios.post('/workflows/generic', {
 *   context: executionContextStore.current, // Full capsule from store
 *   prompt: 'Analyze this data...',
 *   statusWebhook: 'https://example.com/status',
 *   metadata: { source: 'dashboard' }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Backend: Use in controller
 * @Post('execute')
 * async execute(@Body() dto: WorkflowRequestDto) {
 *   // dto.context is already validated and complete
 *   return await this.service.execute({
 *     executionContext: dto.context, // Pass full capsule to service
 *     userMessage: dto.prompt,
 *   });
 * }
 * ```
 *
 * @see {@link DataAnalystRequestDto} Example of agent-specific DTO with additional fields
 * @see {@link ExtendedPostWriterRequestDto} Example of DTO with structured inputs (keywords, tone)
 * @see {@link ExecutionContext} The complete capsule structure
 * @see {@link IsValidExecutionContext} Custom validator for ExecutionContext
 */
export class WorkflowRequestDto {
  /**
   * Complete ExecutionContext capsule containing all execution metadata.
   *
   * This capsule is created on the front-end and flows through the entire system:
   * - Front-end creates it via `executionContextStore.initialize()`
   * - Backend validates it matches the authenticated user
   * - Services receive it whole (never cherry-picked)
   * - LLM calls include it for usage tracking and PII processing
   * - Observability events include it for complete traceability
   *
   * @required
   * @type {ExecutionContext}
   */
  @IsValidExecutionContext()
  context!: ExecutionContext;

  /**
   * Main user prompt, message, or instruction for the workflow.
   *
   * This is the primary text input that drives the workflow execution.
   * For workflows requiring structured input, consider creating an
   * agent-specific DTO instead.
   *
   * @required
   * @type {string}
   * @example 'Analyze the quarterly sales data and identify trends'
   * @example 'Write a blog post about cloud computing best practices'
   */
  @IsString()
  prompt!: string;

  /**
   * Optional webhook URL for receiving real-time progress updates.
   *
   * If provided, the workflow will POST status events to this endpoint
   * as it progresses through execution steps. Events include:
   * - Workflow started
   * - Step completed (with progress percentage)
   * - Workflow completed
   * - Workflow failed (with error details)
   *
   * @optional
   * @type {string}
   * @example 'https://api.example.com/webhooks/workflow-status'
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  @IsOptional()
  statusWebhook?: string;

  /**
   * Optional workflow-specific metadata or configuration.
   *
   * Use this field for:
   * - Custom workflow parameters that don't warrant dedicated fields
   * - Experimental features or flags
   * - Debugging information
   * - Integration-specific data
   *
   * This field is intentionally loosely-typed to support diverse use cases.
   * For strongly-typed workflow inputs, create an agent-specific DTO.
   *
   * @optional
   * @type {Record<string, unknown>}
   * @example { source: 'dashboard', experimentalMode: true, debugLevel: 2 }
   * @example { referenceDocId: '123', includeExamples: false }
   */
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
