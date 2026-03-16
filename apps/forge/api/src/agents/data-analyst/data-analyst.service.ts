import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createDataAnalystGraph, DataAnalystGraph } from './data-analyst.graph';
import {
  DataAnalystInput,
  DataAnalystState,
  DataAnalystResult,
  DataAnalystStatus,
} from './data-analyst.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import {
  ListTablesTool,
  DescribeTableTool,
  SqlQueryTool,
} from '../shared/tools/data/database';

/**
 * DataAnalystService
 *
 * Manages the Data Analyst agent lifecycle:
 * - Creates and initializes the graph
 * - Handles analysis requests
 * - Provides status checking
 */
@Injectable()
export class DataAnalystService implements OnModuleInit {
  private readonly logger = new Logger(DataAnalystService.name);
  private graph!: DataAnalystGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly listTablesTool: ListTablesTool,
    private readonly describeTableTool: DescribeTableTool,
    private readonly sqlQueryTool: SqlQueryTool,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Data Analyst graph...');
    this.graph = await createDataAnalystGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.listTablesTool,
      this.describeTableTool,
      this.sqlQueryTool,
    );
    this.logger.log('Data Analyst graph initialized');
  }

  /**
   * Run a data analysis query
   *
   * @param input - Input containing ExecutionContext and analysis params
   */
  async analyze(input: DataAnalystInput): Promise<DataAnalystResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.taskId;

    this.logger.log(`Starting data analysis: taskId=${taskId}`);

    try {
      // Initial state - pass ExecutionContext directly
      const initialState: Partial<DataAnalystState> = {
        executionContext: context,
        userMessage: input.userMessage,
        status: 'started',
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
      )) as DataAnalystState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Data analysis completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        summary: finalState.summary,
        generatedSql: finalState.generatedSql,
        sqlResults: finalState.sqlResults,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Data analysis failed: taskId=${taskId}, error=${errorMessage}`,
      );

      // Emit failure event — pass the full ExecutionContext (already in scope)
      await this.observability.emitFailed(
        context,
        taskId, // threadId
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Get status of an analysis by task ID
   */
  async getStatus(taskId: string): Promise<DataAnalystStatus | null> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const state = await this.graph.getState(config);

      if (!state.values) {
        return null;
      }

      const values = state.values as DataAnalystState;

      return {
        taskId,
        status: values.status,
        userMessage: values.userMessage,
        summary: values.summary,
        error: values.error,
      };
    } catch (error) {
      this.logger.error(`Failed to get status for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get full state history for a task
   */
  async getHistory(taskId: string): Promise<DataAnalystState[]> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const history: DataAnalystState[] = [];
      for await (const state of this.graph.getStateHistory(config)) {
        history.push(state.values as DataAnalystState);
      }

      return history;
    } catch (error) {
      this.logger.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }
}
