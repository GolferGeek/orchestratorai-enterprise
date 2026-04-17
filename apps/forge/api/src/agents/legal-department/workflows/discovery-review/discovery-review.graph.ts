/**
 * Discovery Document Review — LangGraph Workflow.
 *
 * Phase 1 graph shape:
 *   __start__ → start → protocol_validation → ingest → classify_all → __end__
 *
 * Phases 2–4 will extend this graph by adding the dispatcher loop,
 * batch HITL nodes, and production-set generation.
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
            (e) => e.status === 'classified',
          ).length,
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
    // classify_all → complete (or error)
    .addConditionalEdges('classify_all', (state: DiscoveryReviewState) =>
      state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DiscoveryReviewGraph;
}
