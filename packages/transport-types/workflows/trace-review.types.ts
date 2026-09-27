/**
 * Trace review (a reviewer agent's read of one step or one agent call of a
 * run) and improvement requests (a person's proposal to change a prompt, a
 * model choice or the workflow, worked by org admins).
 */
export type TraceReviewTargetType = 'work_unit' | 'participant';
export type ImprovementKind = 'context' | 'model' | 'workflow';
export const IMPROVEMENT_KINDS: readonly ImprovementKind[] = ['context', 'model', 'workflow'];
export type ImprovementStatus = 'open' | 'accepted' | 'rejected' | 'done';
export const IMPROVEMENT_STATUSES: readonly ImprovementStatus[] = ['open', 'accepted', 'rejected', 'done'];

export interface TraceReviewRecommendation {
  kind: ImprovementKind;
  priority: 'low' | 'medium' | 'high';
  recommendation: string;
  rationale: string;
}

export interface TraceReviewResult {
  summary: string;
  concerns: string[];
  recommendations: TraceReviewRecommendation[];
  restartWorthwhile: boolean;
  restartInstruction: string | null;
  confidence: number;
}

export interface TraceReviewView {
  reviewId: string;
  runId: string;
  target: { type: TraceReviewTargetType; id: string; label: string };
  reviewerAgent: string;
  notes: string | null;
  status: 'running' | 'completed' | 'failed';
  result: TraceReviewResult | null;
  error: string | null;
  requestedBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface ImprovementRequestView {
  requestId: string;
  workflowSlug: string;
  runId: string | null;
  traceReviewId: string | null;
  kind: ImprovementKind;
  status: ImprovementStatus;
  title: string;
  description: string;
  requestedBy: string;
  adminNotes: string | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
