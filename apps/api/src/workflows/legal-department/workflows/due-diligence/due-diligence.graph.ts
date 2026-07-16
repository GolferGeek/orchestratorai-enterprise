/**
 * Due Diligence Room — LangGraph Workflow.
 *
 * Complete flow:
 *   start → intake → classify_all → dispatch_loop → analyze_document
 *   → [conditional: dispatch_loop if queue not empty, else hitl_gate_1]
 *   → hitl_gate_1 → synthesis → hitl_gate_2 → report_generation → complete
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  DueDiligenceStateAnnotation,
  type DueDiligenceState,
} from './due-diligence.state';
import { createIntakeNode } from './nodes/intake.node';
import { createClassifyAllNode } from './nodes/classify-all.node';
import { createDispatchLoopNode } from './nodes/dispatch-loop.node';
import { createAnalyzeDocumentNode } from './nodes/analyze-document.node';
import { createHitlGate1Node } from './nodes/hitl-gate-1.node';
import { createSynthesisNode } from './nodes/synthesis.node';
import { createHitlGate2Node } from './nodes/hitl-gate-2.node';
import { createReportGenerationNode } from './nodes/report-generation.node';
import { createIncrementalStartNode } from './nodes/incremental-start.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DueDiligenceGraph = CompiledStateGraph<any, any, any>;

export async function createDueDiligenceGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  _workflowRag?: WorkflowRagService,
): Promise<DueDiligenceGraph> {
  const intakeNode = createIntakeNode(observability);
  const classifyAllNode = createClassifyAllNode(llmClient, observability);
  const dispatchLoopNode = createDispatchLoopNode(observability);
  const analyzeDocumentNode = createAnalyzeDocumentNode(
    llmClient,
    observability,
  );
  const hitlGate1Node = createHitlGate1Node(observability);
  const synthesisNode = createSynthesisNode(llmClient, observability);
  const hitlGate2Node = createHitlGate2Node(observability);
  const reportGenerationNode = createReportGenerationNode(
    llmClient,
    observability,
  );
  const incrementalStartNode = createIncrementalStartNode(observability);

  // ── Helper nodes ──────────────────────────────────────────────────

  async function startNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Due Diligence Room: ${state.documents.length} documents for ${state.dealContext.transactionType} (${state.dealContext.targetCompany})`,
    );

    return {
      status: 'intake',
      startedAt: Date.now(),
      messages: [
        new HumanMessage(
          `Due Diligence Room: ${state.dealContext.transactionType} — ${state.dealContext.targetCompany} / ${state.dealContext.buyerCompany} — ${state.documents.length} documents`,
        ),
      ],
    };
  }

  async function completeNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          totalDocuments: state.documents.length,
          analyzed: state.documentsAnalyzed.length,
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

  async function handleErrorNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
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

  const graph = new StateGraph(DueDiligenceStateAnnotation)
    .addNode('start', startNode)
    .addNode('intake', intakeNode)
    .addNode('incremental_start', incrementalStartNode)
    .addNode('classify_all', classifyAllNode)
    .addNode('dispatch_loop', dispatchLoopNode)
    .addNode('analyze_document', analyzeDocumentNode)
    .addNode('hitl_gate_1', hitlGate1Node)
    .addNode('synthesis', synthesisNode)
    .addNode('hitl_gate_2', hitlGate2Node)
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // Conditional start: incremental mode skips start/intake
    .addConditionalEdges('__start__', (state: DueDiligenceState) =>
      state.incrementalMode ? 'incremental_start' : 'start',
    )
    .addEdge('incremental_start', 'classify_all')
    .addEdge('start', 'intake')
    .addConditionalEdges('intake', (state: DueDiligenceState) =>
      state.status === 'failed' ? 'handle_error' : 'classify_all',
    )
    .addEdge('classify_all', 'dispatch_loop')
    .addEdge('dispatch_loop', 'analyze_document')
    // After analyzing: if queue has items → loop; else → HITL Gate 1
    .addConditionalEdges('analyze_document', (state: DueDiligenceState) =>
      state.documentQueue.length > 0 ? 'dispatch_loop' : 'hitl_gate_1',
    )
    // HITL Gate 1 → synthesis (approve is the default path)
    .addConditionalEdges('hitl_gate_1', (state: DueDiligenceState) =>
      state.status === 'failed' ? 'handle_error' : 'synthesis',
    )
    // Synthesis → HITL Gate 2 (or error)
    .addConditionalEdges('synthesis', (state: DueDiligenceState) =>
      state.status === 'failed' ? 'handle_error' : 'hitl_gate_2',
    )
    // HITL Gate 2 → report_generation
    .addConditionalEdges('hitl_gate_2', (state: DueDiligenceState) =>
      state.status === 'failed' ? 'handle_error' : 'report_generation',
    )
    // Report generation → complete
    .addConditionalEdges('report_generation', (state: DueDiligenceState) =>
      state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DueDiligenceGraph;
}
