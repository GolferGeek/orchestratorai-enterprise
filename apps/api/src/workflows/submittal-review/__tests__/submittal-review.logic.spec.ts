import { WorkflowInputError } from '../../catalog/workflow.registry';
import { actionFor, parseRewrite, type Finding } from '../findings';
import { findingIssues } from '../nodes/evaluate.node';
import { applyDecisions, settle } from '../nodes/review.node';
import { submittalReviewExporter } from '../submittal-review.exporter';
import { parseSubmittalReviewInput } from '../submittal-review.input';

const finding = (ref: string, status: Finding['status'], evidenceVerified: boolean | null = true): Finding => ({
  ref, requirement: `Requirement ${ref}`, status, evidence: status === 'missing' ? null : `quote ${ref}`, note: `note ${ref}`, evidenceVerified,
});

describe('submittal input', () => {
  it('takes a section number and optional submittal text', () => {
    expect(parseSubmittalReviewInput({ specSection: '23 74 13', submittalText: ' RTU ' })).toEqual({ specSection: '23 74 13', submittalText: 'RTU' });
    expect(() => parseSubmittalReviewInput({ specSection: '237413' })).toThrow(WorkflowInputError);
  });
});

describe('the action is a rule', () => {
  it('sends back anything open, notes accepted deviations, approves the rest', () => {
    expect(actionFor([finding('2.1.A', 'compliant')])).toBe('approved');
    expect(actionFor([finding('2.1.A', 'compliant'), finding('2.1.B', 'noted')])).toBe('approved_as_noted');
    expect(actionFor([finding('2.1.A', 'noted'), finding('2.1.C', 'deviation')])).toBe('revise_and_resubmit');
    expect(actionFor([finding('2.1.A', 'missing')])).toBe('revise_and_resubmit');
  });
});

describe('review', () => {
  const findings = [finding('2.1.B', 'deviation'), finding('2.1.C', 'deviation'), finding('2.1.E', 'compliant', false), finding('1.6.A', 'missing')];

  it('puts deviations, missing items and unverified evidence on the ledger', () => {
    expect(findingIssues(findings).map((i) => i.issueKey)).toEqual(['requirement:2.1.B', 'requirement:2.1.C', 'evidence:2.1.E', 'requirement:1.6.A']);
  });

  it('applies accept, drop and rewrite, and refuses a rewrite without a status', () => {
    const after = applyDecisions(findings, [
      { itemId: '2.1.B', decision: 'modify', replacement: 'noted: IEER 13.8 accepted by the owner' },
      { itemId: '1.6.A', decision: 'reject' },
    ]);
    expect(after.map((f) => [f.ref, f.status])).toEqual([['2.1.B', 'noted'], ['2.1.C', 'deviation'], ['2.1.E', 'compliant']]);
    expect(() => applyDecisions(findings, [{ itemId: '2.1.B', decision: 'modify', replacement: 'fine' }])).toThrow('must start with');
    expect(() => applyDecisions(findings, [{ itemId: '9.9.Z', decision: 'reject' }])).toThrow('No finding 9.9.Z');
    expect(parseRewrite('x', 'Compliant: ok')).toEqual({ status: 'compliant', note: 'ok' });
  });

  it('settles each issue from the final findings', () => {
    const after = applyDecisions(findings, [{ itemId: '2.1.B', decision: 'modify', replacement: 'noted: accepted' }, { itemId: '1.6.A', decision: 'reject' }]);
    expect(settle(findings, after).map((c) => [c.issueKey, c.status])).toEqual([
      ['requirement:2.1.B', 'report_only'],
      ['requirement:2.1.C', 'accepted'],
      ['evidence:2.1.E', 'addressed'],
      ['requirement:1.6.A', 'rejected'],
    ]);
  });
});

describe('export and docs', () => {
  it('exports the response and the findings', () => {
    const result = { specSection: '23 74 13', action: 'revise_and_resubmit', letter: 'Revise and resubmit.\n\nR-410A is not acceptable.', findings: [finding('2.1.C', 'deviation')] };
    const doc = submittalReviewExporter.build({ run: { id: 'r1234567', result } as never, issues: {} as never, exportedAt: new Date() });
    expect(doc.title).toBe('Submittal Review - Section 23 74 13: Revise and resubmit');
    expect(doc.sections[0]!.blocks).toHaveLength(2);
  });

  it('has a brief, both docs and two examples its parser accepts', async () => {
    const { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocsService } = await import('../../shared/docs/workflow-docs.service');
    const brief = await new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT).brief('submittal-review', (i) => parseSubmittalReviewInput(i));
    expect(brief.showcase).toHaveLength(2);
  });
});
