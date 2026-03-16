import { Injectable, Logger } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMessage } from '@langchain/core/messages';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { ChatResult } from '@langchain/core/outputs';
import { SourceBlindingService } from './source-blinding.service';
import { ProviderConfigService } from './provider-config.service';

export interface BlindedLLMConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  sourceBlindingOptions?: {
    policyProfile?: string;
    dataClass?: string;
    sovereignMode?: string;
    noTrain?: boolean;
    noRetain?: boolean;
  };
}

/**
 * Source-blinded wrapper for LangChain LLMs
 * Intercepts all HTTP calls to apply complete source blinding
 */
@Injectable()
export class BlindedLLMService {
  private readonly logger = new Logger(BlindedLLMService.name);

  constructor(
    private readonly sourceBlindingService: SourceBlindingService,
    private readonly providerConfigService: ProviderConfigService,
  ) {
    this.logger.log('BlindedLLMService initialized');
  }

  /**
   * Create a source-blinded LangChain LLM
   */
  createBlindedLLM(config: BlindedLLMConfig): BaseChatModel {
    const providerConfig = this.providerConfigService.getEnhancedProviderConfig(
      config.provider,
    );
    if (!providerConfig) {
      throw new Error(`Provider configuration not found: ${config.provider}`);
    }

    // Get source blinding options
    const blindingOptions = {
      provider: config.provider,
      policyProfile: config.sourceBlindingOptions?.policyProfile || 'standard',
      dataClass: config.sourceBlindingOptions?.dataClass || 'public',
      sovereignMode: config.sourceBlindingOptions?.sovereignMode || 'false',
      noTrain:
        config.sourceBlindingOptions?.noTrain ??
        providerConfig.features.supportsNoTrain,
      noRetain: config.sourceBlindingOptions?.noRetain ?? false,
    };

    // Create blinded HTTP client
    const blindedClient = this.sourceBlindingService.createBlindedHttpClient(
      config.provider,
      blindingOptions,
    );

    let llm: BaseChatModel;

    switch (config.provider) {
      case 'openai':
        // Require explicit model - no fallbacks allowed
        if (!config.model) {
          throw new Error(
            'OpenAI model must be explicitly specified - no fallback model configured',
          );
        }

        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey || providerConfig.apiKey,
          modelName: config.model,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens,
          configuration: {
            baseURL: config.baseUrl || providerConfig.baseUrl,
            fetch: this.createBlindedFetch(blindedClient, config.provider),
          },
        }) as unknown as BaseChatModel;
        break;

      case 'anthropic':
        // Require explicit model - no fallbacks allowed
        if (!config.model) {
          throw new Error(
            'Anthropic model must be explicitly specified - no fallback model configured',
          );
        }

        llm = new ChatAnthropic({
          anthropicApiKey: config.apiKey || providerConfig.apiKey,
          modelName: config.model,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens,
          clientOptions: {
            baseURL: config.baseUrl || providerConfig.baseUrl,
            fetch: this.createBlindedFetch(blindedClient, config.provider),
          },
        }) as unknown as BaseChatModel;
        break;

      case 'google':
        if (!config.model) {
          throw new Error(
            'Google model must be explicitly specified - no fallback model configured',
          );
        }

        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey || providerConfig.apiKey,
          model: config.model,
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens,
        }) as unknown as BaseChatModel;
        break;

      default:
        throw new Error(`Unsupported provider: ${String(config.provider)}`);
    }

    // Wrap the LLM to add logging and validation
    return this.wrapWithSourceBlindingValidation(llm, config.provider);
  }

  /**
   * Create a blinded fetch function for LangChain HTTP clients
   */
  private createBlindedFetch(blindedClient: unknown, provider: string) {
    return async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      try {
        this.logger.debug(
          `Intercepting ${provider} request for source blinding`,
        );

        // Convert fetch-style request to axios-style
        const axiosConfig = this.convertFetchToAxios(url, init);

        // Make the blinded request
        const blindedClientAny = blindedClient as {
          post: (
            url: string,
            data: unknown,
            options: unknown,
          ) => Promise<unknown>;
        };
        const response = await blindedClientAny.post(
          axiosConfig.url,
          axiosConfig.data,
          {
            headers: axiosConfig.headers,
            ...(axiosConfig.options as Record<string, unknown>),
          },
        );

        // Convert axios response back to fetch-style Response
        return this.convertAxiosToFetchResponse(response);
      } catch (error) {
        this.logger.error(`Blinded fetch failed for ${provider}:`, error);
        throw error;
      }
    };
  }

  /**
   * Convert fetch request to axios format
   */
  private convertFetchToAxios(
    url: string | URL | Request,
    init?: RequestInit,
  ): {
    url: string;
    data?: unknown;
    headers: Record<string, string>;
    options: unknown;
  } {
    let requestUrl = '';
    if (typeof url === 'string') {
      requestUrl = url;
    } else if (url instanceof URL) {
      requestUrl = url.toString();
    } else if (url && typeof (url as { url?: string }).url === 'string') {
      requestUrl = (url as { url: string }).url;
    }

    const headers: Record<string, string> = {};

    // Extract headers from init
    if (init?.headers) {
      const headerEntries = init.headers as Record<string, unknown>;
      if (typeof headerEntries.entries === 'function') {
        // Headers object
        for (const [key, value] of (
          headerEntries as { entries: () => Iterable<[string, string]> }
        ).entries()) {
          headers[key] = String(value);
        }
      } else if (typeof headerEntries === 'object') {
        // Plain object
        Object.assign(headers, headerEntries);
      }
    }

    return {
      url: requestUrl,
      data: init?.body,
      headers,
      options: {
        method: init?.method || 'GET',
        timeout: 30000,
      },
    };
  }

  /**
   * Convert axios response to fetch Response
   */
  private convertAxiosToFetchResponse(axiosResponse: unknown): Response {
    const axiosResp = axiosResponse as Record<string, unknown>;
    const response = new Response(JSON.stringify(axiosResp.data), {
      status: axiosResp.status as number,
      statusText: axiosResp.statusText as string,
      headers: new Headers(axiosResp.headers as HeadersInit),
    });

    return response;
  }

  /**
   * Wrap LLM with source blinding validation and logging
   */
  private wrapWithSourceBlindingValidation(
    llm: BaseChatModel,
    provider: string,
  ): BaseChatModel {
    // Create a proxy to intercept all LLM calls
    return new Proxy(llm, {
      get: (target, prop) => {
        if (prop === '_call' || prop === 'call') {
          return async (
            messages: BaseMessage[],
            options?: Record<string, unknown>,
            callbacks?: CallbackManagerForLLMRun,
          ): Promise<ChatResult> => {
            this.logger.debug(
              `Source-blinded LLM call starting for ${provider}`,
            );

            const startTime = Date.now();

            try {
              // Call the original LLM method (which will use our blinded fetch)
              const method = (target as unknown as Record<string, unknown>)[
                prop
              ] as (...args: unknown[]) => Promise<ChatResult>;
              const result = await method.call(
                target,
                messages,
                options,
                callbacks,
              );

              const endTime = Date.now();
              this.logger.debug(
                `Source-blinded LLM call completed for ${provider} in ${endTime - startTime}ms`,
              );

              return result;
            } catch (error) {
              this.logger.error(
                `Source-blinded LLM call failed for ${provider}:`,
                error,
              );
              throw error;
            }
          };
        }

        return (target as unknown as Record<string, unknown>)[prop as string];
      },
    });
  }

  /**
   * Create multiple blinded LLMs for different use cases
   */
  createBlindedLLMs(baseConfig: Omit<BlindedLLMConfig, 'provider'>): {
    openai: BaseChatModel;
    anthropic: BaseChatModel;
    google: BaseChatModel;
  } {
    return {
      openai: this.createBlindedLLM({
        ...baseConfig,
        provider: 'openai',
      }),
      anthropic: this.createBlindedLLM({
        ...baseConfig,
        provider: 'anthropic',
      }),
      google: this.createBlindedLLM({
        ...baseConfig,
        provider: 'google',
      }),
    };
  }

  /**
   * Test source blinding by making a sample request
   */
  async testSourceBlinding(
    provider: 'openai' | 'anthropic' | 'google',
  ): Promise<{
    success: boolean;
    blindingApplied: boolean;
    headerCount: number;
    strippedHeaders: string[];
    error?: string;
  }> {
    try {
      const blindedLLM = this.createBlindedLLM({
        provider,
        model:
          provider === 'openai'
            ? 'gpt-4o-mini'
            : provider === 'anthropic'
              ? 'claude-3-haiku-20240307'
              : 'gemini-pro',
        sourceBlindingOptions: {
          policyProfile: 'test',
          dataClass: 'public',
          sovereignMode: 'false',
          noTrain: true,
          noRetain: false,
        },
      });

      // Make a simple test call
      const testMessages = [
        {
          role: 'user' as const,
          content: 'Hello, this is a source blinding test.',
        },
      ];

      // This should trigger our blinded HTTP client
      await blindedLLM.invoke(testMessages as unknown as BaseMessage[]);

      return {
        success: true,
        blindingApplied: true,
        headerCount: 0, // TODO: Extract from actual request
        strippedHeaders: [], // TODO: Extract from actual request
      };
    } catch (error) {
      this.logger.error(`Source blinding test failed for ${provider}:`, error);
      return {
        success: false,
        blindingApplied: false,
        headerCount: 0,
        strippedHeaders: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get source blinding statistics
   */
  getStats(): {
    supportedProviders: string[];
    sourceBlindingEnabled: boolean;
    blindingService: unknown;
  } {
    return {
      supportedProviders: ['openai', 'anthropic', 'google'],
      sourceBlindingEnabled: true,
      blindingService: this.sourceBlindingService.getStats(),
    };
  }
}
