import { Injectable } from '@nestjs/common';
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type IssueLedgerView,
  type IssueSeverity,
  type IssueStatus,
  type LedgerIssue,
} from '@orchestrator-ai/transport-types';
import type { RunModelScope } from '../models';
import { IssueLedgerRepository, type IssueStatusChange, type RaisedIssue } from './issue-ledger.repository';

const SEVERITY_ORDER = new Map(ISSUE_SEVERITIES.map((s, i) => [s, i]));

/**
 * The run's issue ledger, for workflow steps. The run comes from the scope
 * (its ExecutionContext.conversationId), so an issue can never be recorded
 * without one.
 */
@Injectable()
export class IssueLedgerService {
  constructor(private readonly repo: IssueLedgerRepository) {}

  raise(scope: RunModelScope, stageSlug: string, issues: RaisedIssue[], workUnitRunId: string | null = null): Promise<void> {
    return this.repo.replaceStage({
      runId: scope.executionContext.conversationId,
      organizationSlug: scope.executionContext.orgSlug,
      stageSlug,
      workUnitRunId,
      issues,
    });
  }

  /** `actor`: 'stage:<slug>' for a later stage, 'human:<user id>' for a person. */
  move(scope: RunModelScope, changes: IssueStatusChange[], actor: string): Promise<void> {
    return this.repo.changeStatuses({
      runId: scope.executionContext.conversationId,
      organizationSlug: scope.executionContext.orgSlug,
      changes,
      actor,
    });
  }

  /** Seed a restarted run's ledger from its parent's, as of the branch point. */
  async copyAsOf(fromRunId: string, scope: RunModelScope, at: Date, actor: string): Promise<number> {
    const context = scope.executionContext;
    return this.repo.copyAsOf({
      fromRunId,
      toRunId: context.conversationId,
      organizationSlug: context.orgSlug,
      at,
      actor,
    });
  }

  async view(runId: string): Promise<IssueLedgerView> {
    const issues = (await this.repo.list(runId)).sort(
      (a, b) => SEVERITY_ORDER.get(a.severity)! - SEVERITY_ORDER.get(b.severity)! || a.createdAt.localeCompare(b.createdAt),
    );
    return { runId, issues, summary: summarize(issues) };
  }
}

export function summarize(issues: LedgerIssue[]): IssueLedgerView['summary'] {
  const byStatus = Object.fromEntries(ISSUE_STATUSES.map((s) => [s, 0])) as Record<IssueStatus, number>;
  const bySeverity = Object.fromEntries(ISSUE_SEVERITIES.map((s) => [s, 0])) as Record<IssueSeverity, number>;
  for (const issue of issues) {
    byStatus[issue.status] += 1;
    bySeverity[issue.severity] += 1;
  }
  return { total: issues.length, open: byStatus.identified + byStatus.accepted, byStatus, bySeverity };
}
