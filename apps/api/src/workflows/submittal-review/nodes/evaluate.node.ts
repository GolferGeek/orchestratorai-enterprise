import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { IssueLedgerService, RaisedIssue } from '../../shared/ledger';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { Finding } from '../findings';
import type { SubmittalReviewState } from '../submittal-review.state';

export const FINDINGS_STAGE = 'submittal-findings';

interface Requirement {
  ref: string;
  requirement: string;
}
interface Evaluation {
  status: 'compliant' | 'deviation' | 'missing';
  evidence: string | null;
  note: string;
}

/** Findings that go on the ledger: anything not plainly compliant, and evidence Jev could not find. */
export function findingIssues(findings: Finding[]): RaisedIssue[] {
  const issues: RaisedIssue[] = [];
  for (const f of findings) {
    if (f.status === 'deviation' || f.status === 'missing') {
      issues.push({ issueKey: `requirement:${f.ref}`, source: 'submittal-evaluator', severity: f.status === 'missing' ? 'high' : 'medium', category: f.status, title: `${f.ref} ${f.status}`, finding: `${f.requirement} - ${f.note}`, subject: { ref: f.ref } });
    }
    if (f.evidenceVerified === false) {
      issues.push({ issueKey: `evidence:${f.ref}`, source: 'jev:citation-in-record', severity: 'high', category: 'unverified-evidence', title: `${f.ref} evidence not in the submittal`, finding: `The evaluator quoted "${f.evidence}", which Jev did not find in the submittal.`, subject: { ref: f.ref } });
    }
  }
  return issues;
}

/**
 * List the section's checkable requirements (an agent), evaluate each one
 * against the submittal (a panel), and have Jev confirm every quoted piece of
 * evidence is really in the submittal. Findings go on the ledger.
 */
export function createEvaluateNode(deps: { units: WorkUnitService; ledger: IssueLedgerService }) {
  return async (state: SubmittalReviewState, config: LangGraphRunnableConfig): Promise<Partial<SubmittalReviewState>> => {
    const scope = scopeOf(state);
    await reportProgress(config, 'requirements', 20, `Listing the requirements of ${state.specSection}`);
    const { requirements } = await deps.units.runSolo<{ requirements: Requirement[] }>(scope, {
      slug: 'list-requirements',
      agent: 'spec-requirement-extractor',
      input: { section: state.specSection, specText: state.specText! },
    });

    await reportProgress(config, 'evaluate', 40, `Checking ${requirements.length} requirement(s) against the submittal`);
    const panel = await deps.units.runPanel<Evaluation>(scope, {
      slug: 'evaluate-requirements',
      panelists: requirements.map((r) => ({ agent: 'submittal-evaluator', label: r.ref, input: { ref: r.ref, requirement: r.requirement, submittalText: state.submittalText! } })),
      maxConcurrent: 6,
      policy: { mode: 'fail_all' },
    });
    let findings: Finding[] = panel.results.map((result, i) => {
      if (!result.ok) throw new Error(`No evaluation for ${requirements[i]!.ref}: ${result.error}`);
      const evaluation = result.output;
      return { ...requirements[i]!, status: evaluation.status, evidence: evaluation.evidence?.trim() ? evaluation.evidence.trim() : null, note: evaluation.note, evidenceVerified: null };
    });

    const quoted = findings.filter((f) => f.evidence !== null);
    if (quoted.length > 0) {
      await reportProgress(config, 'verify', 60, `Verifying ${quoted.length} quoted piece(s) of evidence`);
      const verdicts = await deps.units.runCheck(scope, {
        slug: 'verify-evidence',
        checks: quoted.map((f) => ({ rubric: 'citation-in-record', label: f.ref, inputs: { claim: f.evidence!, record: state.submittalText! } })),
      });
      const verified = new Map(quoted.map((f, i) => [f.ref, verdicts[i]!.decision !== 'block']));
      findings = findings.map((f) => (f.evidence === null ? f : { ...f, evidenceVerified: verified.get(f.ref)! }));
    }

    await deps.ledger.raise(scope, FINDINGS_STAGE, findingIssues(findings));
    return { findings };
  };
}
