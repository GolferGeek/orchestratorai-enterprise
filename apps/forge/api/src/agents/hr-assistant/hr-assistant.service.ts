import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHrAssistantGraph, HrAssistantGraph } from './hr-assistant.graph';
import {
  HrAssistantInput,
  HrAssistantResult,
  HrAssistantState,
} from './hr-assistant.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { RagHttpClientService } from '../shared/services/rag-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * HrAssistantService
 *
 * Manages the HR Assistant agent lifecycle:
 * - Creates and initializes the graph on module init
 * - Executes HR policy queries via the LangGraph workflow
 */
@Injectable()
export class HrAssistantService implements OnModuleInit {
  private readonly logger = new Logger(HrAssistantService.name);
  private graph!: HrAssistantGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly ragClient: RagHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing HR Assistant graph...');
    this.graph = await createHrAssistantGraph(
      this.llmClient,
      this.ragClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('HR Assistant graph initialized');
  }

  /**
   * Execute an HR policy query.
   *
   * Invokes the LangGraph workflow with the provided ExecutionContext and question.
   * Errors propagate — no swallowing.
   *
   * @param input - Input containing ExecutionContext and the HR question
   */
  async execute(input: HrAssistantInput): Promise<HrAssistantResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(`Starting HR Assistant query: conversationId=${taskId}`);

    const initialState: Partial<HrAssistantState> = {
      executionContext: context,
      userMessage: input.userMessage,
      status: 'pending',
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
    )) as HrAssistantState;

    const duration = Date.now() - startTime;

    this.logger.log(
      `HR Assistant query completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
    );

    return {
      taskId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      userMessage: input.userMessage,
      result: finalState.result || undefined,
      sources: finalState.sources,
      error: finalState.error,
      duration,
    };
  }
}
