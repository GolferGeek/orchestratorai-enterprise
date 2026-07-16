import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  TrialSimulatorStateAnnotation,
  type TrialSimulatorState,
} from './trial-simulator.state';
import { createGenerateParameterSpaceNode } from './nodes/generate-parameter-space.node';
import { createRunSimulationsNode } from './nodes/run-simulations.node';
import {
  createAggregateResultsNode,
  TRIAL_SIMULATOR_DISCLAIMER,
} from './nodes/aggregate-results.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { TrialSimulationGraph } from './trial-simulation.graph';

export const MAX_SIMULATION_COUNT = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TrialSimulatorGraph = CompiledStateGraph<any, any, any>;

export async function createTrialSimulatorGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  innerGraph: TrialSimulationGraph,
): Promise<TrialSimulatorGraph> {
  const generateParameterSpaceNode =
    createGenerateParameterSpaceNode(observability);
  const runSimulationsNode = createRunSimulationsNode(
    observability,
    innerGraph,
  );
  const aggregateResultsNode = createAggregateResultsNode(observability);

  void llmClient;

  async function startNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;

    // Server-side clamp
    const simulationCount = Math.min(
      Math.max(1, state.caseRecord.simulationCount),
      MAX_SIMULATION_COUNT,
    );

    // Required field validation
    const { caseRecord } = state;
    if (
      !caseRecord.matterId ||
      !caseRecord.jurisdiction ||
      !caseRecord.caseType
    ) {
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        'Missing required fields: matterId, jurisdiction, caseType',
        0,
      );
      return {
        error: 'Missing required fields: matterId, jurisdiction, caseType',
        status: 'failed',
      };
    }
    if (caseRecord.claims.length === 0) {
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        'At least one claim is required',
        0,
      );
      return { error: 'At least one claim is required', status: 'failed' };
    }
    if (caseRecord.evidence.length === 0) {
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        'At least one evidence item is required',
        0,
      );
      return {
        error: 'At least one evidence item is required',
        status: 'failed',
      };
    }
    if (caseRecord.damagesModel.length === 0) {
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        'At least one damages model entry is required',
        0,
      );
      return {
        error: 'At least one damages model entry is required',
        status: 'failed',
      };
    }

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Monte Carlo Trial Simulator: ${caseRecord.matterId} — ${simulationCount} simulations`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      caseRecord: { ...caseRecord, simulationCount },
      messages: [
        new HumanMessage(`Monte Carlo simulation: ${caseRecord.matterId}`),
      ],
    };
  }

  async function completeNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    const aggregation = state.aggregation;
    if (!aggregation) {
      return { status: 'failed', error: 'Aggregation not computed' };
    }

    const finalResult = {
      ...aggregation,
      disclaimerText: TRIAL_SIMULATOR_DISCLAIMER,
      durationMs: duration,
    };

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      finalResult,
      duration,
    );

    return { status: 'completed', aggregation: finalResult };
  }

  async function handleErrorNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;
    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error ?? 'Unknown error',
      duration,
    );
    return { status: 'failed' };
  }

  function routeFromStart(state: TrialSimulatorState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'generate_parameter_space';
  }

  function routeFromParameterSpace(state: TrialSimulatorState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'run_simulations';
  }

  function routeFromAggregation(state: TrialSimulatorState) {
    return state.error || state.status === 'failed'
      ? 'handle_error'
      : 'complete';
  }

  const graph = new StateGraph(TrialSimulatorStateAnnotation)
    .addNode('start', startNode)
    .addNode('generate_parameter_space', generateParameterSpaceNode)
    .addNode('run_simulations', runSimulationsNode)
    .addNode('aggregate_results', aggregateResultsNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', routeFromStart, [
      'generate_parameter_space',
      'handle_error',
    ])
    .addConditionalEdges('generate_parameter_space', routeFromParameterSpace, [
      'run_simulations',
      'handle_error',
    ])
    .addEdge('run_simulations', 'aggregate_results')
    .addConditionalEdges('aggregate_results', routeFromAggregation, [
      'complete',
      'handle_error',
    ])
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  });

  return compiled as unknown as TrialSimulatorGraph;
}
