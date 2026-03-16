import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createCustomerServiceGraph,
  CustomerServiceGraph,
} from './customer-service.graph';
import {
  CustomerServiceInput,
  CustomerServiceState,
  CustomerServiceResult,
  CustomerServiceStatus,
} from './customer-service.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

// Max history window: 20 messages (10 turns)
const HISTORY_WINDOW = 20;

/**
 * CustomerServiceService
 *
 * Manages the Customer Service agent lifecycle:
 * - Creates and initializes the LangGraph graph
 * - Handles conversation requests
 * - Applies conversation history windowing
 * - Provides status checking
 */
@Injectable()
export class CustomerServiceService implements OnModuleInit {
  private readonly logger = new Logger(CustomerServiceService.name);
  private graph!: CustomerServiceGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Customer Service graph...');
    this.graph = await createCustomerServiceGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Customer Service graph initialized');
  }

  /**
   * Process a customer service conversation request
   */
  async process(input: CustomerServiceInput): Promise<CustomerServiceResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting customer service workflow: conversationId=${taskId}, mode=${input.interactionMode || 'text'}, historyLength=${input.messages?.length || 0}`,
    );

    const conversationHistory = this.applyHistoryWindow(input.messages || []);

    const initialState: Partial<CustomerServiceState> = {
      executionContext: context,
      userMessage: input.userMessage,
      conversationHistory,
      interactionMode: input.interactionMode || 'text',
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
    )) as CustomerServiceState;

    const duration = Date.now() - startTime;

    this.logger.log(
      `Customer service workflow completed: taskId=${taskId}, status=${finalState.status}, intent=${finalState.intent}, duration=${duration}ms`,
    );

    return {
      taskId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      userMessage: input.userMessage,
      response: finalState.response,
      intent: finalState.intent,
      error: finalState.error,
      duration,
    };
  }

  /**
   * Get status of a workflow by task ID
   */
  async getStatus(taskId: string): Promise<CustomerServiceStatus | null> {
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

      const values = state.values as CustomerServiceState;

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
   * Apply conversation history window.
   *
   * Rules:
   * - Keep the last HISTORY_WINDOW (20) messages maximum
   * - Always preserve the first user message (it often contains the core question)
   */
  private applyHistoryWindow(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (messages.length <= HISTORY_WINDOW) {
      return messages;
    }

    // Always keep first user message
    const firstUserMessage = messages.find((m) => m.role === 'user');
    const recentMessages = messages.slice(-HISTORY_WINDOW);

    // If first user message is not in the recent window, prepend it and enforce cap
    if (
      firstUserMessage &&
      !recentMessages.some(
        (m) => m.role === 'user' && m.content === firstUserMessage.content,
      )
    ) {
      // Prepend first user message and drop the oldest from the window so total stays at HISTORY_WINDOW
      const withFirst = [firstUserMessage, ...recentMessages.slice(1)];
      return withFirst.slice(0, HISTORY_WINDOW);
    }

    return recentMessages;
  }
}
