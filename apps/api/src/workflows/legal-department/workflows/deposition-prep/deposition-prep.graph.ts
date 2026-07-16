/**
 * Deposition Prep & Cross-Exam Simulator — LangGraph workflow.
 *
 * Flow (preparation-outline mode):
 *   start → case_analysis → question_generation → deposition_research →
 *   deposition_synthesis → complete → END
 *
 * Flow (predicted-cross-exam mode):
 *   start → case_analysis → opposing_perspective → cross_exam_generation →
 *   answer_coaching → complete → END
 *
 * All conditional edges guard against state.error || state.status === 'failed'
 * and route to handle_error.
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  DepositionPrepStateAnnotation,
  type DepositionPrepState,
} from './deposition-prep.state';
import { createCaseAnalysisNode } from './nodes/case-analysis.node';
import { createQuestionGenerationNode } from './nodes/question-generation.node';
import { createDepositionResearchNode } from './nodes/deposition-research.node';
import { createDepositionSynthesisNode } from './nodes/deposition-synthesis.node';
import { createOpposingPerspectiveNode } from './nodes/opposing-perspective.node';
import { createCrossExamGenerationNode } from './nodes/cross-exam-generation.node';
import { createAnswerCoachingNode } from './nodes/answer-coaching.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DepositionPrepGraph = CompiledStateGraph<any, any, any>;

export async function createDepositionPrepGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<DepositionPrepGraph> {
  const caseAnalysisNode = createCaseAnalysisNode(llmClient, observability);
  const questionGenerationNode = createQuestionGenerationNode(
    llmClient,
    observability,
  );
  const depositionResearchNode = createDepositionResearchNode(
    llmClient,
    observability,
  );
  const depositionSynthesisNode = createDepositionSynthesisNode(
    llmClient,
    observability,
  );
  const opposingPerspectiveNode = createOpposingPerspectiveNode(
    llmClient,
    observability,
  );
  const crossExamGenerationNode = createCrossExamGenerationNode(
    llmClient,
    observability,
  );
  const answerCoachingNode = createAnswerCoachingNode(llmClient, observability);

  async function startNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Deposition Prep: ${state.input.witnessType} — ${state.input.depositionTopics.length} topics (mode: ${state.mode})`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.input.caseFacts)],
    };
  }

  async function completeNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          mode: state.mode,
          preparationOutline: state.preparationOutline,
          predictedQuestions: state.predictedQuestions,
          answerCoaching: state.answerCoaching,
        },
        Date.now() - state.startedAt,
      );

      return {
        status: 'completed',
        completedAt: Date.now(),
        messages: [
          ...state.messages,
          new AIMessage('Deposition preparation complete'),
        ],
      };
    }

    return { completedAt: Date.now() };
  }

  async function handleErrorNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed', completedAt: Date.now() };
  }

  const graph = new StateGraph(DepositionPrepStateAnnotation)
    .addNode('start', startNode)
    .addNode('case_analysis', caseAnalysisNode)
    // preparation-outline branch
    .addNode('question_generation', questionGenerationNode)
    .addNode('deposition_research', depositionResearchNode)
    .addNode('deposition_synthesis', depositionSynthesisNode)
    // predicted-cross-exam branch
    .addNode('opposing_perspective', opposingPerspectiveNode)
    .addNode('cross_exam_generation', crossExamGenerationNode)
    .addNode('answer_coaching', answerCoachingNode)
    // shared terminal nodes
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'case_analysis',
    )
    // After case_analysis: branch on mode
    .addConditionalEdges('case_analysis', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      return state.mode === 'predicted-cross-exam'
        ? 'opposing_perspective'
        : 'question_generation';
    })
    // preparation-outline branch
    .addConditionalEdges('question_generation', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'deposition_research',
    )
    .addConditionalEdges('deposition_research', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'deposition_synthesis',
    )
    .addConditionalEdges('deposition_synthesis', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    // predicted-cross-exam branch
    .addConditionalEdges('opposing_perspective', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'cross_exam_generation',
    )
    .addConditionalEdges('cross_exam_generation', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'answer_coaching',
    )
    .addConditionalEdges('answer_coaching', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DepositionPrepGraph;

  return compiled;
}
