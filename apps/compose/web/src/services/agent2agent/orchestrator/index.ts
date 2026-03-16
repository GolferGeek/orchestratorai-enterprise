/**
 * Unified A2A Orchestrator - Main Exports
 *
 * Single entry point for ALL A2A calls. The transport type determines:
 * 1. How to build the request (request-switch)
 * 2. How to handle the response (response-switch)
 *
 * @see docs/prd/unified-a2a-orchestrator.md
 */

// Main orchestrator (singleton instance)
export { a2aOrchestrator, A2AOrchestrator } from './a2a-orchestrator';

// Types
export type {
  A2ATrigger,
  A2APayload,
  A2AResult,
  LlmOverrideConfig,
  PlanResult,
  DeliverableResult,
  MessageResult,
  HitlWaitingResult,
  SuccessResult,
  ErrorResult,
  ExecutionContext,
} from './types';

// Type guards
export {
  isPlanResult,
  isDeliverableResult,
  isMessageResult,
  isHitlWaitingResult,
  isSuccessResult,
  isErrorResult,
  NIL_UUID,
  isNilUuid,
} from './types';

// Internal modules (for advanced use cases)
export { buildA2ARequest } from './request-switch';
export { handleA2AResponse } from './response-switch';
