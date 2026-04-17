/**
 * Discovery Document Review — LangGraph Workflow.
 *
 * Phase 2 graph shape:
 *   __start__ → start → protocol_validation → ingest → classify_all
 *     → dispatch_loop → [code_document → dispatch_loop]* → complete
 *
 * dispatch_loop routes to code_document while items remain in the queue,
 * then to complete when the queue is empty. code_document loops back to
 * dispatch_loop after each document.
 *
 * Phases 3–4 will extend this graph with batch HITL nodes and
 * production-set generation.
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
import {
  createDispatchLoopNode,
  dispatchLoopRouter,
} from './nodes/dispatch-loop.node';
import { createCodeDocumentNode } from './nodes/code-document.node';
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

  // ── Inline helper nodes ─────────────────────────────────────────────────

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

  async function completeNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          totalDocuments: state.documents.length,
          classified: state.documentIndex.filter(
            (e) => e.status === 'classified' || e.status === 'coded',
          ).length,
          coded: state.documentsCoded.length,
          failed: Object.keys(state.documentsFailed).length,
        },
        duration,
      );
    }

    return {
      status: state.status === 'failed' ? 'failed' : 'completed',
      completedAt: Date.now(),
    };
  }

  // ── Build Graph ─────────────────────────────────────────────────────────

  const graph = new StateGraph(DiscoveryReviewStateAnnotation)
    .addNode('start', startNode)
    .addNode('protocol_validation', protocolValidationNode)
    .addNode('ingest', ingestNode)
    .addNode('classify_all', classifyAllNode)
    .addNode('dispatch_loop', dispatchLoopNode)
    .addNode('code_document', codeDocumentNode)
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
    // dispatch_loop → code_document (queue non-empty) or complete (queue empty)
    .addConditionalEdges('dispatch_loop', dispatchLoopRouter)
    // code_document → dispatch_loop (loop back for next document)
    .addEdge('code_document', 'dispatch_loop')
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DiscoveryReviewGraph;
}
