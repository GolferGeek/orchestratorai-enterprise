import { ISSUE_TRANSITIONS, type LedgerIssue } from '@orchestrator-ai/transport-types';
import { summarize } from './issue-ledger.service';

const issue = (status: LedgerIssue['status'], severity: LedgerIssue['severity']) => ({ status, severity }) as LedgerIssue;

describe('issue ledger summary', () => {
  it('counts every status and severity, and treats identified and accepted as open', () => {
    const summary = summarize([
      issue('identified', 'critical'),
      issue('accepted', 'high'),
      issue('addressed', 'high'),
      issue('not_addressed', 'medium'),
      issue('rejected', 'low'),
    ]);
    expect(summary).toEqual({
      total: 5,
      open: 2,
      byStatus: { identified: 1, accepted: 1, rejected: 1, addressed: 1, not_addressed: 1, report_only: 0 },
      bySeverity: { critical: 1, high: 2, medium: 1, low: 1, info: 0 },
    });
  });
});

describe('issue status model', () => {
  it('never lets an issue go back to identified, and ends at rejected, addressed and report_only', () => {
    for (const targets of Object.values(ISSUE_TRANSITIONS)) expect(targets).not.toContain('identified');
    expect([ISSUE_TRANSITIONS.rejected, ISSUE_TRANSITIONS.addressed, ISSUE_TRANSITIONS.report_only]).toEqual([[], [], []]);
  });
});
