import type {
  HumanReviewDecision,
  ItemDecision,
  JsonValue,
  WorkflowInvokeAction,
} from '@orchestrator-ai/transport-types';
import type { HumanReviewResponse } from './human-review.types';

type ResponseAction = Extract<
  WorkflowInvokeAction,
  { action: 'review.submit' | 'answer.submit' | 'finish' }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function itemDecision(value: unknown): ItemDecision | null {
  if (!isRecord(value) || typeof value.itemId !== 'string' || value.itemId === '') return null;
  if (value.decision === 'accept' || value.decision === 'reject') {
    return { itemId: value.itemId, decision: value.decision };
  }
  if (value.decision === 'modify' && 'replacement' in value) {
    return { itemId: value.itemId, decision: 'modify', replacement: value.replacement as JsonValue };
  }
  return null;
}

function decision(value: unknown): HumanReviewDecision | null {
  if (!isRecord(value) || !optionalText(value.feedback)) return null;
  const feedback = value.feedback;
  switch (value.type) {
    case 'approve':
      return feedback === undefined ? { type: 'approve' } : { type: 'approve', feedback };
    case 'reject':
      return typeof feedback === 'string' && feedback.trim() !== ''
        ? { type: 'reject', feedback }
        : null;
    case 'modify': {
      if (!Array.isArray(value.items) || value.items.length === 0) return null;
      const items = value.items.map(itemDecision);
      if (items.some((item) => item === null)) return null;
      const checked = items as ItemDecision[];
      return feedback === undefined
        ? { type: 'modify', items: checked }
        : { type: 'modify', items: checked, feedback };
    }
    default:
      return null;
  }
}

/**
 * The response a review/answer/finish action carries, fully checked. Returns
 * a message for the caller when it is malformed.
 */
export function parseReviewResponse(
  action: ResponseAction,
): { response: HumanReviewResponse } | { error: string } {
  switch (action.action) {
    case 'review.submit': {
      const parsed = decision(action.decision);
      return parsed
        ? { response: { kind: 'decision', decision: parsed } }
        : {
            error:
              'decision must be approve, reject with feedback, or modify with item decisions',
          };
    }
    case 'answer.submit': {
      const { text, turn } = action.answer;
      return typeof text === 'string' && text.trim() !== '' && Number.isInteger(turn) && turn >= 0
        ? { response: { kind: 'answer', answer: { text, turn } } }
        : { error: 'answer must have non-empty text and a turn number' };
    }
    case 'finish':
      return { response: { kind: 'finish' } };
  }
}
