/**
 * Sentinel Evaluate — LangGraph Workflow.
 *
 * Flow:
 *   start → load_unprocessed → evaluate_loop → evaluate_signal
 *   → [conditional: evaluate_loop if queue not empty, else complete]
 *   (on error) → handle_error → complete(failed)
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  SentinelEvaluateStateAnnotation,
  type SentinelEvaluateState,
} from './sentinel-evaluate.state';
import { createLoadUnprocessedNode } from './nodes/load-unprocessed.node';
import { createEvaluateLoopNode } from './nodes/evaluate-loop.node';
import { createEvaluateSignalNode } from './nodes/evaluate-signal.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';
import type { SentinelRepository } from '../../sentinel/sentinel.repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SentinelEvaluateGraph = CompiledStateGraph<any, any, any>;

export async function createSentinelEvaluateGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  repository: SentinelRepository,
  workflowRag?: WorkflowRagService,
): Promise<SentinelEvaluateGraph> {
  const loadUnprocessedNode = createLoadUnprocessedNode(
    observability,
    repository,
  );
  const evaluateLoopNode = createEvaluateLoopNode(observability);
  const evaluateSignalNode = createEvaluateSignalNode(
    llmClient,
    observability,
    repository,
    workflowRag,
  );

  // ── Helper nodes ──────────────────────────────────────────────────

  async function startNode(
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      'Starting Sentinel Evaluate: cross-referencing signals against portfolio',
    );

    return {
      status: 'loading',
      startedAt: Date.now(),
    };
  }

  async function completeNode(
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          alertsGenerated: state.alerts.length,
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
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
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

  const graph = new StateGraph(SentinelEvaluateStateAnnotation)
    .addNode('start', startNode)
    .addNode('load_unprocessed', loadUnprocessedNode)
    .addNode('evaluate_loop', evaluateLoopNode)
    .addNode('evaluate_signal', evaluateSignalNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addEdge('start', 'load_unprocessed')
    // After loading: if signals exist → evaluate_loop; else → complete
    .addConditionalEdges('load_unprocessed', (state: SentinelEvaluateState) =>
      state.unprocessedSignals.length > 0 ? 'evaluate_loop' : 'complete',
    )
    .addEdge('evaluate_loop', 'evaluate_signal')
    // After evaluating: if queue has items → loop; else → complete
    .addConditionalEdges('evaluate_signal', (state: SentinelEvaluateState) =>
      state.unprocessedSignals.length > 0 ? 'evaluate_loop' : 'complete',
    )
    .addEdge('handle_error', 'complete')
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as SentinelEvaluateGraph;
}
