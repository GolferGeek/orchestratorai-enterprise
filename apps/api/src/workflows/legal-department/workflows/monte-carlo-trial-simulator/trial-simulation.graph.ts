import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  TrialSimulationStateAnnotation,
  type TrialSimulationState,
} from './trial-simulation.state';
import { createOpeningArgumentsNode } from './nodes/opening-arguments.node';
import { createEvidencePresentationNode } from './nodes/evidence-presentation.node';
import { createClosingArgumentsNode } from './nodes/closing-arguments.node';
import { createJuryDeliberationNode } from './nodes/jury-deliberation.node';
import { createRecordVerdictNode } from './nodes/record-verdict.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TrialSimulationGraph = CompiledStateGraph<any, any, any>;

export async function createTrialSimulationGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<TrialSimulationGraph> {
  const openingArgumentsNode = createOpeningArgumentsNode(
    llmClient,
    observability,
  );
  const evidencePresentationNode = createEvidencePresentationNode(
    llmClient,
    observability,
  );
  const closingArgumentsNode = createClosingArgumentsNode(
    llmClient,
    observability,
  );
  const juryDeliberationNode = createJuryDeliberationNode(
    llmClient,
    observability,
  );
  const recordVerdictNode = createRecordVerdictNode(observability);

  function startNode(
    state: TrialSimulationState,
  ): Partial<TrialSimulationState> {
    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [
        new HumanMessage(
          `Simulation ${state.parameters.simulationIndex}: ${state.caseRecord.matterId}`,
        ),
      ],
    };
  }

  function completeNode(
    state: TrialSimulationState,
  ): Partial<TrialSimulationState> {
    if (state.status === 'failed') return {};
    return { status: 'completed' };
  }

  function handleErrorNode(
    _state: TrialSimulationState,
  ): Partial<TrialSimulationState> {
    return { status: 'failed' };
  }

  function routeFromStart(state: TrialSimulationState) {
    return state.error ? 'handle_error' : 'opening_arguments';
  }

  function routeFromOpening(state: TrialSimulationState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'evidence_presentation';
  }

  function routeFromEvidence(state: TrialSimulationState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'closing_arguments';
  }

  function routeFromClosing(state: TrialSimulationState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'jury_deliberation';
  }

  function routeFromDeliberation(state: TrialSimulationState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'record_verdict';
  }

  const graph = new StateGraph(TrialSimulationStateAnnotation)
    .addNode('start', startNode)
    .addNode('opening_arguments', openingArgumentsNode)
    .addNode('evidence_presentation', evidencePresentationNode)
    .addNode('closing_arguments', closingArgumentsNode)
    .addNode('jury_deliberation', juryDeliberationNode)
    .addNode('record_verdict', recordVerdictNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', routeFromStart, [
      'opening_arguments',
      'handle_error',
    ])
    .addConditionalEdges('opening_arguments', routeFromOpening, [
      'evidence_presentation',
      'handle_error',
    ])
    .addConditionalEdges('evidence_presentation', routeFromEvidence, [
      'closing_arguments',
      'handle_error',
    ])
    .addConditionalEdges('closing_arguments', routeFromClosing, [
      'jury_deliberation',
      'handle_error',
    ])
    .addConditionalEdges('jury_deliberation', routeFromDeliberation, [
      'record_verdict',
      'handle_error',
    ])
    .addEdge('record_verdict', 'complete')
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  });

  return compiled as unknown as TrialSimulationGraph;
}
