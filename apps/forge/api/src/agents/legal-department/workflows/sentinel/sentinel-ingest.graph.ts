/**
 * Sentinel Ingest — LangGraph Workflow.
 *
 * Flow:
 *   start → fetch_source → deduplicate → classify → store → update_source → complete
 *   (on error) → handle_error → update_source → complete(failed)
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  SentinelIngestStateAnnotation,
  type SentinelIngestState,
} from './sentinel-ingest.state';
import { createFetchSourceNode } from './nodes/fetch-source.node';
import { createDeduplicateNode } from './nodes/deduplicate.node';
import { createClassifySignalsNode } from './nodes/classify-signals.node';
import { createStoreSignalsNode } from './nodes/store-signals.node';
import { createUpdateSourceNode } from './nodes/update-source.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';
import type { SentinelRepository } from '../../sentinel/sentinel.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SentinelIngestGraph = CompiledStateGraph<any, any, any>;

export async function createSentinelIngestGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  repository: SentinelRepository,
  workflowRag?: WorkflowRagService,
): Promise<SentinelIngestGraph> {
  const fetchSourceNode = createFetchSourceNode(observability);
  const deduplicateNode = createDeduplicateNode(observability, repository);
  const classifySignalsNode = createClassifySignalsNode(
    llmClient,
    observability,
  );
  const storeSignalsNode = createStoreSignalsNode(
    observability,
    repository,
    workflowRag,
  );
  const updateSourceNode = createUpdateSourceNode(observability, repository);

  // ── Helper nodes ──────────────────────────────────────────────────

  async function startNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Sentinel Ingest: source=${state.sourceConfig?.name ?? 'unknown'}`,
    );

    return {
      status: 'fetching',
      startedAt: Date.now(),
    };
  }

  async function completeNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          source: state.sourceConfig?.name,
          itemsFetched: state.rawItems.length,
          newSignals: state.newSignals.length,
          classified: state.classifiedSignals.length,
        },
        duration,
      );
    }

    return {
      status: state.status === 'failed' ? 'failed' : 'completed',
      completedAt: Date.now(),
    };
  }

  async function handleErrorNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error ?? 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed' };
  }

  // ── Build Graph ───────────────────────────────────────────────────

  const graph = new StateGraph(SentinelIngestStateAnnotation)
    .addNode('start', startNode)
    .addNode('fetch_source', fetchSourceNode)
    .addNode('deduplicate', deduplicateNode)
    .addNode('classify', classifySignalsNode)
    .addNode('store', storeSignalsNode)
    .addNode('update_source', updateSourceNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addEdge('start', 'fetch_source')
    .addConditionalEdges('fetch_source', (state: SentinelIngestState) =>
      state.status === 'failed' ? 'handle_error' : 'deduplicate',
    )
    .addEdge('deduplicate', 'classify')
    .addEdge('classify', 'store')
    .addEdge('store', 'update_source')
    .addEdge('update_source', 'complete')
    .addEdge('handle_error', 'update_source')
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as SentinelIngestGraph;
}
