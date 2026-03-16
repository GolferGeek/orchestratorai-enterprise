import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Command, isGraphInterrupt } from '@langchain/langgraph';
import {
  createExtendedPostWriterGraph,
  ExtendedPostWriterGraph,
} from './extended-post-writer.graph';
import {
  ExtendedPostWriterInput,
  ExtendedPostWriterState,
  ExtendedPostWriterResult,
  ExtendedPostWriterStatus,
  GeneratedContent,
  HitlResponse,
  HitlResumeInput,
} from './extended-post-writer.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * ExtendedPostWriterService
 *
 * Manages the Extended Post Writer agent lifecycle:
 * - Creates and initializes the graph
 * - Handles content generation requests
 * - Manages HITL resume flow
 * - Provides status checking
 */
@Injectable()
export class ExtendedPostWriterService implements OnModuleInit {
  private readonly logger = new Logger(ExtendedPostWriterService.name);
  private graph!: ExtendedPostWriterGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Extended Post Writer graph...');
    this.graph = await createExtendedPostWriterGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Extended Post Writer graph initialized');
  }

  /**
   * Generate content (will pause at HITL)
   *
   * @param input - Input containing ExecutionContext and content generation params
   */
  async generate(
    input: ExtendedPostWriterInput,
  ): Promise<ExtendedPostWriterResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(`Starting content generation: conversationId=${taskId}`);

    try {
      // Initial state - pass ExecutionContext directly, no individual fields
      const initialState: Partial<ExtendedPostWriterState> = {
        executionContext: context,
        userMessage: input.userMessage,
        context: input.additionalContext,
        keywords: input.keywords,
        tone: input.tone,
        status: 'started',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const result = (await this.graph.invoke(
        initialState,
        config,
      )) as ExtendedPostWriterState;

      const state = await this.graph.getState(config);
      const isInterrupted = state.next && state.next.length > 0;

      // Debug logging for HITL detection
      console.log(
        `🔍 [HITL-DEBUG] Graph result: status=${result.status}, hitlPending=${result.hitlPending}`,
      );
      console.log(
        `🔍 [HITL-DEBUG] Graph state: next=${JSON.stringify(state.next)}, tasks=${JSON.stringify(state.tasks)}`,
      );
      this.logger.log(
        `Content generation result: taskId=${taskId}, interrupted=${isInterrupted}, status=${result.status}, hitlPending=${result.hitlPending}`,
      );

      const generatedContent: GeneratedContent = {
        blogPost: result.blogPost,
        seoDescription: result.seoDescription,
        socialPosts: result.socialPosts,
      };

      // Check for HITL interrupt: either state.next indicates interruption OR result.status/hitlPending indicates HITL
      // This handles cases where interrupt() pauses but graph.invoke() completes without throwing
      const isHitlWaiting =
        isInterrupted ||
        result.hitlPending === true ||
        result.status === 'hitl_waiting';

      return {
        taskId,
        status: isHitlWaiting ? 'hitl_waiting' : result.status,
        userMessage: input.userMessage,
        generatedContent,
        error: result.error,
      };
    } catch (error) {
      // Check if this is a GraphInterrupt - this means the graph paused for HITL
      if (isGraphInterrupt(error)) {
        this.logger.log(`Content generation paused at HITL: taskId=${taskId}`);

        // Get the current state from the checkpoint
        const config = {
          configurable: {
            thread_id: taskId,
          },
        };

        try {
          const state = await this.graph.getState(config);
          const values = state.values as ExtendedPostWriterState;

          const generatedContent: GeneratedContent = {
            blogPost: values.blogPost,
            seoDescription: values.seoDescription,
            socialPosts: values.socialPosts,
          };

          return {
            taskId,
            status: 'hitl_waiting',
            userMessage: input.userMessage,
            generatedContent,
          };
        } catch (stateError) {
          this.logger.error(
            `Failed to get state after interrupt: ${String(stateError)}`,
          );
          // Return with partial content if state retrieval fails
          return {
            taskId,
            status: 'hitl_waiting',
            userMessage: input.userMessage,
            generatedContent: {
              blogPost: '',
              seoDescription: '',
              socialPosts: [],
            },
          };
        }
      }

      // For other errors, return failure
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Content generation failed: taskId=${taskId}, error=${errorMessage}`,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Resume from HITL with decision
   */
  async resume(
    taskId: string,
    response: HitlResumeInput,
  ): Promise<ExtendedPostWriterResult> {
    this.logger.log(
      `Resuming from HITL: taskId=${taskId}, decision=${response.decision}`,
    );

    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const currentState = await this.graph.getState(config);
      if (!currentState.values) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const values = currentState.values as ExtendedPostWriterState;

      const result = (await this.graph.invoke(
        new Command({ resume: response }),
        config,
      )) as ExtendedPostWriterState;

      const duration = Date.now() - values.startedAt;

      this.logger.log(
        `HITL resume completed: taskId=${taskId}, status=${result.status}, duration=${duration}ms`,
      );

      const generatedContent: GeneratedContent = {
        blogPost: result.blogPost,
        seoDescription: result.seoDescription,
        socialPosts: result.socialPosts,
      };

      return {
        taskId,
        status: result.status,
        userMessage: values.userMessage,
        generatedContent,
        finalContent: result.finalContent,
        error: result.error,
        duration,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `HITL resume failed: taskId=${taskId}, error=${errorMessage}`,
      );

      throw new Error(`Resume failed: ${errorMessage}`);
    }
  }

  /**
   * Get status of content generation by task ID
   */
  async getStatus(taskId: string): Promise<ExtendedPostWriterStatus | null> {
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

      const values = state.values as ExtendedPostWriterState;
      const isInterrupted = state.next && state.next.length > 0;

      const generatedContent: GeneratedContent = {
        blogPost: values.blogPost,
        seoDescription: values.seoDescription,
        socialPosts: values.socialPosts,
      };

      return {
        taskId,
        status: isInterrupted ? 'hitl_waiting' : values.status,
        userMessage: values.userMessage,
        generatedContent,
        finalContent: values.finalContent,
        hitlPending: isInterrupted,
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
  async getHistory(taskId: string): Promise<ExtendedPostWriterState[]> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const history: ExtendedPostWriterState[] = [];
      for await (const state of this.graph.getStateHistory(config)) {
        history.push(state.values as ExtendedPostWriterState);
      }

      return history;
    } catch (error) {
      this.logger.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }
}
