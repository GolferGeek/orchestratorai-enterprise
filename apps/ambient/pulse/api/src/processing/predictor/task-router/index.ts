/**
 * Task Router Index
 * Exports dashboard router and all handlers
 */

export {
  PredictionDashboardRouter,
  type DashboardEntity,
  type DashboardRouterResponse,
} from './prediction-dashboard.router';
export {
  type IDashboardHandler,
  type DashboardActionResult,
  type DashboardHandlerDependencies,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from './dashboard-handler.interface';
export * from './handlers';
