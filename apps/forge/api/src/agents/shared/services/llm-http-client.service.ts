import { Injectable, Inject, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  LLM_SERVICE,
  type LLMServiceProvider,
} from '@/planes/llm/llm.interface';

export interface LLMCallRequest {
  /** ExecutionContext - the core context that flows through the system */
  context: ExecutionContext;
  /** System message/prompt for the LLM */
  systemMessage?: string;
  /** User message to send to the LLM */
  userMessage: string;
  /** Temperature for response generation */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Name of the calling agent/service */
  callerName?: string;
}

export interface LLMCallResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
}

@Injectable()
export class LLMHttpClientService {
  private readonly logger = new Logger(LLMHttpClientService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {
    this.logger.log('LLM client configured: using LLM_SERVICE provider plane');
  }

  /**
   * Make a non-streaming LLM call via the LLM provider plane.
   */
  async callLLM(request: LLMCallRequest): Promise<LLMCallResponse> {
    const { context } = request;

    this.logger.debug('Calling LLM via provider plane', {
      provider: context.provider,
      model: context.model,
      caller: request.callerName,
      taskId: context.taskId,
    });

    if (!context.userId) {
      throw new Error('userId is required in ExecutionContext for LLM calls');
    }

    const result = await this.llmService.generateResponse(
      request.systemMessage || '',
      request.userMessage,
      {
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 3500,
        callerType: 'langgraph',
        callerName: request.callerName || 'workflow',
        executionContext: context,
      },
    );

    // generateResponse returns string | LLMResponse
    if (typeof result === 'string') {
      return { text: result };
    }

    const usage = result.metadata?.usage;
    return {
      text: result.content,
      usage: usage
        ? {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
          }
        : undefined,
    };
  }
}
