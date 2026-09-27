import { Annotation } from '@langchain/langgraph';
import { runtimeStateChannels } from '../shared/runs';
import type { CompareWith } from './competitor-watch.input';

/** How one page fared this run. */
export interface SourceOutcome {
  sourceId: string;
  competitor: string;
  page: string;
  url: string;
  /** compared: a baseline existed; baseline: first capture, nothing to compare; failed: see error. */
  status: 'compared' | 'baseline' | 'failed';
  baselineFrom: string | null;
  error: string | null;
}

export interface PageChange {
  sourceId: string;
  competitor: string;
  page: string;
  removed: string[];
  added: string[];
  /** Filled by the classify step (Jev competitor-change). */
  type: string | null;
  decision: 'pass' | 'review' | 'block' | null;
  reason: string | null;
}

export const CompetitorWatchStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  compareWith: Annotation<CompareWith>({ reducer: (_, n) => n, default: () => 'last-run' }),
  sources: Annotation<SourceOutcome[]>({ reducer: (_, n) => n, default: () => [] }),
  changes: Annotation<PageChange[]>({ reducer: (_, n) => n, default: () => [] }),
  summary: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

export type CompetitorWatchState = typeof CompetitorWatchStateAnnotation.State;
