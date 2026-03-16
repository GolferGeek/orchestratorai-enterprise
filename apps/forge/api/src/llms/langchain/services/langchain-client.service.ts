import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { isLLMResponse } from '@/llms/services/llm-interfaces';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * LangChain Client Service
 *
 * Adapter service that provides LangChain-compatible interface while using
 * our centralized LLMService for intelligent routing and monitoring.
 * All LLM calls are routed through the centralized service for consistency.
 */
@Injectable()
export class LangChainClientService {
  private readonly logger = new Logger(LangChainClientService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Execute a simple LLM call with system and user messages
   * Now uses centralized LLMService for consistent routing and monitoring
   */
  async executeSimpleCall(
    systemPrompt: string,
    userMessage: string,
    executionContext: ExecutionContext,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
    },
  ): Promise<string> {
    // Use centralized LLMService instead of direct LangChain client
    const result = await this.llmService.generateResponse(
      systemPrompt,
      userMessage,
      {
        temperature: options?.temperature || 0.7,
        provider: options?.provider as
          | 'openai'
          | 'anthropic'
          | 'google'
          | 'ollama', // Only specify if explicitly requested
        modelName: options?.model, // Only specify if explicitly requested
        complexity: 'simple', // LangChain tool operations are typically simple
        callerType: 'service',
        callerName: 'langchain-client-service',
        dataClassification: 'internal',
        executionContext,
      },
    );

    if (typeof result === 'string') {
      return result;
    }

    if (isLLMResponse(result)) {
      return result.content;
    }

    return String(result ?? '');
  }

  /**
   * Check if LangChain client is properly configured
   * Now delegates to centralized LLMService availability
   */
  isConfigured(): boolean {
    // Since we now use centralized LLMService, we're always "configured"
    // The LLMService handles provider availability and fallbacks
    return true;
  }

  /**
   * Get available LLM providers
   */
  getAvailableProviders(): string[] {
    const providers = ['openai'];

    // Could add more providers based on available API keys
    // if (this.configService.get<string>('ANTHROPIC_API_KEY')) {
    //   providers.push('anthropic');
    // }

    return providers;
  }
}
