import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { IssueLedgerService, IssueStatusChange } from '../../shared/ledger';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { actionFor, parseRewrite, type Finding } from '../findings';
import type { SubmittalReviewState } from '../submittal-review.state';
import { FINDINGS_STAGE, findingIssues } from './evaluate.node';

/** The reviewer confirms the findings, or corrects them item by item ("noted: ..." accepts a deviation). */
export const SUBMITTAL_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'review-findings',
  kind: 'approval',
  allowedDecisions: ['approve', 'modify'],
  allowItemDecisions: true,
  onReject: 'fail',
  taskTitle: 'Submittal findings to review',
};

/** The reviewer's decisions applied: accept keeps a finding, reject drops it (not applicable), modify rewrites it. */
export function applyDecisions(findings: Finding[], items: Array<{ itemId: string; decision: 'accept' | 'reject' | 'modify'; replacement?: unknown }>): Finding[] {
  const byRef = new Map(items.map((i) => [i.itemId, i]));
  for (const id of byRef.keys()) if (!findings.some((f) => f.ref === id)) throw new Error(`No finding ${id} to decide on`);
  return findings.flatMap((f) => {
    const item = byRef.get(f.ref);
    if (!item || item.decision === 'accept') return [f];
    if (item.decision === 'reject') return [];
    if (typeof item.replacement !== 'string') throw new Error(`The rewrite for ${f.ref} must be text`);
    return [{ ...f, ...parseRewrite(f.ref, item.replacement) }];
  });
}

/** How the review settles each ledger issue. */
export function settle(before: Finding[], after: Finding[]): IssueStatusChange[] {
  const final = new Map(after.map((f) => [f.ref, f]));
  return findingIssues(before).map((issue) => {
    const ref = String((issue.subject as { ref: string }).ref);
    const f = final.get(ref);
    if (issue.category === 'unverified-evidence') return { stageSlug: FINDINGS_STAGE, issueKey: issue.issueKey, status: 'addressed', rationale: 'Checked by the reviewer' };
    if (!f) return { stageSlug: FINDINGS_STAGE, issueKey: issue.issueKey, status: 'rejected', rationale: 'Not applicable (reviewer)' };
    if (f.status === 'compliant') return { stageSlug: FINDINGS_STAGE, issueKey: issue.issueKey, status: 'rejected', rationale: `Compliant (reviewer): ${f.note}` };
    if (f.status === 'noted') return { stageSlug: FINDINGS_STAGE, issueKey: issue.issueKey, status: 'report_only', rationale: `Accepted as noted: ${f.note}` };
    return { stageSlug: FINDINGS_STAGE, issueKey: issue.issueKey, status: 'accepted', rationale: `The contractor must address it: ${f.note}` };
  });
}

export function createReviewNode(deps: { units: WorkUnitService; ledger: IssueLedgerService }) {
  return async (state: SubmittalReviewState, config: LangGraphRunnableConfig): Promise<Partial<SubmittalReviewState>> => {
    const round = state.reviewRound;
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'review-findings',
      gate: SUBMITTAL_GATE,
      round,
      payload: {
        specSection: state.specSection,
        proposedAction: actionFor(state.findings),
        items: state.findings.map((f) => ({ itemId: f.ref, requirement: f.requirement, status: f.status, evidence: f.evidence, evidenceVerified: f.evidenceVerified, note: f.note })),
      },
    });
    const route = routeAfterDecision(SUBMITTAL_GATE, response);
    let findings: Finding[];
    if (route === 'approved') findings = state.findings;
    else if (route === 'modified' && response.kind === 'decision' && response.decision.type === 'modify') findings = applyDecisions(state.findings, response.decision.items);
    else throw new Error(`The findings review ended with "${route}", which this gate does not allow.`);
    await deps.ledger.move(scopeOf(state), settle(state.findings, findings), `review:${SUBMITTAL_GATE.slug}#${round}`);
    const action = actionFor(findings);
    await reportProgress(config, 'review', 80, `Reviewed: ${action.replace(/_/g, ' ')}`);
    return { findings, action, reviewRound: round + 1 };
  };
}
