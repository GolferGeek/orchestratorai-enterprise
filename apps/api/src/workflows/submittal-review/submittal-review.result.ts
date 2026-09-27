import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { Finding, SubmittalAction } from './findings';
import type { SubmittalReviewState } from './submittal-review.state';

export interface SubmittalReviewResult {
  specSection: string;
  action: SubmittalAction;
  letter: string;
  findings: Finding[];
}

export function submittalReviewResult(state: SubmittalReviewState): JsonValue {
  if (!state.action || !state.letter) throw new Error('The submittal review finished without an action or a letter. This is a bug.');
  const result: SubmittalReviewResult = { specSection: state.specSection, action: state.action, letter: state.letter, findings: state.findings };
  return result as unknown as JsonValue;
}
