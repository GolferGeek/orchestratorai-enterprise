import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { Command, GraphInterrupt, isInterrupted } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  createLegalDepartmentGraph,
  LegalDepartmentGraph,
} from './legal-department.graph';
import {
  createContractReviewGraph,
  ContractReviewGraph,
} from './workflows/contract-review/contract-review.graph';
import {
  LegalDepartmentInput,
  LegalDepartmentState,
  LegalDepartmentResult,
  LegalDepartmentStatus,
} from './legal-department.state';
import type { ReviewDecisionPayload } from './jobs/legal-jobs.types';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { RAG_STORAGE_SERVICE } from '@orchestratorai/planes/rag';
import type { RagStorageService } from '@orchestratorai/planes/rag';

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
  private contractReviewGraph!: ContractReviewGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    @Inject(RAG_STORAGE_SERVICE)
    @Optional()
    private readonly ragService?: RagStorageService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Legal Department AI graph...');
    this.graph = await createLegalDepartmentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.ragService,
    );
    this.contractReviewGraph = await createContractReviewGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log(
      'Legal Department AI graphs initialized (document-onboarding + contract-review)',
    );
  }

  /**
   * Process a legal department request
   *
   * @param input - Input containing ExecutionContext and request params
   */
  async process(input: LegalDepartmentInput): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting legal department workflow: taskId=${taskId}, documents=${input.documents?.length || 0}, documentsMetadata=${input.documentsMetadata?.length || 0}`,
    );

    try {
      // Initial state - pass ExecutionContext directly
      // Include legalMetadata from API document processing for CLO routing
      const initialState: Partial<LegalDepartmentState> = {
        executionContext: context,
        userMessage: input.userMessage,
        documents: input.documents || [],
        documentsMetadata: input.documentsMetadata || [],
        status: 'started',
        startedAt: startTime,
        ...(input.outputMode && { outputMode: input.outputMode }),
        ...(input.clauseMap && { clauseMap: input.clauseMap }),
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      // Dispatch to the right graph based on outputMode
      const activeGraph =
        input.outputMode === 'contract-review'
          ? this.contractReviewGraph
          : this.graph;

      const finalState = (await activeGraph.invoke(
        initialState,
        config,
      )) as LegalDepartmentState;

      // LangGraph's graph.invoke does NOT throw when an `interrupt()` fires
      // — it returns the current state with an `__interrupt__` key. Surface
      // that to the worker as a GraphInterrupt so the shared catch path
      // flips the job to `awaiting_review`.
      if (isInterrupted(finalState)) {
        this.logger.log(
          `Legal department workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

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
        documentsMetadata: finalState.documentsMetadata,
        routingDecision: finalState.routingDecision,
        redlineOutput: finalState.redlineOutput,
      };
    } catch (error) {
      // Re-throw GraphInterrupt unchanged so the worker's catch path can
      // transition the job to awaiting_review. Do NOT mark the run as
      // failed — the graph is paused, not broken.
      if (error instanceof GraphInterrupt) throw error;
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
   * Expose the compiled graph for callers that need to stream/invoke it
   * directly (the HITL resume path uses this to call invoke with a
   * `Command({ resume })` without going through process()).
   */
  getGraph(capabilitySlug?: string): LegalDepartmentGraph {
    return capabilitySlug === 'contract-review'
      ? this.contractReviewGraph
      : this.graph;
  }

  /**
   * Resume a paused graph after an attorney review decision.
   *
   * The graph is rehydrated from the Postgres checkpointer keyed on
   * `thread_id === context.conversationId`. Passing a `Command({ resume })`
   * causes `interrupt()` inside hitl-checkpoint.node to return the decision
   * payload; the graph then runs to completion (or the next interrupt).
   *
   * ExecutionContext is passed whole into the config.configurable so
   * downstream nodes that re-read it see the same capsule that was used
   * for the original run.
   */
  async resumeWithDecision(
    context: ExecutionContext,
    threadId: string,
    decision: ReviewDecisionPayload,
    capabilitySlug?: string,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    this.logger.log(
      `Resuming legal department workflow: taskId=${threadId}, decision=${decision.decision}, org=${context.orgSlug}, user=${context.userId}`,
    );

    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    // Command.resume is the LangGraph idiom that feeds a value back into
    // interrupt() on the paused node. The checkpointer rehydrates the rest
    // of the state.
    const activeGraph =
      capabilitySlug === 'contract-review'
        ? this.contractReviewGraph
        : this.graph;
    const finalState = (await activeGraph.invoke(
      new Command({ resume: decision }),
      config,
    )) as LegalDepartmentState;

    // If the resume hits ANOTHER interrupt (e.g. reject path re-ran
    // specialists and paused for re-review), bubble it up so the worker
    // flips the row back to awaiting_review.
    if (isInterrupted(finalState)) {
      this.logger.log(
        `Legal department workflow re-paused at HITL after resume: taskId=${threadId}`,
      );
      throw new GraphInterrupt(
        (finalState as unknown as { __interrupt__: unknown[] })
          .__interrupt__ as never,
      );
    }

    const duration = Date.now() - startTime;

    return {
      taskId: threadId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      userMessage: finalState.userMessage ?? '',
      response: finalState.response,
      error: finalState.error,
      duration,
      specialistOutputs: finalState.specialistOutputs,
      documentsMetadata: finalState.documentsMetadata,
      routingDecision: finalState.routingDecision,
      redlineOutput: finalState.redlineOutput,
    };
    // Intentionally no try/catch: if the resume fails (including a
    // re-interrupt) the worker catches GraphInterrupt and transitions the
    // row to awaiting_review again, and any other error propagates so the
    // worker marks the job as failed with the real error message.
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
