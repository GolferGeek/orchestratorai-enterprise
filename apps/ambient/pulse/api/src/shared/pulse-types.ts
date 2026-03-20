/**
 * Pulse-local type definitions
 *
 * These types were product-specific and have been removed from
 * @orchestrator-ai/transport-types. They are defined here because
 * they are internal implementation details of Pulse's task-router
 * pattern and do not belong in the shared transport contract.
 */

/**
 * Request payload for dashboard task-router handlers.
 *
 * Used by PredictorService, RiskRunnerService, and their task-router
 * handler trees to carry the action name and arbitrary params from
 * the controller down to individual entity handlers.
 */
export interface DashboardRequestPayload {
  /** The action to perform, e.g. 'universes.list' or 'runner.fetchPrices' */
  action: string;
  /** Action-specific parameters */
  params?: Record<string, unknown>;
  /** Optional pagination hints */
  pagination?: {
    page?: number;
    pageSize?: number;
  };
}
