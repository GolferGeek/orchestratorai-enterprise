import { Injectable, Inject, Logger, ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { CIDAFMService } from '../cidafm/cidafm.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import type { DictionaryPseudonymMapping } from '../pii/dictionary-pseudonymizer.service';
import { PatternRedactionService } from '../pii/pattern-redaction.service';
import { PiiBoundaryService } from '../pii/pii-boundary.service';
import type { PatternRedactionMapping } from '../pii/pattern-redaction.service';
import { LocalModelStatusService } from '../local-model-status.service';
import { LocalLLMService } from '../local-llm.service';
import { LLMServiceFactory } from './llm-service-factory';
import { ModelConfigurationService } from '../config/model-configuration.service';
import type { EnvironmentName } from '../config/model-configuration.service';
import {
  GenerateResponseParams,
  UnifiedGenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  LLMRequestOptions,
  PrivacySummary,
} from './llm-interfaces';
import {
  CostCalculation,
  LLMUsageMetrics,
  CIDAFMOptions,
  SystemOperationType,
  UserLLMPreferences,
} from '../types/llm-evaluation';
import type {
  PIIProcessingMetadata,
  PIIMatch,
} from '../types/pii-metadata.types';
import {
  LLMError,
  LLMErrorMapper,
  LLMErrorMonitor,
  LLMErrorType,
} from './llm-error-handling';

type GenerateResponseOptions = LLMRequestOptions & {
  // Widened from a 4-name union: the factory also routes 'xai'/'grok', and
  // LLMServiceProvider declares this as string, so the narrow literal type
  // both under-described reality and stopped this class satisfying the
  // interface it is registered against.
  provider?: string;
  cidafmOptions?: CIDAFMOptions;
  complexity?: 'simple' | 'medium' | 'complex' | 'reasoning';
  images?: Array<{ base64: string; mimeType: string }>;
};


/**
 * LLMGenerationService - Focused service for LLM text generation
 *
 * This service handles all text generation operations including:
 * - Simple LLM calls with system and user messages
 * - Conversation history support
 * - System operations (optimized configurations)
 * - User content generation with preferences
 * - Unified response generation
 *
 * All methods accept ExecutionContext as the first parameter to ensure
 * proper tracking, observability, and compliance with architectural patterns.
 *
 * Note: Agents do not use LangChain/LangGraph directly. All LLM calls
 * go through the LLMServiceFactory which uses the planes LLM abstraction.
 */
@Injectable()
export class LLMGenerationService {
  private readonly logger = new Logger(LLMGenerationService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly cidafmService: CIDAFMService,
    private readonly runMetadataService: RunMetadataService,
    private readonly providerConfigService: ProviderConfigService,
    private readonly piiService: PIIService,
    private readonly dictionaryPseudonymizerService: DictionaryPseudonymizerService,
    private readonly patternRedactionService: PatternRedactionService,
    private readonly localModelStatusService: LocalModelStatusService,
    private readonly localLLMService: LocalLLMService,
    private readonly llmServiceFactory: LLMServiceFactory,
    private readonly modelConfigurationService: ModelConfigurationService,
    private readonly piiBoundary: PiiBoundaryService,
  ) {}

  // =====================================
  // THE BEFORE / AFTER LAYER
  // =====================================
  //
  // SECURITY CRITICAL, and the architectural point of this service.
  //
  // Everything that matters happens here, around the provider call:
  //
  //   before:  pseudonymize -> pattern-redact         (PiiBoundaryService)
  //   CALL:    llmServiceFactory -> one backend       (a dumb HTTP call)
  //   after:   un-redact -> un-pseudonymize           (PiiBoundaryService)
  //
  // Backends are deliberately trivial: BaseLLMService has exactly one abstract
  // method, and usage/cost/metadata are inherited. A backend must never carry
  // its own privacy logic — if you find yourself adding some, the backend is
  // being wired in at the wrong layer.
  //
  // See docs/architecture/llm-boundary.md.


  /**
   * Simple LLM call with system and user messages
   *
   * @param executionContext - ExecutionContext (REQUIRED) - contains provider, model, and tracking info
   * @param systemPrompt - System prompt for the LLM
   * @param userMessage - User message to process
   * @param options - Optional parameters (temperature, maxTokens, etc.)
   * @returns Promise<string | LLMResponse> - String content or full response object
   */
  async generateResponse(
    executionContext: ExecutionContext,
    systemPrompt: string,
    userMessage: string,
    options?: GenerateResponseOptions,
  ): Promise<string | LLMResponse> {
    // Validate ExecutionContext is provided
    if (!executionContext) {
      throw new Error('ExecutionContext is required for generateResponse.');
    }

    // Defense-in-depth: Validate sovereign mode compliance
    this.validateSovereignModeProvider(executionContext);

    // Extract provider/model from ExecutionContext - it's the single source of truth
    const providerName = executionContext.provider;
    const modelName = executionContext.model;

    if (!providerName || !modelName) {
      throw new Error(
        'ExecutionContext must contain provider and model. These are required fields.',
      );
    }

    try {
      // === before ===
      const pipeline = await this.piiBoundary.apply({
        userMessage,
        providerName,
        organizationSlug: executionContext.orgSlug ?? null,
        agentSlug: executionContext.agentSlug ?? null,
        requestId:
          executionContext.conversationId ||
          `pii-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        existingMetadata: options?.piiMetadata ?? null,
        skip: options?.quick === true,
      });

      if (pipeline.blocked) {
        return this.piiBoundary.buildBlockedResponse(
          pipeline,
          providerName,
          modelName,
        );
      }

      // Use the new unified LLM service factory approach
      const config: LLMServiceConfig = {
        provider: providerName,
        model: modelName,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      };

      const factoryParams: GenerateResponseParams = {
        systemPrompt,
        userMessage: pipeline.processedUserMessage,
        images: options?.images,
        config,
        options: {
          callerType: options?.callerType,
          callerName: options?.callerName,
          authToken: options?.authToken,
          currentUser: options?.currentUser,
          dataClassification: options?.dataClassification,
          piiMetadata: pipeline.piiMetadata,
          dictionaryMappings: pipeline.dictionaryMappings,
          routingDecision: options?.routingDecision,
          executionContext,
        },
      };

      const unifiedResult = await this.llmServiceFactory.generateResponse(
        config,
        factoryParams,
      );

      // === after ===
      return this.piiBoundary.restore(unifiedResult, pipeline, providerName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`LLM service error: ${errorMessage}`);
    }
  }

  /**
   * Unified generateResponse method - the new entry point for all LLM requests
   *
   * @param executionContext - ExecutionContext (REQUIRED)
   * @param params - Unified parameters including provider, model, and messages
   * @returns Promise<string | LLMResponse>
   */
  async generateUnifiedResponse(
    executionContext: ExecutionContext,
    params: UnifiedGenerateResponseParams,
  ): Promise<string | LLMResponse> {
    // Validate required parameters
    if (!executionContext) {
      throw new Error(
        'ExecutionContext is required in generateUnifiedResponse',
      );
    }

    // Defense-in-depth: Validate sovereign mode compliance
    this.validateSovereignModeProvider(executionContext);

    if (!params.provider) {
      throw new Error('Missing required parameter: provider is required');
    }
    if (!params.model) {
      throw new Error('Missing required parameter: model is required');
    }
    if (!params.systemPrompt) {
      throw new Error('Missing required parameter: systemPrompt is required');
    }
    if (!params.userMessage) {
      throw new Error('Missing required parameter: userMessage is required');
    }

    // Validate provider is supported
    const supportedProviders = [
      'openai',
      'anthropic',
      'google',
      'grok',
      'ollama',
      'ollama-cloud',
      'xai',
      'openrouter',
    ];
    if (!supportedProviders.includes(params.provider.toLowerCase())) {
      throw new Error(
        `Unsupported provider: ${params.provider}. Supported providers: ${supportedProviders.join(', ')}`,
      );
    }

    try {
      // === before ===
      const pipeline = await this.piiBoundary.apply({
        userMessage: params.userMessage,
        providerName: params.provider,
        organizationSlug: executionContext.orgSlug ?? null,
        agentSlug: executionContext.agentSlug ?? null,
        requestId:
          params.options?.conversationId ||
          params.options?.sessionId ||
          `pii-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        existingMetadata: params.options?.piiMetadata ?? null,
        skip: params.options?.quick === true,
      });

      if (pipeline.blocked) {
        const blocked = this.piiBoundary.buildBlockedResponse(
          pipeline,
          params.provider,
          params.model,
        );
        return params.options?.includeMetadata ? blocked : blocked.content;
      }

      // Create LLM service configuration
      const config: LLMServiceConfig = {
        provider: params.provider,
        model: params.model,
        temperature: params.options?.temperature,
        maxTokens: params.options?.maxTokens,
      };

      // Create GenerateResponseParams for the factory
      const factoryParams: GenerateResponseParams = {
        systemPrompt: params.systemPrompt,
        userMessage: pipeline.processedUserMessage,
        config,
        options: {
          temperature: params.options?.temperature,
          maxTokens: params.options?.maxTokens,
          callerType: params.options?.callerType,
          callerName: params.options?.callerName,
          dataClassification: params.options?.dataClassification,
          authToken: params.options?.authToken,
          currentUser: params.options?.currentUser,
          conversationId: params.options?.conversationId,
          sessionId: params.options?.sessionId,
          userId: params.options?.userId,
          piiMetadata: pipeline.piiMetadata,
          dictionaryMappings: pipeline.dictionaryMappings,
          routingDecision: params.options?.routingDecision,
          executionContext,
        },
      };

      // Use the LLMServiceFactory to generate the response
      const response = await this.llmServiceFactory.generateResponse(
        config,
        factoryParams,
      );

      // === after ===
      const restored = await this.piiBoundary.restore(
        response,
        pipeline,
        params.provider,
      );

      // Return either string or full response based on includeMetadata flag
      return params.options?.includeMetadata ? restored : restored.content;
    } catch (error) {
      // Standardized error handling
      try {
        const mapped = LLMErrorMapper.fromGenericError(
          error,
          params.provider,
          params.model,
        );
        LLMErrorMonitor.recordError(mapped);
        this.logger.error(
          `[UNIFIED-LLM] Standardized error`,
          mapped.getTechnicalDetails(),
        );
        throw mapped;
      } catch {
        const fallback = new LLMError(
          `Unified LLM service error: ${error instanceof Error ? error.message : String(error)}`,
          LLMErrorType.UNKNOWN,
          params.provider,
          { model: params.model, originalError: error },
        );
        LLMErrorMonitor.recordError(fallback);
        this.logger.error(
          `[UNIFIED-LLM] Fallback error`,
          fallback.getTechnicalDetails(),
        );
        throw fallback;
      }
    }
  }

  /**
   * Enhanced LLM call with conversation history support.
   *
   * Uses the LLMServiceFactory (planes LLM abstraction) — no LangChain dependency.
   *
   * @param executionContext - ExecutionContext (REQUIRED)
   * @param systemPrompt - System prompt for the LLM
   * @param conversationHistory - Array of conversation messages
   * @param currentMessage - Current user message
   * @returns Promise<string>
   */
  async generateResponseWithHistory(
    executionContext: ExecutionContext,
    systemPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    currentMessage: string,
  ): Promise<string> {
    if (!executionContext) {
      throw new Error(
        'ExecutionContext is required for generateResponseWithHistory',
      );
    }

    const providerName = executionContext.provider;
    const modelName = executionContext.model;

    if (!providerName || !modelName) {
      throw new Error(
        'ExecutionContext must contain provider and model. These are required fields.',
      );
    }

    // Build a single combined message from conversation history for providers
    // that don't natively support multi-turn via factory (the factory handles
    // the actual multi-turn formatting internally).
    const historyText = conversationHistory
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n');

    const combinedUserMessage = historyText
      ? `${historyText}\nUser: ${currentMessage}`
      : currentMessage;

    try {
      const config: LLMServiceConfig = {
        provider: providerName,
        model: modelName,
        temperature: 0.7,
        maxTokens: 2000,
      };

      const factoryParams: GenerateResponseParams = {
        systemPrompt,
        userMessage: combinedUserMessage,
        config,
        options: {
          callerType: 'service',
          callerName: 'llm-generation-service-history',
          executionContext,
        },
      };

      const result = await this.llmServiceFactory.generateResponse(
        config,
        factoryParams,
      );

      return (
        result.content ||
        'I apologize, but I was unable to generate a response.'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`LLM service error: ${errorMessage}`);
    }
  }

  /**
   * Generate response for system operations using optimized configurations
   *
   * @param executionContext - ExecutionContext (REQUIRED)
   * @param operationType - Type of system operation
   * @param systemPrompt - System prompt for the LLM
   * @param userMessage - User message to process
   * @returns Promise<string>
   */
  async generateSystemResponse(
    executionContext: ExecutionContext,
    operationType: SystemOperationType,
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    if (!executionContext) {
      throw new Error(
        'ExecutionContext is required for generateSystemResponse',
      );
    }

    try {
      // Resolve configuration from environment defaults
      const selectedDefault = this.modelConfigurationService.isGlobal()
        ? this.modelConfigurationService.getGlobalDefault()
        : this.modelConfigurationService.getEnvironmentDefault(
            this.resolveEnvironment(),
          );

      const config: LLMServiceConfig = {
        provider: selectedDefault.provider,
        model: selectedDefault.model,
        temperature: selectedDefault.parameters?.temperature as
          | number
          | undefined,
        maxTokens: selectedDefault.parameters?.maxTokens as number | undefined,
      };

      const factoryParams: GenerateResponseParams = {
        systemPrompt,
        userMessage,
        config,
        options: {
          callerType: 'service',
          callerName: `system-${operationType}`,
          executionContext,
        },
      };

      const result = await this.llmServiceFactory.generateResponse(
        config,
        factoryParams,
      );

      return (
        result.content ||
        'I apologize, but I was unable to generate a system response.'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`System LLM operation error: ${errorMessage}`);
    }
  }

  /**
   * Generate response for user content using their preferences
   *
   * @param executionContext - ExecutionContext (REQUIRED)
   * @param systemPrompt - System prompt for the LLM
   * @param userMessage - User message to process
   * @param userPreferences - User LLM preferences
   * @param authToken - Optional auth token
   * @param sessionId - Optional session ID
   * @returns Promise with content, usage, cost calculation, and metadata
   */
  async generateUserContentResponse(
    executionContext: ExecutionContext,
    systemPrompt: string,
    userMessage: string,
    userPreferences: UserLLMPreferences,
    authToken?: string,
    sessionId?: string,
  ): Promise<{
    content: string;
    usage: LLMUsageMetrics;
    costCalculation: CostCalculation;
    langsmithRunId?: string;
    processedPrompt: string;
    cidafmState?: Record<string, unknown>;
    llmMetadata?: {
      providerName: string;
      modelName: string;
      temperature?: number;
      maxTokens?: number;
      responseTimeMs?: number;
    };
  }> {
    if (!executionContext) {
      throw new Error(
        'ExecutionContext is required for generateUserContentResponse',
      );
    }

    // Validate user preferences
    if (!userPreferences.providerName) {
      throw new Error('User preferences must include a valid providerName');
    }
    if (!userPreferences.modelName) {
      throw new Error('User preferences must include a valid modelName');
    }

    try {
      // Use the unified response method
      const result = await this.generateUnifiedResponse(executionContext, {
        provider: userPreferences.providerName,
        model: userPreferences.modelName,
        systemPrompt,
        userMessage,
        options: {
          temperature: userPreferences.temperature,
          maxTokens: userPreferences.maxTokens,
          sessionId: sessionId,
          userId: authToken || 'user',
          includeMetadata: true,
          executionContext,
        },
      });

      // Convert the LLMResponse to the expected format
      if (typeof result === 'string') {
        throw new Error('Expected rich metadata from unified response');
      }

      return {
        content: result.content,
        usage: {
          provider: result.metadata.provider,
          model: result.metadata.model,
          inputTokens: result.metadata.usage.inputTokens,
          outputTokens: result.metadata.usage.outputTokens,
          totalTokens: result.metadata.usage.totalTokens,
          cost: result.metadata.usage.cost || 0,
          currency: 'USD',
          responseTimeMs: result.metadata.timing.duration,
          timestamp: result.metadata.timestamp,
          userId: authToken || 'user',
          sessionId: sessionId,
          callerType: 'user',
          callerName: 'user-content-response',
        } as LLMUsageMetrics,
        costCalculation: {
          inputTokens: result.metadata.usage.inputTokens,
          outputTokens: result.metadata.usage.outputTokens,
          inputCost: 0,
          outputCost: 0,
          totalCost: result.metadata.usage.cost || 0,
          currency: 'USD',
        } as CostCalculation,
        langsmithRunId: result.metadata.langsmithRunId,
        processedPrompt: userMessage,
        cidafmState: undefined,
        llmMetadata: {
          providerName: result.metadata.provider,
          modelName: result.metadata.model,
          temperature: userPreferences.temperature,
          maxTokens: userPreferences.maxTokens,
          responseTimeMs: result.metadata.timing.duration,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`User content LLM error: ${errorMessage}`);
    }
  }

  /**
   * Resolve environment name explicitly for configuration defaults
   */
  private resolveEnvironment(): EnvironmentName {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'production' || env === 'staging' || env === 'development') {
      return env as EnvironmentName;
    }
    throw new Error(
      `Invalid NODE_ENV '${process.env.NODE_ENV}'. Expected one of 'development', 'staging', 'production'.`,
    );
  }

  /**
   * Defense-in-depth validation for sovereign mode.
   * When sovereignMode is active in the ExecutionContext, only local providers (Ollama) are allowed.
   *
   * @param context - The execution context containing provider and sovereignMode flag
   * @throws ForbiddenException if a non-local provider is used in sovereign mode
   */
  private validateSovereignModeProvider(context: ExecutionContext): void {
    const sovereignMode = context.sovereignMode;
    const provider = context.provider?.toLowerCase();

    // If sovereign mode is not active, allow any provider
    if (!sovereignMode) {
      return;
    }

    // In sovereign mode, only Ollama (local) provider is allowed
    if (provider && provider !== 'ollama') {
      this.logger.warn(
        `Sovereign mode violation in LLM Generation Service: Provider "${provider}" is not allowed. ` +
          `Only local providers (ollama) are permitted when sovereignMode is active.`,
      );
      throw new ForbiddenException(
        `Sovereign mode is active. Provider "${provider}" is not allowed. ` +
          `Only local providers (ollama) are permitted.`,
      );
    }
  }
}
