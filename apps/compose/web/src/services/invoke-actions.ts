/**
 * Invoke Actions
 *
 * Single entry point for all agent invocation actions.
 * These functions use invoke-client (v2 JSON-RPC 2.0 contract) via the A2A orchestrator.
 *
 * Replaces the legacy @/services/agent2agent/actions imports.
 *
 * Usage:
 * ```typescript
 * import { sendMessage, createPlan, createDeliverable } from '@/services/invoke-actions';
 * ```
 */

// Converse actions
export {
  sendMessage,
  createConversation,
  loadConversation,
  deleteConversation,
} from './agent2agent/actions/converse.actions';

export type { SendMessageResult } from './agent2agent/actions/converse.actions';

// Plan actions
export {
  createPlan,
  readPlan,
  rerunPlan,
  setCurrentPlanVersion,
  deletePlanVersion,
  deletePlan,
  copyPlanVersion,
  mergePlanVersions,
  editPlan,
  listPlans,
} from './agent2agent/actions/plan.actions';

export type { CreatePlanResult } from './agent2agent/actions/plan.actions';

// Build (deliverable) actions
export {
  createDeliverable,
  readDeliverable,
  editDeliverable,
  listDeliverables,
  rerunDeliverable,
  setCurrentVersion,
  deleteVersion,
  deleteDeliverable,
  copyVersion,
  mergeVersions,
} from './agent2agent/actions/build.actions';

export type {
  HitlWaitingResult,
  DeliverableResult,
  CreateDeliverableResult,
} from './agent2agent/actions/build.actions';
