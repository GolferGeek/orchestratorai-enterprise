/** One requirement's finding: the evaluator's, then the reviewer's word. */
export interface Finding {
  ref: string;
  requirement: string;
  /** noted: a deviation the reviewer accepts (approved as noted). */
  status: 'compliant' | 'noted' | 'deviation' | 'missing';
  evidence: string | null;
  note: string;
  /** Jev citation-in-record on the evidence: true verified, false not in the submittal, null no evidence to check. */
  evidenceVerified: boolean | null;
}

export type SubmittalAction = 'approved' | 'approved_as_noted' | 'revise_and_resubmit';

/** The action code is a rule, not a judgment: anything open sends it back. */
export function actionFor(findings: Finding[]): SubmittalAction {
  if (findings.some((f) => f.status === 'deviation' || f.status === 'missing')) return 'revise_and_resubmit';
  if (findings.some((f) => f.status === 'noted')) return 'approved_as_noted';
  return 'approved';
}

export const ACTION_LABELS: Record<SubmittalAction, string> = {
  approved: 'Approved',
  approved_as_noted: 'Approved as noted',
  revise_and_resubmit: 'Revise and resubmit',
};

/**
 * A reviewer's rewrite of a finding: "<status>: <note>", status one of
 * compliant, noted, deviation, missing.
 */
export function parseRewrite(ref: string, text: string): Pick<Finding, 'status' | 'note'> {
  const match = /^\s*(compliant|noted|deviation|missing)\s*:\s*(.+)$/is.exec(text);
  if (!match) throw new Error(`The rewrite for ${ref} must start with compliant:, noted:, deviation: or missing:, then the note`);
  return { status: match[1]!.toLowerCase() as Finding['status'], note: match[2]!.trim() };
}
