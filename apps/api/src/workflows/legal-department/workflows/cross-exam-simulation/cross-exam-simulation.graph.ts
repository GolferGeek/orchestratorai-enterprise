/**
 * Cross-Exam Simulation Graph
 *
 * Flow:
 *   simulation_setup → question_generator (interrupt) → answer_scorer →
 *   next_move_decider → [debrief if done | question_generator if continuing]
 *
 * The question_generator node calls interrupt() after generating each question,
 * pausing the graph until the witness's answer is submitted via the /answer endpoint.
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  CrossExamSimulationStateAnnotation,
  type CrossExamSimulationState,
} from './cross-exam-simulation.state';
import { createSimulationSetupNode } from './nodes/simulation-setup.node';
import { createQuestionGeneratorNode } from './nodes/question-generator.node';
import { createAnswerScorerNode } from './nodes/answer-scorer.node';
import { createNextMoveDeciderNode } from './nodes/next-move-decider.node';
import { createDebriefGeneratorNode } from './nodes/debrief-generator.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CrossExamSimulationGraph = CompiledStateGraph<any, any, any>;

export async function createCrossExamSimulationGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<CrossExamSimulationGraph> {
  const simulationSetupNode = createSimulationSetupNode(
    llmClient,
    observability,
  );
  const questionGeneratorNode = createQuestionGeneratorNode(
    llmClient,
    observability,
  );
  const answerScorerNode = createAnswerScorerNode(llmClient, observability);
  const nextMoveDeciderNode = createNextMoveDeciderNode();
  const debriefGeneratorNode = createDebriefGeneratorNode(
    llmClient,
    observability,
  );

  async function handleErrorNode(
    state: CrossExamSimulationState,
  ): Promise<Partial<CrossExamSimulationState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed', completedAt: Date.now() };
  }

  const graph = new StateGraph(CrossExamSimulationStateAnnotation)
    .addNode('simulation_setup', simulationSetupNode)
    .addNode('question_generator', questionGeneratorNode)
    .addNode('answer_scorer', answerScorerNode)
    .addNode('next_move_decider', nextMoveDeciderNode)
    .addNode('debrief_generator', debriefGeneratorNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'simulation_setup')
    .addConditionalEdges('simulation_setup', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'question_generator',
    )
    // After question_generator interrupts and resumes: go to answer_scorer
    .addConditionalEdges('question_generator', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'answer_scorer',
    )
    .addConditionalEdges('answer_scorer', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'next_move_decider',
    )
    // next_move_decider branches to debrief or loops back to question_generator
    .addConditionalEdges('next_move_decider', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      return state.sessionPhase === 'debrief'
        ? 'debrief_generator'
        : 'question_generator';
    })
    .addConditionalEdges('debrief_generator', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : END,
    )
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as CrossExamSimulationGraph;

  return compiled;
}
