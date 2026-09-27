import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkUnitService } from '../shared/work-units';
import type { ActivityStoreService } from './activity-store.service';
import { ExecDigestStateAnnotation } from './exec-digest.state';
import { createComposeNode } from './nodes/compose.node';
import { createGatherNode } from './nodes/gather.node';
import { createSummarizeNode } from './nodes/summarize.node';

/**
 * Weekly executive digest:  gather → summarize (panel, one writer per
 * department) → compose (the company view) → END.  No human gate: it reports.
 */
export function createExecDigestGraph(deps: {
  units: WorkUnitService;
  store: ActivityStoreService;
  checkpointer: BaseCheckpointSaver;
  today?: () => string;
}) {
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  return new StateGraph(ExecDigestStateAnnotation)
    .addNode('gather', createGatherNode({ store: deps.store, today }))
    .addNode('summarize', createSummarizeNode({ units: deps.units }))
    .addNode('compose', createComposeNode({ units: deps.units }))
    .addEdge('__start__', 'gather')
    .addEdge('gather', 'summarize')
    .addEdge('summarize', 'compose')
    .addEdge('compose', END)
    .compile({ checkpointer: deps.checkpointer });
}

export type ExecDigestGraph = ReturnType<typeof createExecDigestGraph>;
