import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GraphInterrupt, isInterrupted } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  createDepositionPrepGraph,
  type DepositionPrepGraph,
} from './deposition-prep.graph';
import type { DepositionPrepState } from './deposition-prep.state';
import type { DepositionPrepInput } from './deposition-prep.types';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

export interface DepositionPrepProcessInput {
  context: ExecutionContext;
  input: DepositionPrepInput;
}

export interface DepositionPrepResult {
  taskId: string;
  status: 'completed' | 'failed';
  error?: string;
  duration: number;
  preparationOutline?: DepositionPrepState['preparationOutline'];
  predictedQuestions?: DepositionPrepState['predictedQuestions'];
  answerCoaching?: DepositionPrepState['answerCoaching'];
}

@Injectable()
export class DepositionPrepService implements OnModuleInit {
  private readonly logger = new Logger(DepositionPrepService.name);
  private graph!: DepositionPrepGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Deposition Prep graph...');
    this.graph = await createDepositionPrepGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Deposition Prep graph initialized');
  }

  getGraph(): DepositionPrepGraph {
    return this.graph;
  }

  async process(
    params: DepositionPrepProcessInput,
  ): Promise<DepositionPrepResult> {
    const startTime = Date.now();
    const { context, input } = params;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting deposition-prep workflow: taskId=${taskId}, mode=${input.mode}, witnessType=${input.witnessType}`,
    );

    try {
      const initialState: Partial<DepositionPrepState> = {
        executionContext: context,
        mode: input.mode,
        input,
        status: 'processing',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.graph.invoke(
        initialState,
        config,
      )) as DepositionPrepState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Deposition-prep workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Deposition-prep workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        error: finalState.error,
        duration,
        preparationOutline: finalState.preparationOutline,
        predictedQuestions: finalState.predictedQuestions,
        answerCoaching: finalState.answerCoaching,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Deposition-prep workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        error: errorMessage,
        duration,
      };
    }
  }
}
