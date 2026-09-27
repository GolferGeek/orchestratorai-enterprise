import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkUnitService } from '../shared/work-units';
import { createDraftNode } from './nodes/draft.node';
import { createPublishNode } from './nodes/publish.node';
import { createReviewNode } from './nodes/review.node';
import { createSeverityNode } from './nodes/severity.node';
import type { PostmortemTasksService } from './postmortem-tasks.service';
import { PostmortemStateAnnotation } from './postmortem.state';

/** Incident postmortem:  severity (Jev) → draft (writer + action items) → review (person) → publish (tasks) → END. */
export function createPostmortemGraph(deps: { units: WorkUnitService; tasks: PostmortemTasksService; webUrl: string; checkpointer: BaseCheckpointSaver }) {
  return new StateGraph(PostmortemStateAnnotation)
    .addNode('severity', createSeverityNode({ units: deps.units }))
    .addNode('draft', createDraftNode({ units: deps.units }))
    .addNode('review', createReviewNode({ units: deps.units }))
    .addNode('publish', createPublishNode({ tasks: deps.tasks, webUrl: deps.webUrl }))
    .addEdge('__start__', 'severity')
    .addEdge('severity', 'draft')
    .addEdge('draft', 'review')
    .addEdge('review', 'publish')
    .addEdge('publish', END)
    .compile({ checkpointer: deps.checkpointer });
}
