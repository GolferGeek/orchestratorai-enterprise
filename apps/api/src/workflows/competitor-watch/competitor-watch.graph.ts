import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkUnitService } from '../shared/work-units';
import { CompetitorWatchStateAnnotation, type CompetitorWatchState } from './competitor-watch.state';
import { createCaptureNode } from './nodes/capture.node';
import { createClassifyNode } from './nodes/classify.node';
import { createSummarizeNode } from './nodes/summarize.node';
import type { PageFetcherService } from './page-fetcher.service';
import type { SourcesStoreService } from './sources-store.service';

/** Whether there is anything for Jev to classify. */
export const hasChanges = (state: CompetitorWatchState) => (state.changes.length > 0 ? 'classify' : 'summarize');

/**
 * Competitor watch:  capture (fetch, store, diff) → classify (Jev, when there
 * are changes) → summarize (the writer, when something is material) → END.
 */
export function createCompetitorWatchGraph(deps: {
  units: WorkUnitService;
  store: SourcesStoreService;
  fetcher: PageFetcherService;
  checkpointer: BaseCheckpointSaver;
  now?: () => Date;
}) {
  return new StateGraph(CompetitorWatchStateAnnotation)
    .addNode('capture', createCaptureNode({ store: deps.store, fetcher: deps.fetcher, now: deps.now ?? (() => new Date()) }))
    .addNode('classify', createClassifyNode({ units: deps.units }))
    .addNode('summarize', createSummarizeNode({ units: deps.units }))
    .addEdge('__start__', 'capture')
    .addConditionalEdges('capture', hasChanges, ['classify', 'summarize'])
    .addEdge('classify', 'summarize')
    .addEdge('summarize', END)
    .compile({ checkpointer: deps.checkpointer });
}
