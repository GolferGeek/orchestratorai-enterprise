import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createLegalDepartmentGraph,
  LegalDepartmentGraph,
} from './legal-department.graph';
import {
  LegalDepartmentInput,
  LegalDepartmentState,
  LegalDepartmentResult,
  LegalDepartmentStatus,
} from './legal-department.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * LegalDepartmentService
 *
 * Manages the Legal Department AI agent lifecycle:
 * - Creates and initializes the graph
 * - Handles legal requests
 * - Provides status checking
 *
 * Phase 3 (M0): Simple echo workflow to prove LLM integration
 * Future phases: Document analysis, metadata extraction, compliance checking
 */
@Injectable()
export class LegalDepartmentService implements OnModuleInit {
  private readonly logger = new Logger(LegalDepartmentService.name);
  private graph!: LegalDepartmentGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Legal Department AI graph...');
    this.graph = await createLegalDepartmentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Legal Department AI graph initialized');
  }

  /**
   * Process a legal department request
   *
   * @param input - Input containing ExecutionContext and request params
   */
  async process(input: LegalDepartmentInput): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.taskId;

    this.logger.log(
      `Starting legal department workflow: taskId=${taskId}, documents=${input.documents?.length || 0}, hasLegalMetadata=${!!input.legalMetadata}`,
    );

    try {
      // Initial state - pass ExecutionContext directly
      // Include legalMetadata from API document processing for CLO routing
      const initialState: Partial<LegalDepartmentState> = {
        executionContext: context,
        userMessage: input.userMessage,
        documents: input.documents || [],
        legalMetadata: input.legalMetadata,
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
      )) as LegalDepartmentState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Legal department workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        response: finalState.response,
        error: finalState.error,
        duration,
        // Include specialist analysis data for frontend consumption
        specialistOutputs: finalState.specialistOutputs,
        legalMetadata: finalState.legalMetadata,
        routingDecision: finalState.routingDecision,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Legal department workflow failed: taskId=${taskId}, error=${errorMessage}`,
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
   * Get status of a workflow by task ID
   */
  async getStatus(taskId: string): Promise<LegalDepartmentStatus | null> {
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

      const values = state.values as LegalDepartmentState;

      return {
        taskId,
        status: values.status,
        userMessage: values.userMessage,
        response: values.response,
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
  async getHistory(taskId: string): Promise<LegalDepartmentState[]> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const history: LegalDepartmentState[] = [];
      for await (const state of this.graph.getStateHistory(config)) {
        history.push(state.values as LegalDepartmentState);
      }

      return history;
    } catch (error) {
      this.logger.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }
}
