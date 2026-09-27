/**
 * The issue ledger of a workflow run: findings raised by its stages and what
 * happened to each. `GET /workflows/:slug/runs/:runId/issues`.
 */
import type { JsonValue } from '../shared/json.types';

export const ISSUE_STATUSES = ['identified', 'accepted', 'rejected', 'addressed', 'not_addressed', 'report_only'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

/**
 * Which status an issue may move to from each status. A stage raises issues
 * as identified (or report_only); people and later stages move them on.
 */
export const ISSUE_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  identified: ['accepted', 'rejected', 'addressed', 'not_addressed', 'report_only'],
  accepted: ['addressed', 'not_addressed'],
  not_addressed: ['addressed'],
  rejected: [],
  addressed: [],
  report_only: [],
};

export interface LedgerIssue {
  issueId: string;
  stageSlug: string;
  issueKey: string;
  source: string;
  status: IssueStatus;
  severity: IssueSeverity;
  category: string;
  title: string;
  finding: string;
  recommendedAction: string | null;
  subject: JsonValue | null;
  /** The move that set the current status (the raise, for a new issue). */
  lastChange: { actor: string; rationale: string | null; at: string };
  createdAt: string;
  updatedAt: string;
}

export interface IssueLedgerView {
  runId: string;
  /** Most severe first. */
  issues: LedgerIssue[];
  summary: {
    total: number;
    /** identified or accepted: still needs something. */
    open: number;
    byStatus: Record<IssueStatus, number>;
    bySeverity: Record<IssueSeverity, number>;
  };
}
