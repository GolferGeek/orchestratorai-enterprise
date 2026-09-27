import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import type { IssueLedgerService } from '../shared/ledger';
import type { WorkUnitService } from '../shared/work-units';
import { createEvaluateNode } from './nodes/evaluate.node';
import { createReadNode } from './nodes/read.node';
import { createRespondNode } from './nodes/respond.node';
import { createReviewNode } from './nodes/review.node';
import type { SpecLibraryService } from './spec-library.service';
import type { SubmittalDecisionsService } from './submittal-decisions.service';
import { SubmittalReviewStateAnnotation } from './submittal-review.state';

/**
 * Submittal review:  read → evaluate (requirements agent, evaluator panel,
 * Jev evidence check) → review (person) → respond (action by rule, letter by
 * a writer) → END.
 */
export function createSubmittalReviewGraph(deps: {
  units: WorkUnitService;
  specs: SpecLibraryService;
  documents: WorkflowDocumentsService;
  ledger: IssueLedgerService;
  decisions: SubmittalDecisionsService;
  checkpointer: BaseCheckpointSaver;
}) {
  return new StateGraph(SubmittalReviewStateAnnotation)
    .addNode('read', createReadNode({ specs: deps.specs, documents: deps.documents }))
    .addNode('evaluate', createEvaluateNode({ units: deps.units, ledger: deps.ledger }))
    .addNode('review', createReviewNode({ units: deps.units, ledger: deps.ledger }))
    .addNode('respond', createRespondNode({ units: deps.units, decisions: deps.decisions }))
    .addEdge('__start__', 'read')
    .addEdge('read', 'evaluate')
    .addEdge('evaluate', 'review')
    .addEdge('review', 'respond')
    .addEdge('respond', END)
    .compile({ checkpointer: deps.checkpointer });
}
