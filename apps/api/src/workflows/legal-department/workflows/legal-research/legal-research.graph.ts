/**
 * Legal Research Deep Dive — LangGraph workflow.
 *
 * Separate graph from document-onboarding and contract-review. Shares the
 * same LangGraph checkpointer and services, but has its own state, nodes,
 * and cyclic topology for recursive depth-first research.
 *
 * Flow:
 *   start → question_analysis → research_dispatcher → research_node →
 *   depth_controller → [conditional: research_dispatcher or synthesis] →
 *   hitl_checkpoint → [conditional: report_generation, depth_controller, or
 *   research_dispatcher] → complete
 *
 * See: docs/efforts/current/legal-research-deep-dive/prd.md §4.1
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  LegalResearchStateAnnotation,
  LegalResearchState,
} from './legal-research.state';
import { createQuestionAnalysisNode } from './nodes/question-analysis.node';
import { createResearchDispatcherNode } from './nodes/research-dispatcher.node';
import { createResearchNode } from './nodes/research.node';
import { createDepthControllerNode } from './nodes/depth-controller.node';
import { createSynthesisNode } from './nodes/synthesis.node';
import { createResearchHitlNode } from './nodes/hitl-checkpoint.node';
import { createReportGenerationNode } from './nodes/report-generation.node';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LegalResearchGraph = CompiledStateGraph<any, any, any>;

export async function createLegalResearchGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  workflowRag?: WorkflowRagService,
): Promise<LegalResearchGraph> {
  const questionAnalysisNode = createQuestionAnalysisNode(
    llmClient,
    observability,
  );
  const researchDispatcherNode = createResearchDispatcherNode(observability);
  const researchNode = createResearchNode(
    llmClient,
    observability,
    workflowRag,
  );
  const depthControllerNode = createDepthControllerNode(observability);
  const synthesisNode = createSynthesisNode(llmClient, observability);
  const hitlCheckpointNode = createResearchHitlNode(observability);
  const reportGenerationNode = createReportGenerationNode(
    llmClient,
    observability,
  );

  async function startNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Legal Research workflow: ${state.userMessage}`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  async function completeNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          report: state.report,
          memo: state.memo,
          researchTree: state.researchTree,
          tokenUsage: state.tokenUsage,
        },
        Date.now() - state.startedAt,
      );

      return {
        status: 'completed',
        completedAt: Date.now(),
        messages: [
          ...state.messages,
          new AIMessage(
            state.report || state.memo || 'Legal research complete',
          ),
        ],
      };
    }

    return { completedAt: Date.now() };
  }

  async function handleErrorNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed', completedAt: Date.now() };
  }

  const graph = new StateGraph(LegalResearchStateAnnotation)
    .addNode('start', startNode)
    .addNode('question_analysis', questionAnalysisNode)
    .addNode('research_dispatcher', researchDispatcherNode)
    .addNode('research_node', researchNode)
    .addNode('depth_controller', depthControllerNode)
    .addNode('synthesis', synthesisNode)
    .addNode('hitl_checkpoint', hitlCheckpointNode)
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'question_analysis',
    )
    .addConditionalEdges('question_analysis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'research_dispatcher',
    )
    .addConditionalEdges('research_dispatcher', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'research_node',
    )
    .addConditionalEdges('research_node', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'depth_controller',
    )
    // Depth controller: route to research_dispatcher (more questions) or synthesis (done)
    .addConditionalEdges('depth_controller', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      // If there are pending questions, continue researching
      if (state.pendingQuestions.length > 0) return 'research_dispatcher';
      // Otherwise, synthesize
      return 'synthesis';
    })
    .addConditionalEdges('synthesis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    // HITL: approve → report, deepen → depth_controller, redirect → research_dispatcher
    .addConditionalEdges('hitl_checkpoint', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      if (state.hitlAction?.type === 'deepen') return 'depth_controller';
      if (state.hitlAction?.type === 'redirect') return 'research_dispatcher';
      return 'report_generation';
    })
    .addConditionalEdges('report_generation', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as LegalResearchGraph;

  return compiled;
}
