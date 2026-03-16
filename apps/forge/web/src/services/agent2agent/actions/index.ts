/**
 * Agent2Agent Actions
 * Orchestrator functions for all mode × action combinations
 *
 * Import pattern:
 * import { createPlan, rerunPlan } from '@/services/agent2agent/actions';
 */

// Plan actions
// Phase 4 Migration: All plan actions now use the unified A2A orchestrator
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
} from './plan.actions';

// Plan types
export type { CreatePlanResult } from './plan.actions';

// Build actions (Deliverables)
// Phase 3 Migration: All build actions now use the unified A2A orchestrator
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
} from './build.actions';

// HITL types
export type {
  HitlWaitingResult,
  DeliverableResult,
  CreateDeliverableResult,
} from './build.actions';

// Converse actions
// Phase 5 Migration: sendMessage now uses the unified A2A orchestrator
export {
  sendMessage,
  createConversation,
  loadConversation,
  deleteConversation,
} from './converse.actions';
