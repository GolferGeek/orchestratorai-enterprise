/**
 * Strict Response Handlers Index
 * Exports all mode-specific handlers and validation utilities
 */

export { planResponseHandler } from './plan.handler';
export { buildResponseHandler } from './build.handler';
export { converseResponseHandler } from './converse.handler';

export type {
  PlanCreateResult,
  PlanReadResult,
  PlanListResult,
  PlanEditResult,
  PlanDeleteResult,
} from './plan.handler';

export type {
  BuildExecuteResult,
  BuildReadResult,
  BuildListResult,
  BuildRerunResult,
  BuildEditResult,
  BuildDeleteResult,
} from './build.handler';

export type { ConverseResult } from './converse.handler';

import { planResponseHandler } from './plan.handler';
import { buildResponseHandler } from './build.handler';
import { converseResponseHandler } from './converse.handler';

/**
 * Unified response handler
 * Provides a single entry point for all response types
 */
export const handleResponse = {
  plan: planResponseHandler,
  build: buildResponseHandler,
  converse: converseResponseHandler,
};

/**
 * Re-export validation utilities
 */
export {
  validateJsonRpcEnvelope,
  validateSuccessResponse,
  validateErrorResponse,
  isStrictError,
  isStrictSuccess,
  extractErrorDetails,
  extractSuccessPayload,
  StrictResponseValidationError,
  isStrictPlanResponse,
  isStrictBuildResponse,
  isStrictConverseResponse,
  isStrictErrorResponse,
  isStrictSuccessResponse,
} from './response-validation';
