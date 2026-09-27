import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { CompareWith } from './competitor-watch.input';
import type { CompetitorWatchState, PageChange, SourceOutcome } from './competitor-watch.state';
import { isMaterial } from './nodes/summarize.node';

export interface CompetitorWatchResult {
  compareWith: CompareWith;
  summary: string;
  sources: SourceOutcome[];
  material: PageChange[];
  noise: number;
}

export function competitorWatchResult(state: CompetitorWatchState): JsonValue {
  if (!state.summary) throw new Error('The watch finished without a summary. This is a bug, not an empty report.');
  if (state.changes.some((c) => c.decision === null)) throw new Error('A change was never classified. This is a bug.');
  const result: CompetitorWatchResult = {
    compareWith: state.compareWith,
    summary: state.summary,
    sources: state.sources,
    material: state.changes.filter(isMaterial),
    noise: state.changes.filter((c) => !isMaterial(c)).length,
  };
  return result as unknown as JsonValue;
}
