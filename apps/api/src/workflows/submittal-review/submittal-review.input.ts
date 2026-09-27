import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const SUBMITTAL_REVIEW_SLUG = 'submittal-review';
const MAX_TEXT = 30000;

/** `start` input: { specSection: "23 74 13", submittalText? } - the submittal as text, or one uploaded document. */
export interface SubmittalReviewInput {
  specSection: string;
  submittalText: string | null;
}

export function parseSubmittalReviewInput(input: JsonValue): SubmittalReviewInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WorkflowInputError('input must be an object with specSection');
  const extra = Object.keys(input).filter((k) => k !== 'specSection' && k !== 'submittalText');
  if (extra.length) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  const { specSection, submittalText } = input;
  if (typeof specSection !== 'string' || !/^\d{2} \d{2} \d{2}$/.test(specSection)) throw new WorkflowInputError('input.specSection must be a section number like "23 74 13"');
  if (submittalText !== undefined && submittalText !== null) {
    if (typeof submittalText !== 'string' || !submittalText.trim()) throw new WorkflowInputError('input.submittalText must be the submittal as text');
    if (submittalText.length > MAX_TEXT) throw new WorkflowInputError(`input.submittalText must be at most ${MAX_TEXT} characters`);
  }
  return { specSection, submittalText: typeof submittalText === 'string' ? submittalText.trim() : null };
}

export function submittalReviewRunTitle(input: JsonValue): string {
  return `Submittal for ${parseSubmittalReviewInput(input).specSection}`;
}
