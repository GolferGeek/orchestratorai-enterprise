/**
 * Contract Review & Redlining — LangGraph workflow.
 *
 * Separate graph from the document-onboarding workflow. Shares the same
 * state annotation and LangGraph checkpointer, but has its own nodes:
 *
 * Flow:
 *   start → clo_routing → orchestrator → synthesis → hitl → report → complete
 *
 * Phase 2: specialists + orchestrator produce ClauseAnnotation[] per clause.
 * Phase 3: synthesis merges into ClauseSynthesis[], HITL shows per-clause
 *          review, report generates risk assessment + redline.
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  LegalDepartmentStateAnnotation,
  LegalDepartmentState,
} from '../../legal-department.state';
import { createCloRoutingNode } from '../../nodes/clo-routing.node';
import { createContractReviewSynthesisNode } from './nodes/synthesis.node';
import { createContractReviewHitlNode } from './nodes/hitl-checkpoint.node';
import { createContractReviewReportNode } from './nodes/report-generation.node';
import { createContractReviewSpecialists } from './nodes/specialists';
import { createContractReviewOrchestratorNode } from './nodes/orchestrator.node';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContractReviewGraph = CompiledStateGraph<any, any, any>;

export async function createContractReviewGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<ContractReviewGraph> {
  // CLO routing is shared — it determines which specialists to invoke
  const cloRoutingNode = createCloRoutingNode(observability);

  // Contract-review-specific specialists (produce ClauseAnnotation[])
  const specialistMap = createContractReviewSpecialists(
    llmClient,
    observability,
  );
  const orchestratorNode = createContractReviewOrchestratorNode(
    specialistMap,
    observability,
  );

  // Contract-review-specific nodes for synthesis, HITL, and report generation
  const synthesisNode = createContractReviewSynthesisNode(
    llmClient,
    observability,
  );
  const hitlCheckpointNode = createContractReviewHitlNode(observability);
  const reportGenerationNode = createContractReviewReportNode(
    llmClient,
    observability,
  );

  async function startNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Contract Review workflow: ${state.userMessage}`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  async function completeNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          response: state.response,
          routingDecision: state.routingDecision,
          specialistOutputs: state.specialistOutputs,
          synthesis: state.orchestration?.synthesis,
          redlineOutput: state.redlineOutput,
        },
        Date.now() - state.startedAt,
      );

      return {
        status: 'completed',
        completedAt: Date.now(),
        messages: [
          ...state.messages,
          new AIMessage(state.response || 'Contract review complete'),
        ],
      };
    }

    return { completedAt: Date.now() };
  }

  async function handleErrorNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed', completedAt: Date.now() };
  }

  const graph = new StateGraph(LegalDepartmentStateAnnotation)
    .addNode('start', startNode)
    .addNode('clo_routing', cloRoutingNode)
    .addNode('orchestrator', orchestratorNode)
    .addNode('synthesis', synthesisNode)
    .addNode('hitl_checkpoint', hitlCheckpointNode)
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    // Contract-review skips echo — go straight to routing
    .addConditionalEdges('start', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      if (state.documents?.length > 0 && state.documentsMetadata?.length > 0) {
        return 'clo_routing';
      }
      return 'handle_error';
    })
    .addConditionalEdges('clo_routing', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'orchestrator',
    )
    .addConditionalEdges('orchestrator', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'synthesis',
    )
    .addConditionalEdges('synthesis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('hitl_checkpoint', (state) => {
      if (state.error || state.status === 'failed') return 'handle_error';
      const decision = state.orchestration?.hitlDecision;
      if (decision?.decision === 'reject') return 'orchestrator';
      return 'report_generation';
    })
    .addConditionalEdges('report_generation', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as ContractReviewGraph;

  return compiled;
}
