/**
 * Strict Type Aliases
 * Simple aliases for web handlers that expect "strict" naming
 * These are just the generic types with strict naming for backwards compatibility
 */

import type { A2ATaskSuccessResponse, A2ATaskErrorResponse } from '../response/task-response.types';
import type { A2ATaskRequest, TaskMessage } from '../request/task-request.types';

// Request types - all use the generic A2ATaskRequest structure
export type StrictPlanRequest = A2ATaskRequest;
export type StrictBuildRequest = A2ATaskRequest;
export type StrictConverseRequest = A2ATaskRequest;
export type StrictOrchestrateRequest = A2ATaskRequest;
export type StrictA2ARequest = A2ATaskRequest;

// Message type
export type StrictTaskMessage = TaskMessage;

// Response types - all use the generic success/error response structure
// The mode field discriminates them at runtime
export type StrictPlanResponse = A2ATaskSuccessResponse;
export type StrictBuildResponse = A2ATaskSuccessResponse;
export type StrictConverseResponse = A2ATaskSuccessResponse;
export type StrictOrchestrateResponse = A2ATaskSuccessResponse;

export type StrictA2ASuccessResponse = A2ATaskSuccessResponse;
export type StrictA2AErrorResponse = A2ATaskErrorResponse;
export type StrictA2AResponse = StrictA2ASuccessResponse | StrictA2AErrorResponse;

// Simple type guards based on mode
export function isStrictPlanResponse(response: any): response is StrictPlanResponse {
  return (
    response &&
    response.jsonrpc === '2.0' &&
    response.result &&
    response.result.mode === 'plan'
  );
}

export function isStrictBuildResponse(response: any): response is StrictBuildResponse {
  return (
    response &&
    response.jsonrpc === '2.0' &&
    response.result &&
    response.result.mode === 'build'
  );
}

export function isStrictConverseResponse(response: any): response is StrictConverseResponse {
  return (
    response &&
    response.jsonrpc === '2.0' &&
    response.result &&
    response.result.mode === 'converse'
  );
}

export function isStrictErrorResponse(response: any): response is StrictA2AErrorResponse {
  return (
    response &&
    response.jsonrpc === '2.0' &&
    'error' in response
  );
}

export function isStrictSuccessResponse(response: any): response is StrictA2ASuccessResponse {
  return (
    response &&
    response.jsonrpc === '2.0' &&
    'result' in response &&
    response.result.success === true
  );
}
