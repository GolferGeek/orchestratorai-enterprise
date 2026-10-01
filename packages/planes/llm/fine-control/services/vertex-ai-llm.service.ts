import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { BaseLLMService } from './base-llm.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { LLMPricingService } from '../llm-pricing.service';
import type { VertexAI as VertexAIClient } from '@google-cloud/vertexai';
import type {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  ResponseMetadata,
  ImageGenerationParams,
  ImageGenerationResponse,
} from './llm-interfaces';

/**
 * Vertex AI as a backend — a peer of openai/anthropic/google/grok/ollama/
 * openrouter, selected per request by `ExecutionContext.provider`.
 *
 * Ported from the `vertex_ai` provider plane. As a plane it sat beside the
 * before/after layer rather than beneath it, so it carried its own usage
 * recording, cost guesses, metadata and observability, and received no PII
 * protection whatsoever — selecting it disabled the boundary for every call.
 *
 * Note this is Google Cloud, which is a different service from Google's public
 * Gemini API (the `google` backend) even though both serve Gemini models. That
 * distinction is exactly why routing is recorded rather than inferred from a
 * model id: `gemini-2.0-flash` is reachable both ways and the id cannot tell
 * you which one was used or billed.
 *
 * See docs/architecture/llm-boundary.md.
 */
@Injectable()
export class VertexAIBackendService extends BaseLLMService {
  private vertexAI?: VertexAIClient;

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
    const requestId = this.generateRequestId('vertex');

    try {
      this.validateConfig(params.config);

      const piiMetadata = params.options?.piiMetadata ?? null;
      const vertexAI = await this.getVertexAI();
      const model = vertexAI.getGenerativeModel({
        model: params.config.model,
      });

      // The SDK sets role 'system' on systemInstruction itself; it is spelled
      // out here because its Content type requires a role.
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: params.userMessage }] }],
        systemInstruction: {
          role: 'system',
          parts: [{ text: params.systemPrompt }],
        },
      });

      const result = response.response;
      const content =
        result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      const usage = result?.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const outputTokens = usage?.candidatesTokenCount ?? 0;
      const endTime = Date.now();

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
          totalTokens: usage?.totalTokenCount ?? inputTokens + outputTokens,
          cost,
        },
        timing: { startTime, endTime, duration: endTime - startTime },
        tier: 'external',
        status: 'completed',
      };

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
      this.handleError(error, 'VertexAIBackendService.generateResponse');
    }
  }

  /**
   * Imagen is not reachable through @google-cloud/vertexai: the SDK's
   * `preview` namespace exposes only generative (Gemini) models, and there is
   * no image model in it. The previous implementation called a
   * `preview.getImageGenerationModel` that the SDK does not have, so every
   * call failed with a TypeError. Until Imagen is wired through an API that
   * actually serves it, say so plainly.
   */
  async generateImage(
    _context: ExecutionContext,
    _params: ImageGenerationParams,
  ): Promise<ImageGenerationResponse> {
    this.handleError(
      new Error(
        'Vertex AI image generation is not implemented: @google-cloud/vertexai ' +
          'has no Imagen client. Use another image provider.',
      ),
      'VertexAIBackendService.generateImage',
    );
  }

  /**
   * The SDK is loaded lazily so a deployment that never selects Vertex does
   * not load it.
   */
  private async getVertexAI(): Promise<VertexAIClient> {
    if (this.vertexAI) {
      return this.vertexAI;
    }

    const project = process.env.GCP_PROJECT_ID;
    if (!project) {
      throw new Error(
        'GCP_PROJECT_ID is required to call the vertex_ai backend.',
      );
    }

    const { VertexAI } = await import('@google-cloud/vertexai');

    this.vertexAI = new VertexAI({
      project,
      location: process.env.GCP_REGION || 'us-central1',
    });
    return this.vertexAI;
  }
}
