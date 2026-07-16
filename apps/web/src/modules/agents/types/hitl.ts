/**
 * HITL (Human-In-The-Loop) Types
 *
 * Domain types for HITL interactions.
 * Migrated from services/agent2agent/legacy-types.ts as part of A2A-001 migration.
 */

export type HitlStatus = 'hitl_waiting' | 'regenerating' | 'completed' | 'rejected' | string;
export type HitlDecision = 'approve' | 'reject' | 'regenerate' | 'replace' | 'skip';
export type HitlGeneratedContent = Record<string, unknown>;

export interface HitlDeliverableResponse {
  status?: string;
  taskId?: string;
  topic?: string;
  message?: string;
  generatedContent?: HitlGeneratedContent;
  deliverableId?: string;
}
