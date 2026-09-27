import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const COMPETITOR_WATCH_SLUG = 'competitor-watch';

/**
 * What each page is compared with: its snapshot from the last run, or its
 * Internet Archive copy from about 90 days ago (a quarter's changes, and the
 * way to get a first comparison before there is any history).
 */
export type CompareWith = 'last-run' | 'archive-90-days';
export const ARCHIVE_LOOKBACK_DAYS = 90;

export function parseCompetitorWatchInput(input: JsonValue): { compareWith: CompareWith } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkflowInputError('input must be an object with compareWith');
  }
  const extra = Object.keys(input).filter((k) => k !== 'compareWith');
  if (extra.length) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  if (input.compareWith !== 'last-run' && input.compareWith !== 'archive-90-days') {
    throw new WorkflowInputError('input.compareWith must be "last-run" or "archive-90-days"');
  }
  return { compareWith: input.compareWith };
}

export function competitorWatchRunTitle(input: JsonValue): string {
  return parseCompetitorWatchInput(input).compareWith === 'last-run'
    ? 'Competitor watch - since the last run'
    : 'Competitor watch - the last 90 days';
}
