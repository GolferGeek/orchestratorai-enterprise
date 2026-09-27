import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import type { IssueLedgerService } from '../shared/ledger';
import type { WorkUnitService } from '../shared/work-units';
import type { FinanceStoreService } from './finance-store.service';
import { InvoiceReviewStateAnnotation, type InvoiceReviewState } from './invoice-review.state';
import { createExtractNode } from './nodes/extract.node';
import { createMatchNode } from './nodes/match.node';
import { createReadNode } from './nodes/read.node';
import { createRecordNode } from './nodes/record.node';
import { createReviewNode } from './nodes/review.node';

/** A clean invoice (no exceptions, Jev passes) is approved without a person. */
export const needsReview = (state: InvoiceReviewState) => (state.exceptions.length > 0 ? 'review' : 'record');

/**
 * Invoice exception review:
 *   read → extract (agent) → match (code + Jev) ─┬→ review (person) → record → END
 *                                                └→ record (auto-approved) → END
 */
export function createInvoiceReviewGraph(deps: {
  units: WorkUnitService;
  store: FinanceStoreService;
  documents: WorkflowDocumentsService;
  ledger: IssueLedgerService;
  checkpointer: BaseCheckpointSaver;
}) {
  return new StateGraph(InvoiceReviewStateAnnotation)
    .addNode('read', createReadNode({ store: deps.store, documents: deps.documents }))
    .addNode('extract', createExtractNode({ units: deps.units }))
    .addNode('match', createMatchNode({ units: deps.units, store: deps.store, ledger: deps.ledger }))
    .addNode('review', createReviewNode({ units: deps.units, ledger: deps.ledger }))
    .addNode('record', createRecordNode({ store: deps.store }))
    .addEdge('__start__', 'read')
    .addEdge('read', 'extract')
    .addEdge('extract', 'match')
    .addConditionalEdges('match', needsReview, ['review', 'record'])
    .addEdge('review', 'record')
    .addEdge('record', END)
    .compile({ checkpointer: deps.checkpointer });
}
