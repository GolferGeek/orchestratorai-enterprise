import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type ImprovementKind,
  type ImprovementRequestView,
  type ImprovementStatus,
  type TraceReviewResult,
  type TraceReviewTargetType,
  type TraceReviewView,
} from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;
const REVIEWS = 'trace_reviews';
const IMPROVEMENTS = 'improvement_requests';

const time = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const optionalTime = (v: unknown): string | null => (v === null || v === undefined ? null : time(v));
const optionalText = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toReview(row: Row): TraceReviewView {
  return {
    reviewId: String(row.id),
    runId: String(row.run_id),
    target: { type: row.target_type as TraceReviewTargetType, id: String(row.target_id), label: String(row.target_label) },
    reviewerAgent: String(row.reviewer_agent),
    notes: optionalText(row.notes),
    status: row.status as TraceReviewView['status'],
    result: (row.result ?? null) as TraceReviewResult | null,
    error: optionalText(row.error),
    requestedBy: String(row.requested_by),
    createdAt: time(row.created_at),
    completedAt: optionalTime(row.completed_at),
  };
}

function toImprovement(row: Row): ImprovementRequestView {
  return {
    requestId: String(row.id),
    workflowSlug: String(row.workflow_slug),
    runId: optionalText(row.run_id),
    traceReviewId: optionalText(row.trace_review_id),
    kind: row.kind as ImprovementKind,
    status: row.status as ImprovementStatus,
    title: String(row.title),
    description: String(row.description),
    requestedBy: String(row.requested_by),
    adminNotes: optionalText(row.admin_notes),
    decidedBy: optionalText(row.decided_by),
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
  };
}

/** Trace reviews, improvement requests, and which agent reviews a workflow. */
@Injectable()
export class QualityRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /** The agent linked to review this workflow's traces, if any. */
  async reviewerFor(workflowSlug: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('workflows', 'agent_definition_links')
      .select('agent_slug')
      .eq('workflow_slug', workflowSlug)
      .eq('purpose', 'trace_review');
    if (error) throw new Error(`Failed to read the trace reviewer of ${workflowSlug}: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? String(row.agent_slug) : null;
  }

  async startReview(review: {
    runId: string;
    organizationSlug: string;
    target: { type: TraceReviewTargetType; id: string; label: string };
    reviewerAgent: string;
    requestedBy: string;
    notes: string | null;
  }): Promise<TraceReviewView> {
    const { data, error } = await this.db
      .from('workflows', REVIEWS)
      .insert({
        run_id: review.runId,
        organization_slug: review.organizationSlug,
        target_type: review.target.type,
        target_id: review.target.id,
        target_label: review.target.label,
        reviewer_agent: review.reviewerAgent,
        requested_by: review.requestedBy,
        notes: review.notes,
        status: 'running',
      })
      .select('*');
    if (error) throw new Error(`Failed to start the trace review: ${error.message}`);
    return toReview((data as Row[])[0]!);
  }

  async finishReview(
    id: string,
    outcome: { status: 'completed'; result: TraceReviewResult } | { status: 'failed'; error: string },
  ): Promise<TraceReviewView> {
    const { data, error } = await this.db
      .from('workflows', REVIEWS)
      .update({
        status: outcome.status,
        result: outcome.status === 'completed' ? outcome.result : null,
        error: outcome.status === 'failed' ? outcome.error : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'running')
      .select('*');
    if (error) throw new Error(`Failed to record trace review ${id}: ${error.message}`);
    const row = (data as Row[])[0];
    if (!row) throw new Error(`Trace review ${id} was not running`);
    return toReview(row);
  }

  async reviewsForRun(runId: string): Promise<TraceReviewView[]> {
    const { data, error } = await this.db.from('workflows', REVIEWS).select('*').eq('run_id', runId).order('created_at');
    if (error) throw new Error(`Failed to read the trace reviews of run ${runId}: ${error.message}`);
    return (data as Row[]).map(toReview);
  }

  async review(runId: string, id: string): Promise<TraceReviewView | null> {
    const { data, error } = await this.db.from('workflows', REVIEWS).select('*').eq('run_id', runId).eq('id', id);
    if (error) throw new Error(`Failed to read trace review ${id}: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? toReview(row) : null;
  }

  async fileImprovement(request: {
    organizationSlug: string;
    workflowSlug: string;
    runId: string;
    traceReviewId: string | null;
    kind: ImprovementKind;
    title: string;
    description: string;
    requestedBy: string;
  }): Promise<ImprovementRequestView> {
    const { data, error } = await this.db
      .from('workflows', IMPROVEMENTS)
      .insert({
        organization_slug: request.organizationSlug,
        workflow_slug: request.workflowSlug,
        run_id: request.runId,
        trace_review_id: request.traceReviewId,
        kind: request.kind,
        title: request.title,
        description: request.description,
        requested_by: request.requestedBy,
      })
      .select('*');
    if (error) throw new Error(`Failed to file the improvement request: ${error.message}`);
    return toImprovement((data as Row[])[0]!);
  }

  async improvements(organizationSlug: string, status: ImprovementStatus | null): Promise<ImprovementRequestView[]> {
    let query = this.db.from('workflows', IMPROVEMENTS).select('*').eq('organization_slug', organizationSlug);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to read the improvement requests: ${error.message}`);
    return (data as Row[]).map(toImprovement);
  }

  async decideImprovement(
    organizationSlug: string,
    id: string,
    decision: { status: ImprovementStatus; adminNotes: string | null; decidedBy: string },
  ): Promise<ImprovementRequestView | null> {
    const { data, error } = await this.db
      .from('workflows', IMPROVEMENTS)
      .update({
        status: decision.status,
        admin_notes: decision.adminNotes,
        decided_by: decision.decidedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_slug', organizationSlug)
      .eq('id', id)
      .select('*');
    if (error) throw new Error(`Failed to update improvement request ${id}: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? toImprovement(row) : null;
  }
}
