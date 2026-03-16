/**
 * HITL (Human-in-the-Loop) Components
 *
 * Components for handling human approval workflows in LangGraph agents.
 *
 * Usage:
 * 1. Import the components
 * 2. Show HitlStatusBanner when an agent is awaiting review
 * 3. Use HitlReviewModal for the review interface (uses A2A orchestrator)
 *
 * The HITL flow uses the A2A orchestrator - all calls go through a2aOrchestrator.execute().
 */

export { default as HitlStatusBanner } from './HitlStatusBanner.vue';
export { default as HitlApprovalModal } from './HitlApprovalModal.vue';
export { default as HitlReviewModal } from './HitlReviewModal.vue';
export { default as HitlPendingCard } from './HitlPendingCard.vue';
export { default as HitlPendingList } from './HitlPendingList.vue';

// Re-export types from transport-types directly
export type {
  HitlStatus,
  HitlDecision,
  HitlGeneratedContent,
} from '@orchestrator-ai/transport-types';
