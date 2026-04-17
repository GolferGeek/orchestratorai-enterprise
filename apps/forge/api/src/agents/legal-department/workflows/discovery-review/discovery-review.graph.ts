/**
 * Discovery Document Review — LangGraph Workflow.
 *
 * Full graph shape:
 *   __start__ → start → protocol_validation → ingest → classify_all
 *     → dispatch_loop → [code_document → dispatch_loop]*
 *     → build_batches
 *     → batch_hitl_privilege     (HITL: interrupt/resume)
 *     → batch_hitl_relevance     (HITL: interrupt/resume)
 *     → batch_hitl_hot_docs      (HITL: interrupt/resume)
 *     → batch_hitl_sample        (HITL: interrupt/resume)
 *     → calibration_check
 *     → generate_production_set
 *     → complete
 *
 * dispatch_loop routes to code_document while items remain in the queue,
 * then to build_batches when the queue is empty. Each HITL node either
 * passes through immediately (if its batch type is absent) or pauses for
 * human review via LangGraph interrupt().
 *
 * See: docs/efforts/current/discovery-document-review/prd.md §4.1
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  DiscoveryReviewStateAnnotation,
  type DiscoveryReviewState,
} from './discovery-review.state';
import { createStartNode } from './nodes/start.node';
import { createProtocolValidationNode } from './nodes/protocol-validation.node';
import { createIngestNode } from './nodes/ingest.node';
import { createClassifyAllNode } from './nodes/classify-all.node';
import { createDispatchLoopNode } from './nodes/dispatch-loop.node';
import { createCodeDocumentNode } from './nodes/code-document.node';
import { createBuildBatchesNode } from './nodes/build-batches.node';
import { createBatchHitlPrivilegeNode } from './nodes/batch-hitl-privilege.node';
import { createBatchHitlRelevanceNode } from './nodes/batch-hitl-relevance.node';
import { createBatchHitlHotDocsNode } from './nodes/batch-hitl-hot-docs.node';
import { createBatchHitlSampleNode } from './nodes/batch-hitl-sample.node';
import { createCalibrationCheckNode } from './nodes/calibration-check.node';
import { createGenerateProductionSetNode } from './nodes/generate-production-set.node';
import { createCompleteNode } from './nodes/complete.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { LegalDocumentsStorageService } from '../../jobs/legal-documents-storage.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DiscoveryReviewGraph = CompiledStateGraph<any, any, any>;

export async function createDiscoveryReviewGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  documentsStorage: LegalDocumentsStorageService,
): Promise<DiscoveryReviewGraph> {
  // ── Instantiate Nodes ───────────────────────────────────────────────────
  const startNode = createStartNode(observability);
  const protocolValidationNode = createProtocolValidationNode(observability);
  const ingestNode = createIngestNode(observability, documentsStorage);
  const classifyAllNode = createClassifyAllNode(llmClient, observability);
  const dispatchLoopNode = createDispatchLoopNode();
  const codeDocumentNode = createCodeDocumentNode(llmClient, observability);
  const buildBatchesNode = createBuildBatchesNode(observability);
  const batchHitlPrivilegeNode = createBatchHitlPrivilegeNode(observability);
  const batchHitlRelevanceNode = createBatchHitlRelevanceNode(observability);
  const batchHitlHotDocsNode = createBatchHitlHotDocsNode(observability);
  const batchHitlSampleNode = createBatchHitlSampleNode(observability);
  const calibrationCheckNode = createCalibrationCheckNode(observability);
  const generateProductionSetNode =
    createGenerateProductionSetNode(observability);
  const completeNode = createCompleteNode(observability);

  // ── Inline error node ───────────────────────────────────────────────────

  async function handleErrorNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    await observability.emitFailed(
      state.executionContext,
      state.executionContext.conversationId,
      state.error ?? 'Unknown error',
      Date.now() - state.startedAt,
    );
    return { status: 'failed' };
  }

  // ── Dispatch loop router: empty queue → build_batches, else → code_document
  function dispatchLoopRouterPhase3(
    state: DiscoveryReviewState,
  ): 'code_document' | 'build_batches' | 'handle_error' {
    if (state.status === 'failed' || state.error) return 'handle_error';
    return state.currentDocumentId !== undefined
      ? 'code_document'
      : 'build_batches';
  }

  // ── Build Graph ─────────────────────────────────────────────────────────

  const graph = new StateGraph(DiscoveryReviewStateAnnotation)
    .addNode('start', startNode)
    .addNode('protocol_validation', protocolValidationNode)
    .addNode('ingest', ingestNode)
    .addNode('classify_all', classifyAllNode)
    .addNode('dispatch_loop', dispatchLoopNode)
    .addNode('code_document', codeDocumentNode)
    .addNode('build_batches', buildBatchesNode)
    .addNode('batch_hitl_privilege', batchHitlPrivilegeNode)
    .addNode('batch_hitl_relevance', batchHitlRelevanceNode)
    .addNode('batch_hitl_hot_docs', batchHitlHotDocsNode)
    .addNode('batch_hitl_sample', batchHitlSampleNode)
    .addNode('calibration_check', calibrationCheckNode)
    .addNode('generate_production_set', generateProductionSetNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // __start__ → start
    .addEdge('__start__', 'start')
    // start → protocol_validation
    .addEdge('start', 'protocol_validation')
    // protocol_validation → ingest (or error)
    .addConditionalEdges(
      'protocol_validation',
      (state: DiscoveryReviewState) =>
        state.status === 'failed' ? 'handle_error' : 'ingest',
    )
    // ingest → classify_all (or error)
    .addConditionalEdges('ingest', (state: DiscoveryReviewState) =>
      state.status === 'failed' ? 'handle_error' : 'classify_all',
    )
    // classify_all → dispatch_loop (or error)
    .addConditionalEdges('classify_all', (state: DiscoveryReviewState) =>
      state.status === 'failed' ? 'handle_error' : 'dispatch_loop',
    )
    // dispatch_loop → code_document (queue non-empty) or build_batches (queue empty)
    .addConditionalEdges('dispatch_loop', dispatchLoopRouterPhase3)
    // code_document → dispatch_loop (loop back for next document)
    .addEdge('code_document', 'dispatch_loop')
    // build_batches → batch_hitl_privilege
    .addConditionalEdges('build_batches', (state: DiscoveryReviewState) =>
      state.status === 'failed' || state.error
        ? 'handle_error'
        : 'batch_hitl_privilege',
    )
    // batch_hitl_privilege → batch_hitl_relevance
    .addConditionalEdges(
      'batch_hitl_privilege',
      (state: DiscoveryReviewState) =>
        state.status === 'failed' || state.error
          ? 'handle_error'
          : 'batch_hitl_relevance',
    )
    // batch_hitl_relevance → batch_hitl_hot_docs
    .addConditionalEdges(
      'batch_hitl_relevance',
      (state: DiscoveryReviewState) =>
        state.status === 'failed' || state.error
          ? 'handle_error'
          : 'batch_hitl_hot_docs',
    )
    // batch_hitl_hot_docs → batch_hitl_sample
    .addConditionalEdges(
      'batch_hitl_hot_docs',
      (state: DiscoveryReviewState) =>
        state.status === 'failed' || state.error
          ? 'handle_error'
          : 'batch_hitl_sample',
    )
    // batch_hitl_sample → calibration_check
    .addConditionalEdges('batch_hitl_sample', (state: DiscoveryReviewState) =>
      state.status === 'failed' || state.error
        ? 'handle_error'
        : 'calibration_check',
    )
    // calibration_check → generate_production_set
    .addConditionalEdges('calibration_check', (state: DiscoveryReviewState) =>
      state.status === 'failed' || state.error
        ? 'handle_error'
        : 'generate_production_set',
    )
    // generate_production_set → complete
    .addConditionalEdges(
      'generate_production_set',
      (state: DiscoveryReviewState) =>
        state.status === 'failed' || state.error ? 'handle_error' : 'complete',
    )
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DiscoveryReviewGraph;
}
