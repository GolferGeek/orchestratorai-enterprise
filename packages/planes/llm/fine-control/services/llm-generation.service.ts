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
  provider?: 'openai' | 'anthropic' | 'ollama' | 'google';
  cidafmOptions?: CIDAFMOptions;
  complexity?: 'simple' | 'medium' | 'complex' | 'reasoning';
  images?: Array<{ base64: string; mimeType: string }>;
};

/**
 * Everything the outbound half of the boundary pipeline produced, carried
 * across the provider call so the inbound half can undo it in reverse order.
 */
interface BoundaryPipelineResult {
  /** What actually gets sent to the provider. */
  processedUserMessage: string;
  /** Dictionary pseudonyms applied in step 1. */
  dictionaryMappings: DictionaryPseudonymMapping[];
  /** Pattern redactions applied in step 2. */
  patternRedactionMappings: PatternRedactionMapping[];
  /** Full detection + processing record. Stays server-side. */
  piiMetadata?: PIIProcessingMetadata;
  /** False when the pipeline was bypassed (local provider or quick call). */
  applied: boolean;
  /**
   * Policy refused this request — showstopper PII such as an SSN or a credit
   * card number. The provider must NOT be called. Showstoppers are excluded
   * from pattern redaction precisely because they are supposed to stop the
   * request rather than be quietly masked, so proceeding would send them in
   * the clear.
   */
  blocked: boolean;
  blockingReason?: string;
}

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
  ) {}

  // =====================================
  // LLM BOUNDARY PII PIPELINE
  // =====================================
  //
  // SECURITY CRITICAL. Every external provider call goes out through
  // `applyBoundaryPipeline` and comes back through `reverseBoundaryPipeline`.
  // The order matters in both directions:
  //
  //   outbound:  pseudonymize -> pattern-redact -> provider
  //   inbound:   provider -> un-redact -> un-pseudonymize
  //
  // Redaction runs on already-pseudonymized text so a pattern can still catch
  // anything the dictionary missed, and reversal has to unwind the outer layer
  // first or the inner mappings no longer match.
  //
  // Both `generateResponse` and `generateUnifiedResponse` call these helpers
  // rather than inlining the steps; the two paths previously drifted apart and
  // the unified path silently lost its redaction stage.

  /**
   * Outbound half of the boundary pipeline.
   *
   * Local providers (Ollama) and explicit `quick` calls bypass it entirely —
   * nothing leaves the building, so there is nothing to protect against.
   */
  private async applyBoundaryPipeline(params: {
    userMessage: string;
    providerName: string;
    organizationSlug?: string | null;
    agentSlug?: string | null;
    requestId: string;
    existingMetadata?: PIIProcessingMetadata | null;
    skip?: boolean;
  }): Promise<BoundaryPipelineResult> {
    const {
      userMessage,
      providerName,
      organizationSlug = null,
      agentSlug = null,
      requestId,
      existingMetadata,
      skip = false,
    } = params;

    const isLocalProvider = providerName.toLowerCase() === 'ollama';

    if (skip || isLocalProvider) {
      return {
        processedUserMessage: userMessage,
        dictionaryMappings: [],
        patternRedactionMappings: [],
        piiMetadata: existingMetadata ?? undefined,
        applied: false,
        blocked: false,
      };
    }

    // --- Step 1: dictionary pseudonymization -------------------------------
    const pseudonymResult =
      await this.dictionaryPseudonymizerService.pseudonymizeText(userMessage, {
        organizationSlug,
        agentSlug,
      });
    let processedUserMessage = pseudonymResult.pseudonymizedText;

    // --- Step 2: pattern redaction, on the pseudonymized text --------------
    // Showstoppers are excluded: those block the request outright rather than
    // being quietly redacted, which is PIIService's call to make.
    const patternRedactionResult =
      await this.patternRedactionService.redactPatterns(processedUserMessage, {
        minConfidence: 0.8,
        maxMatches: 100,
        excludeShowstoppers: true,
      });
    processedUserMessage = patternRedactionResult.redactedText;

    // --- Metadata --------------------------------------------------------
    // Callers that already ran detection pass their metadata in; otherwise we
    // run the policy check here so the record is complete either way.
    const baseMetadata: PIIProcessingMetadata =
      existingMetadata ??
      (
        await this.piiService.checkPolicy(userMessage, {
          provider: providerName,
          providerName,
        })
      ).metadata;

    const dictionaryMatches: PIIMatch[] = pseudonymResult.mappings.map((m) => ({
      value: m.originalValue,
      dataType: m.dataType,
      severity: 'warning',
      confidence: 1.0,
      startIndex: -1,
      endIndex: -1,
      pattern: 'dictionary_match',
      pseudonym: m.pseudonym,
    })) as PIIMatch[];

    const pseudonymCount = pseudonymResult.mappings.length;
    const redactionCount = patternRedactionResult.redactionCount;

    const piiMetadata: PIIProcessingMetadata = {
      ...baseMetadata,
      flaggings:
        baseMetadata.detectionResults?.flaggedMatches ||
        baseMetadata.flaggings ||
        [],
      pseudonymsApplied: [
        ...(baseMetadata.pseudonymsApplied || []),
        ...pseudonymResult.mappings.map((m) => ({
          original: m.originalValue,
          pseudonym: m.pseudonym,
          type: m.dataType,
        })),
      ],
      pseudonymInstructions: {
        shouldPseudonymize: pseudonymCount > 0,
        targetMatches: [
          ...((baseMetadata.pseudonymInstructions?.targetMatches as PIIMatch[]) ||
            []),
          ...dictionaryMatches,
        ],
        requestId: baseMetadata.pseudonymInstructions?.requestId || requestId,
        context: baseMetadata.pseudonymInstructions?.context || 'llm-boundary',
      },
      pseudonymResults: {
        applied: pseudonymCount > 0,
        processedMatches: [
          ...((baseMetadata.pseudonymResults?.processedMatches as PIIMatch[]) ||
            []),
          ...dictionaryMatches,
        ],
        mappingsCount:
          (baseMetadata.pseudonymResults?.mappingsCount || 0) + pseudonymCount,
        processingTimeMs:
          (baseMetadata.pseudonymResults?.processingTimeMs || 0) +
          pseudonymResult.processingTimeMs,
        reversalSuccess: baseMetadata.pseudonymResults?.reversalSuccess,
        reversalMatches: baseMetadata.pseudonymResults?.reversalMatches,
      },
      // Computed rather than hardcoded true: a clean message that ran through
      // the pipeline and matched nothing must not light up the privacy badges.
      piiDetected:
        Boolean(baseMetadata.piiDetected) ||
        pseudonymCount > 0 ||
        redactionCount > 0,
      sanitizationLevel:
        pseudonymCount > 0 || redactionCount > 0
          ? 'standard'
          : baseMetadata.sanitizationLevel || 'none',
      patternRedactionsApplied: patternRedactionResult.mappings.map((m) => ({
        original: m.originalValue,
        redacted: m.redactedValue,
        dataType: m.dataType,
      })),
      patternRedactionMappings: patternRedactionResult.mappings,
      patternRedactionResults: {
        applied: redactionCount > 0,
        redactionCount,
        processingTimeMs: patternRedactionResult.processingTimeMs,
      },
    };

    return {
      processedUserMessage,
      dictionaryMappings: pseudonymResult.mappings,
      patternRedactionMappings: patternRedactionResult.mappings,
      piiMetadata,
      applied: true,
      blocked: piiMetadata.policyDecision?.blocked === true,
      blockingReason: piiMetadata.policyDecision?.blockingReason,
    };
  }

  /**
   * Inbound half of the boundary pipeline: undo step 2, then step 1.
   *
   * Mutates `pipeline.piiMetadata` with the reversal outcome so the admin
   * views and the privacy summary can report whether restoration succeeded.
   */
  private async reverseBoundaryPipeline(
    content: string,
    pipeline: BoundaryPipelineResult,
  ): Promise<{ content: string; reversed: boolean }> {
    if (!content) {
      return { content, reversed: false };
    }

    let reversedContent = content;
    let reversed = false;

    // Step 1: pattern redactions — the outer layer, so it comes off first.
    if (pipeline.patternRedactionMappings.length > 0) {
      const patternReverseResult =
        await this.patternRedactionService.reverseRedactions(
          reversedContent,
          pipeline.patternRedactionMappings,
        );
      reversedContent = patternReverseResult.originalText;
      reversed = true;

      if (pipeline.piiMetadata?.patternRedactionResults) {
        pipeline.piiMetadata.patternRedactionResults.reversalSuccess = true;
        pipeline.piiMetadata.patternRedactionResults.reversalCount =
          patternReverseResult.reversalCount;
      }
    }

    // Step 2: dictionary pseudonyms — the inner layer.
    if (pipeline.dictionaryMappings.length > 0) {
      const pseudonymReverseResult =
        await this.dictionaryPseudonymizerService.reversePseudonyms(
          reversedContent,
          pipeline.dictionaryMappings,
        );
      reversedContent = pseudonymReverseResult.originalText;
      reversed = true;

      if (pipeline.piiMetadata?.pseudonymResults) {
        pipeline.piiMetadata.pseudonymResults.reversalSuccess = true;
        pipeline.piiMetadata.pseudonymResults.reversalMatches =
          pipeline.piiMetadata.pseudonymInstructions?.targetMatches;
      }
    }

    return { content: reversedContent, reversed };
  }

  /**
   * Build the response for a request policy refused, without calling any
   * provider.
   *
   * This is a policy outcome, not an error path: the caller asked for
   * something we will not send, and the user needs to be told why in plain
   * language. PIIService composes that wording; we do not invent one here.
   */
  private buildBlockedResponse(
    pipeline: BoundaryPipelineResult,
    providerName: string,
    modelName: string,
  ): LLMResponse {
    const now = Date.now();
    const message =
      pipeline.piiMetadata?.userMessage?.summary ??
      'This message contains information that cannot be sent to a language model.';

    this.logger.warn(
      `[PII-BOUNDARY] Request blocked before provider call: ${pipeline.blockingReason ?? 'policy-violation'}`,
    );

    return {
      content: message,
      metadata: {
        provider: providerName,
        model: modelName,
        requestId: `blocked-${now}-${Math.random().toString(36).slice(2, 11)}`,
        timestamp: new Date(now).toISOString(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
        timing: { startTime: now, endTime: now, duration: 0 },
        status: 'error',
        errorMessage: `Blocked by PII policy: ${pipeline.blockingReason ?? 'policy-violation'}`,
        privacy: this.buildPrivacySummary(pipeline, providerName, false),
      },
      piiMetadata: pipeline.piiMetadata,
      error: {
        code: 'PII_POLICY_BLOCKED',
        message,
        details: { reason: pipeline.blockingReason ?? 'policy-violation' },
      },
    };
  }

  /**
   * Reduce the full PII record to the PII-safe summary the UI renders as
   * badges.
   *
   * SECURITY CRITICAL: the result is persisted on the assistant message row
   * and sent to the browser. Counts and data-type labels only — never an
   * original value, a pseudonym, or a redacted span.
   */
  private buildPrivacySummary(
    pipeline: BoundaryPipelineResult,
    providerName: string,
    reversed: boolean,
  ): PrivacySummary {
    const routing: PrivacySummary['routing'] =
      providerName.toLowerCase() === 'ollama' ? 'local' : 'external';
    const metadata = pipeline.piiMetadata;

    if (!metadata) {
      return {
        piiDetected: false,
        flaggedCount: 0,
        pseudonymCount: 0,
        redactionCount: 0,
        dataTypes: [],
        status: 'none',
        routing,
        reversed: false,
      };
    }

    const pseudonymCount = metadata.pseudonymResults?.mappingsCount ?? 0;
    const redactionCount =
      metadata.patternRedactionResults?.redactionCount ?? 0;
    const flaggedMatches = metadata.detectionResults?.flaggedMatches ?? [];
    const blocked = metadata.policyDecision?.blocked === true;

    const dataTypes = new Set<string>();
    for (const match of flaggedMatches) {
      if (match?.dataType) dataTypes.add(match.dataType);
    }
    for (const applied of metadata.pseudonymsApplied ?? []) {
      if (applied?.type) dataTypes.add(applied.type);
    }
    for (const applied of metadata.patternRedactionsApplied ?? []) {
      if (applied?.dataType) dataTypes.add(applied.dataType);
    }

    let status: PrivacySummary['status'] = 'none';
    if (blocked) {
      status = 'blocked';
    } else if (pseudonymCount > 0 || redactionCount > 0) {
      status = 'applied';
    }

    return {
      piiDetected: Boolean(metadata.piiDetected),
      flaggedCount: flaggedMatches.length,
      pseudonymCount,
      redactionCount,
      dataTypes: Array.from(dataTypes).sort(),
      status,
      routing,
      reversed,
    };
  }

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
      // === LLM BOUNDARY PII PIPELINE (outbound) ===
      // pseudonymize -> pattern-redact -> provider. Bypassed for local
      // providers and `quick` calls; see applyBoundaryPipeline.
      const pipeline = await this.applyBoundaryPipeline({
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

      // Policy refusal short-circuits the provider call entirely.
      if (pipeline.blocked) {
        return this.buildBlockedResponse(pipeline, providerName, modelName);
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

      // === LLM BOUNDARY PII PIPELINE (inbound) ===
      const { content: reversedContent, reversed } =
        await this.reverseBoundaryPipeline(unifiedResult.content, pipeline);
      unifiedResult.content = reversedContent;

      if (pipeline.piiMetadata) {
        unifiedResult.piiMetadata = pipeline.piiMetadata;
      }

      // PII-safe summary for the UI badges; rides on metadata, which callers
      // persist and return to the browser.
      unifiedResult.metadata.privacy = this.buildPrivacySummary(
        pipeline,
        providerName,
        reversed,
      );

      return unifiedResult;
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
    ];
    if (!supportedProviders.includes(params.provider.toLowerCase())) {
      throw new Error(
        `Unsupported provider: ${params.provider}. Supported providers: ${supportedProviders.join(', ')}`,
      );
    }

    try {
      // === LLM BOUNDARY PII PIPELINE (outbound) ===
      // Identical to generateResponse: pseudonymize -> pattern-redact ->
      // provider. This path used to pseudonymize only, so anything the
      // dictionary did not cover reached the provider unredacted.
      const pipeline = await this.applyBoundaryPipeline({
        userMessage: params.userMessage,
        providerName: params.provider,
        organizationSlug: executionContext.orgSlug ?? null,
        agentSlug: executionContext.agentSlug ?? null,
        requestId:
          params.options?.conversationId ||
          params.options?.sessionId ||
          `pii-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        existingMetadata: params.options?.piiMetadata ?? null,
      });

      // Policy refusal short-circuits the provider call entirely.
      if (pipeline.blocked) {
        const blocked = this.buildBlockedResponse(
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

      // === LLM BOUNDARY PII PIPELINE (inbound) ===
      const { content: reversedContent, reversed } =
        await this.reverseBoundaryPipeline(response.content, pipeline);
      response.content = reversedContent;

      if (pipeline.piiMetadata) {
        response.piiMetadata = pipeline.piiMetadata;
      }

      // PII-safe summary for the UI badges.
      response.metadata.privacy = this.buildPrivacySummary(
        pipeline,
        params.provider,
        reversed,
      );

      // Return either string or full response based on includeMetadata flag
      return params.options?.includeMetadata ? response : response.content;
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
