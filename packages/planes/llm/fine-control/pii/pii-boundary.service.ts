import { Injectable, Logger } from '@nestjs/common';
import { PIIService } from './pii.service';
import { DictionaryPseudonymizerService } from './dictionary-pseudonymizer.service';
import type { DictionaryPseudonymMapping } from './dictionary-pseudonymizer.service';
import { PatternRedactionService } from './pattern-redaction.service';
import type { PatternRedactionMapping } from './pattern-redaction.service';
import type {
  PIIProcessingMetadata,
  PIIMatch,
} from '../types/pii-metadata.types';
import type {
  LLMResponse,
  PrivacySummary,
} from '../services/llm-interfaces';

/**
 * Providers that run inside our own infrastructure. Nothing leaves the
 * building for these, so the boundary has nothing to protect against and is
 * skipped wholesale.
 *
 * `ollama-cloud` is deliberately NOT here: it is Ollama's hosted service, so
 * it is every bit as external as OpenAI.
 */
const LOCAL_PROVIDERS = new Set(['ollama', 'ollama-local', 'ollama_local', 'lm-studio', 'lm_studio']);

/**
 * Everything the outbound half of the boundary pipeline produced, carried
 * across the provider call so the inbound half can undo it in reverse order.
 */
export interface BoundaryPipelineResult {
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
 * The LLM boundary PII pipeline.
 *
 * SECURITY CRITICAL. This is the single place that decides what a third-party
 * model is allowed to see. The order matters in both directions:
 *
 *   outbound:  pseudonymize -> pattern-redact -> provider
 *   inbound:   provider -> un-redact -> un-pseudonymize
 *
 * Redaction runs on already-pseudonymized text so a pattern can still catch
 * anything the dictionary missed, and reversal has to unwind the outer layer
 * first or the inner mappings no longer match.
 *
 * This service holds the logic; {@link PiiBoundaryLlmService} is what puts it
 * in front of every provider. Keeping the two separate is deliberate — the
 * policy lives here and does not care which vendor is on the other side.
 */
@Injectable()
export class PiiBoundaryService {
  private readonly logger = new Logger(PiiBoundaryService.name);

  constructor(
    private readonly piiService: PIIService,
    private readonly dictionaryPseudonymizerService: DictionaryPseudonymizerService,
    private readonly patternRedactionService: PatternRedactionService,
  ) {}

  /** Whether this provider runs inside our own infrastructure. */
  isLocalProvider(providerName: string): boolean {
    return LOCAL_PROVIDERS.has(providerName.toLowerCase());
  }

  /**
   * Outbound half of the boundary pipeline.
   *
   * Local providers (Ollama) and explicit `quick` calls bypass it entirely —
   * nothing leaves the building, so there is nothing to protect against.
   */
  async apply(params: {
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

    if (skip || this.isLocalProvider(providerName)) {
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
  async reverse(
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
  buildBlockedResponse(
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
   * The "after" half, in one call: undo the boundary and attach the badge
   * summary.
   *
   * Callers hand back whatever the backend returned. A backend may return a
   * bare string when the caller did not ask for metadata; that still has to be
   * un-pseudonymized or the user reads `PERSON_1` instead of a name.
   */
  async restore<T extends string | LLMResponse>(
    result: T,
    pipeline: BoundaryPipelineResult,
    providerName: string,
  ): Promise<T> {
    if (typeof result === 'string') {
      const { content } = await this.reverse(result, pipeline);
      return content as T;
    }

    const response: LLMResponse = result;
    const { content, reversed } = await this.reverse(
      response.content,
      pipeline,
    );
    response.content = content;

    if (pipeline.piiMetadata) {
      response.piiMetadata = pipeline.piiMetadata;
    }
    if (response.metadata) {
      response.metadata.privacy = this.buildPrivacySummary(
        pipeline,
        providerName,
        reversed,
      );
    }

    return response as T;
  }

  /**
   * Reduce the full PII record to the PII-safe summary the UI renders as
   * badges.
   *
   * SECURITY CRITICAL: the result is persisted on the assistant message row
   * and sent to the browser. Counts and data-type labels only — never an
   * original value, a pseudonym, or a redacted span.
   */
  buildPrivacySummary(
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
}
