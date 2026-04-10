/**
 * Adversarial Brief Stress-Testing — LangGraph workflow.
 *
 * Cyclic adversarial debate graph where Blue Team defends a brief and
 * Red Team attacks it, with convergence detection to exit the loop.
 *
 * Flow:
 *   start → brief_analysis → blue_team_orchestrator → red_team_orchestrator →
 *   judge_scoring → convergence_check → [conditional: blue_team_orchestrator
 *   or synthesis] → hitl_checkpoint → [conditional: fortification or
 *   report_generation or blue_team_orchestrator] → complete
 *
 * See: docs/efforts/current/adversarial-brief-stress-testing/prd.md §4.1
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  AdversarialBriefStateAnnotation,
  AdversarialBriefState,
} from './adversarial-brief.state';
import { createBriefAnalysisNode } from './nodes/brief-analysis.node';
import { createBlueTeamOrchestratorNode } from './nodes/blue-team-orchestrator.node';
import { createRedTeamOrchestratorNode } from './nodes/red-team-orchestrator.node';
import { createConvergenceCheckNode } from './nodes/convergence-check.node';
import { createJudgeScoringNode } from './nodes/judge-scoring.node';
import { createSynthesisNode } from './nodes/synthesis.node';
import { createAdversarialHitlNode } from './nodes/hitl-checkpoint.node';
import { createFortificationNode } from './nodes/fortification.node';
import { createReportGenerationNode } from './nodes/report-generation.node';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdversarialBriefGraph = CompiledStateGraph<any, any, any>;

export async function createAdversarialBriefGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  workflowRag?: WorkflowRagService,
): Promise<AdversarialBriefGraph> {
  const briefAnalysisNode = createBriefAnalysisNode(llmClient, observability);
  const blueTeamNode = createBlueTeamOrchestratorNode(llmClient, observability);
  const redTeamNode = createRedTeamOrchestratorNode(
    llmClient,
    observability,
    workflowRag,
  );
  const convergenceCheckNode = createConvergenceCheckNode(observability);
  const judgeScoringNode = createJudgeScoringNode(llmClient, observability);
  const synthesisNode = createSynthesisNode(llmClient, observability);
  const hitlCheckpointNode = createAdversarialHitlNode(observability);
  const fortificationNode = createFortificationNode(llmClient, observability);
  const reportGenerationNode = createReportGenerationNode(observability);

  async function startNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Adversarial Brief Stress-Test: ${state.userMessage}`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  async function completeNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          report: state.report,
          rounds: state.rounds.length,
          convergenceReason: state.convergenceReason,
          stressTestReport: state.stressTestReport,
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
            state.report || 'Adversarial brief stress-test complete',
          ),
        ],
      };
    }

    return { completedAt: Date.now() };
  }

  async function handleErrorNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed', completedAt: Date.now() };
  }

  const graph = new StateGraph(AdversarialBriefStateAnnotation)
    .addNode('start', startNode)
    .addNode('brief_analysis', briefAnalysisNode)
    .addNode('blue_team_orchestrator', blueTeamNode)
    .addNode('red_team_orchestrator', redTeamNode)
    .addNode('judge_scoring', judgeScoringNode)
    .addNode('convergence_check', convergenceCheckNode)
    .addNode('synthesis', synthesisNode)
    .addNode('hitl_checkpoint', hitlCheckpointNode)
    .addNode('fortification', fortificationNode)
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'brief_analysis',
    )
    .addConditionalEdges('brief_analysis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'blue_team_orchestrator',
    )
    .addConditionalEdges('blue_team_orchestrator', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'red_team_orchestrator',
    )
    .addConditionalEdges('red_team_orchestrator', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'judge_scoring',
    )
    .addConditionalEdges('judge_scoring', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'convergence_check',
    )
    // Convergence: loop back to blue_team or exit to synthesis
    .addConditionalEdges('convergence_check', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      if (state.converged) return 'synthesis';
      return 'blue_team_orchestrator';
    })
    .addConditionalEdges('synthesis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    // HITL routing: approve-and-fortify → fortification, approve-without → report, reject → debate
    .addConditionalEdges('hitl_checkpoint', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      const decision = state.hitlDecision;
      if (decision?.type === 'approve-and-fortify') return 'fortification';
      if (decision?.type === 'reject-and-rerun') {
        // Reset for re-run — route back to debate loop
        return 'blue_team_orchestrator';
      }
      // approve-without-fortification → straight to report
      return 'report_generation';
    })
    .addConditionalEdges('fortification', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'report_generation',
    )
    .addConditionalEdges('report_generation', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as AdversarialBriefGraph;

  return compiled;
}
