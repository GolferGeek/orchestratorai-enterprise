import type { JsonObject } from '@orchestrator-ai/transport-types';

export type HumanApprovalStatus = 'pending' | 'approved' | 'rejected';

export type HumanApprovalMetadata = JsonObject;

export interface HumanApprovalRecord {
  id: string;
  organization_slug: string | null;
  agent_slug: string;
  conversation_id: string | null;
  task_id: string | null;
  orchestration_run_id: string | null;
  orchestration_step_id: string | null;
  mode: string;
  status: HumanApprovalStatus;
  approved_by?: string | null;
  decision_at?: string | null;
  metadata?: HumanApprovalMetadata | null;
  created_at?: string;
  updated_at?: string;
}

export interface HumanApprovalCreateInput {
  organizationSlug: string | null;
  agentSlug: string;
  conversationId?: string | null;
  taskId?: string | null;
  orchestrationRunId?: string | null;
  orchestrationStepId?: string | null;
  mode: string;
  metadata?: HumanApprovalMetadata;
}

export interface HumanApprovalDecisionInput {
  id: string;
  status: Extract<HumanApprovalStatus, 'approved' | 'rejected'>;
  approvedBy?: string | null;
  metadata?: HumanApprovalMetadata;
}

export interface HumanApprovalListOptions {
  organizationSlug?: string | null;
  statuses?: HumanApprovalStatus[];
  status?: HumanApprovalStatus;
  mode?: string;
  orchestrationRunId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'decision_at';
  sortDirection?: 'asc' | 'desc';
  createdAfter?: string;
  createdBefore?: string;
}
