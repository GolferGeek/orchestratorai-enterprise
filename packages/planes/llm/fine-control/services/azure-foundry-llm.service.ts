import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { BaseLLMService } from './base-llm.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { LLMPricingService } from '../llm-pricing.service';
import type { ModelClient, isUnexpected } from '@azure-rest/ai-inference';
import type {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  ResponseMetadata,
} from './llm-interfaces';

interface AzureFoundryClient {
  client: ModelClient;
  isUnexpected: typeof isUnexpected;
}

/**
 * Azure AI Foundry as a backend — a peer of openai/anthropic/google/grok/
 * ollama/openrouter, selected per request by `ExecutionContext.provider`.
 *
 * Ported from the `azure_foundry` provider plane, which was a parallel stack
 * beside the before/after layer rather than a backend beneath it. As a plane it
 * had to carry its own usage recording, cost estimation, metadata and
 * observability — and got no PII protection at all, because the boundary lives
 * above the factory and the plane sat next to it.
 *
 * Here it implements one method. Pseudonymization, redaction, the policy
 * refusal, usage, cost and metadata all come from above and from
 * BaseLLMService.
 *
 * See docs/architecture/llm-boundary.md.
 */
@Injectable()
export class AzureFoundryBackendService extends BaseLLMService {
  private client?: AzureFoundryClient;

  constructor(
    config: LLMServiceConfig,
    piiService: PIIService,
    dictionaryPseudonymizerService: DictionaryPseudonymizerService,
    runMetadataService: RunMetadataService,
    providerConfigService: ProviderConfigService,
    llmPricingService?: LLMPricingService,
  ) {
    super(
      config,
      piiService,
      dictionaryPseudonymizerService,
      runMetadataService,
      providerConfigService,
      llmPricingService,
    );
  }

  /**
   * The simple call. The message arriving here is already pseudonymized and
   * redacted; the reply is restored above.
   */
  async generateResponse(
    context: ExecutionContext,
    params: GenerateResponseParams,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId('azure');

    try {
      this.validateConfig(params.config);

      const piiMetadata = params.options?.piiMetadata ?? null;
      const { client, isUnexpected } = await this.getClient();

      // Azure AI Foundry addresses the deployment by name, which is what the
      // model field carries here.
      const response = await client.path('/chat/completions').post({
        body: {
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userMessage },
          ],
          model: params.config.model,
          temperature:
            params.options?.temperature ?? params.config.temperature ?? 0.7,
          max_tokens: params.options?.maxTokens ?? params.config.maxTokens,
        },
      });

      if (isUnexpected(response)) {
        throw new Error(
          `Azure AI Foundry error: ${response.body?.error?.message ?? 'unknown'}`,
        );
      }

      const body = response.body;

      const content = body.choices[0]?.message?.content ?? '';
      const inputTokens = body.usage?.prompt_tokens ?? 0;
      const outputTokens = body.usage?.completion_tokens ?? 0;
      const endTime = Date.now();

      // Cost comes from the shared pricing table rather than the hand-rolled
      // per-token guess the plane version carried.
      const cost = this.calculateCost(
        params.config.provider,
        params.config.model,
        inputTokens,
        outputTokens,
      );

      const metadata: ResponseMetadata = {
        provider: params.config.provider,
        model: params.config.model,
        requestId,
        timestamp: new Date(endTime).toISOString(),
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: body.usage?.total_tokens ?? inputTokens + outputTokens,
          cost,
        },
        timing: { startTime, endTime, duration: endTime - startTime },
        tier: 'external',
        status: 'completed',
      };

      // Inherited — this is what writes the llm_usage row, privacy columns
      // included.
      await this.trackUsage(
        context,
        params.config.provider,
        params.config.model,
        inputTokens,
        outputTokens,
        cost,
        {
          requestId,
          callerType: params.options?.callerType,
          callerName: params.options?.callerName,
          piiMetadata: (piiMetadata ?? undefined) as unknown as
            | Record<string, unknown>
            | undefined,
          startTime,
          endTime,
        },
      );

      const llmResponse: LLMResponse = {
        content,
        metadata,
        piiMetadata: piiMetadata ?? undefined,
      };

      this.logRequestResponse(params, llmResponse, metadata.timing.duration);

      return llmResponse;
    } catch (error) {
      this.handleError(error, 'AzureFoundryBackendService.generateResponse');
    }
  }

  /**
   * The SDK is loaded lazily so a deployment that never selects Azure does
   * not load it.
   */
  private async getClient(): Promise<AzureFoundryClient> {
    if (this.client) {
      return this.client;
    }

    const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
    const key = process.env.AZURE_AI_FOUNDRY_KEY;

    if (!endpoint) {
      throw new Error(
        'AZURE_AI_FOUNDRY_ENDPOINT is required to call the azure_foundry backend.',
      );
    }
    if (!key) {
      throw new Error(
        'AZURE_AI_FOUNDRY_KEY is required to call the azure_foundry backend.',
      );
    }

    const { default: createClient, isUnexpected } = await import(
      '@azure-rest/ai-inference'
    );
    const { AzureKeyCredential } = await import('@azure/core-auth');

    this.client = {
      client: createClient(endpoint, new AzureKeyCredential(key)),
      isUnexpected,
    };
    return this.client;
  }
}
