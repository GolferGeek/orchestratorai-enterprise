import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  createTrialSimulatorGraph,
  type TrialSimulatorGraph,
} from './trial-simulator.graph';
import {
  createTrialSimulationGraph,
  type TrialSimulationGraph,
} from './trial-simulation.graph';
import type { TrialSimulatorState } from './trial-simulator.state';
import type {
  CaseRecord,
  MonteCarloTrialSimulatorResult,
} from './monte-carlo-trial-simulator.types';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

export interface MonteCarloTrialSimulatorProcessInput {
  context: ExecutionContext;
  input: CaseRecord;
}

@Injectable()
export class MonteCarloTrialSimulatorService implements OnModuleInit {
  private readonly logger = new Logger(MonteCarloTrialSimulatorService.name);
  private outerGraph!: TrialSimulatorGraph;
  private innerGraph!: TrialSimulationGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Monte Carlo Trial Simulator graphs...');
    this.innerGraph = await createTrialSimulationGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.outerGraph = await createTrialSimulatorGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.innerGraph,
    );
    this.logger.log('Monte Carlo Trial Simulator graphs initialized');
  }

  async process(
    params: MonteCarloTrialSimulatorProcessInput,
  ): Promise<MonteCarloTrialSimulatorResult> {
    const startTime = Date.now();
    const { context, input } = params;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting monte-carlo-trial-simulator: taskId=${taskId}, matterId=${input.matterId}, simCount=${input.simulationCount}`,
    );

    const initialState: Partial<TrialSimulatorState> = {
      executionContext: context,
      caseRecord: input,
      status: 'processing',
      startedAt: startTime,
    };

    const config = { configurable: { thread_id: taskId } };
    const finalState = (await this.outerGraph.invoke(
      initialState,
      config,
    )) as TrialSimulatorState;

    if (finalState.status === 'failed' || !finalState.aggregation) {
      const errorMsg =
        finalState.error ?? 'Simulation failed without error message';
      this.logger.error(
        `Monte Carlo simulation failed: taskId=${taskId}, error=${errorMsg}`,
      );
      throw new Error(errorMsg);
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `Monte Carlo simulation completed: taskId=${taskId}, duration=${duration}ms, completed=${finalState.aggregation.simulationsCompleted}/${finalState.aggregation.simulationsRequested}`,
    );

    return finalState.aggregation;
  }
}
