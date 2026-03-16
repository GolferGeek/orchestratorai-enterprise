/**
 * Interface for services that handle mode-specific actions
 * All domain services (PlansService, DeliverablesService, etc.) implement this
 */

import type {
  JsonObject,
  JsonValue,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Result returned by action handlers
 * @template TData - The specific result type for this action
 */
export interface ActionResult<
  TData = JsonValue,
  TMetadata extends JsonObject | undefined = JsonObject | undefined,
> {
  success: boolean;
  data?: TData;
  error?: {
    code: string;
    message: string;
    details?: JsonObject;
  };
  metadata?: TMetadata;
}

/**
 * Interface that all domain services must implement
 * Provides a unified entry point for executing mode-specific actions
 */
export interface IActionHandler<DefaultParams = JsonObject | undefined> {
  /**
   * Execute a specific action with the given parameters
   * @param action - The action to execute (e.g., 'create', 'read', 'merge_versions')
   * @param params - Action-specific parameters
   * @param context - ExecutionContext from transport-types (full context capsule)
   * @returns ActionResult with typed data
   */
  executeAction<TResult = JsonValue, TParams = DefaultParams>(
    action: string,
    params: TParams,
    context: ExecutionContext,
  ): Promise<ActionResult<TResult>>;
}
