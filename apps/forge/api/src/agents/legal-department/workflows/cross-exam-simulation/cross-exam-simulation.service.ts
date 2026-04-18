import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GraphInterrupt, isInterrupted, Command } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  createCrossExamSimulationGraph,
  type CrossExamSimulationGraph,
} from './cross-exam-simulation.graph';
import type { CrossExamSimulationState } from './cross-exam-simulation.state';
import type {
  CrossExamSimulationInput,
  SimulationDebrief,
  SimulationQuestion,
} from './cross-exam-simulation.types';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';

export interface CrossExamSimulationProcessInput {
  context: ExecutionContext;
  input: CrossExamSimulationInput;
}

export interface CrossExamSimulationResult {
  taskId: string;
  status: 'completed' | 'failed' | 'awaiting_answer';
  error?: string;
  duration: number;
  currentQuestion?: SimulationQuestion;
  debrief?: SimulationDebrief;
}

@Injectable()
export class CrossExamSimulationService implements OnModuleInit {
  private readonly logger = new Logger(CrossExamSimulationService.name);
  private graph!: CrossExamSimulationGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Cross-Exam Simulation graph...');
    this.graph = await createCrossExamSimulationGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Cross-Exam Simulation graph initialized');
  }

  getGraph(): CrossExamSimulationGraph {
    return this.graph;
  }

  async processSimulation(
    params: CrossExamSimulationProcessInput,
  ): Promise<CrossExamSimulationResult> {
    const startTime = Date.now();
    const { context, input } = params;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting cross-exam simulation: taskId=${taskId}, maxQuestions=${input.maxQuestions}`,
    );

    try {
      const initialState: Partial<CrossExamSimulationState> = {
        executionContext: context,
        input,
        status: 'processing',
        startedAt: startTime,
      };

      const config = { configurable: { thread_id: taskId } };

      const finalState = (await this.graph.invoke(
        initialState,
        config,
      )) as CrossExamSimulationState;

      const duration = Date.now() - startTime;

      if (isInterrupted(finalState)) {
        const interruptPayload = (
          finalState as unknown as { __interrupt__: Array<{ value: unknown }> }
        ).__interrupt__[0]?.value as SimulationQuestion | undefined;

        this.logger.log(
          `Cross-exam simulation paused at question turn=${interruptPayload?.turn}: taskId=${taskId}`,
        );

        return {
          taskId,
          status: 'awaiting_answer',
          duration,
          currentQuestion: interruptPayload,
        };
      }

      this.logger.log(
        `Cross-exam simulation completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        error: finalState.error,
        duration,
        debrief: finalState.debrief,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Cross-exam simulation failed: taskId=${taskId}, error=${errorMessage}`,
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

  async resumeWithSimulationAnswer(
    context: ExecutionContext,
    threadId: string,
    answer: string,
    turn: number,
  ): Promise<CrossExamSimulationResult> {
    const startTime = Date.now();

    this.logger.log(
      `Resuming cross-exam simulation: taskId=${threadId}, turn=${turn}`,
    );

    const config = { configurable: { thread_id: threadId } };

    // Store the answer into state via resume payload so the scorer can access it
    const answerEntry = {
      turn,
      answer,
      submittedAt: new Date().toISOString(),
    };

    const finalState = (await this.graph.invoke(
      new Command({ resume: answerEntry }),
      config,
    )) as CrossExamSimulationState;

    const duration = Date.now() - startTime;

    if (isInterrupted(finalState)) {
      const interruptPayload = (
        finalState as unknown as { __interrupt__: Array<{ value: unknown }> }
      ).__interrupt__[0]?.value as SimulationQuestion | undefined;

      this.logger.log(
        `Cross-exam simulation paused at next question turn=${interruptPayload?.turn}: taskId=${threadId}`,
      );

      return {
        taskId: threadId,
        status: 'awaiting_answer',
        duration,
        currentQuestion: interruptPayload,
      };
    }

    this.logger.log(
      `Cross-exam simulation completed after answer: taskId=${threadId}, status=${finalState.status}, duration=${duration}ms`,
    );

    return {
      taskId: threadId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      error: finalState.error,
      duration,
      debrief: finalState.debrief,
    };
  }
}
