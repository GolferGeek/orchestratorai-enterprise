import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { OrgActivity } from './activity-store.service';
import type { ExecDigestState, OrgSummary } from './exec-digest.state';
import { companyTotals } from './exec-digest.totals';

export interface ExecDigestResult {
  weekEnding: string;
  companySummary: string;
  totals: ReturnType<typeof companyTotals>;
  departments: Array<OrgSummary & { activity: OrgActivity }>;
}

export function execDigestResult(state: ExecDigestState): JsonValue {
  if (!state.weekEnding || !state.companySummary || state.summaries.length !== state.activity.length) {
    throw new Error('The digest finished without its week, summaries or company summary. This is a bug, not an empty digest.');
  }
  const result: ExecDigestResult = {
    weekEnding: state.weekEnding,
    companySummary: state.companySummary,
    totals: companyTotals(state.activity),
    departments: state.summaries.map((s, i) => ({ ...s, activity: state.activity[i]! })),
  };
  return result as unknown as JsonValue;
}
