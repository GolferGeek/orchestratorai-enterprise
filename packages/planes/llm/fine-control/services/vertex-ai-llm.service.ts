import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { BaseLLMService } from './base-llm.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { LLMPricingService } from '../llm-pricing.service';
import type {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  ResponseMetadata,
  ImageGenerationParams,
  ImageGenerationResponse,
} from './llm-interfaces';

interface VertexAIUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface VertexAIGenerativeModel {
  generateContent(request: Record<string, unknown>): Promise<{
    response?: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: VertexAIUsageMetadata;
    };
  }>;
}

interface ImageGenerationModel {
  generateImages(request: Record<string, unknown>): Promise<{
    images?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  }>;
}

interface VertexAIClient {
  getGenerativeModel(params: { model: string }): VertexAIGenerativeModel;
  preview: { getImageGenerationModel(model: string): ImageGenerationModel };
}

/** Imagen bills per image rather than per token. */
const IMAGEN_COST_PER_IMAGE_USD = 0.02;

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
      const model = this.getVertexAI().getGenerativeModel({
        model: params.config.model,
      });

      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: params.userMessage }] }],
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
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
   * Imagen, reached through LLMImageService the same way OpenAI and Google are.
   */
  async generateImage(
    context: ExecutionContext,
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId('vertex-img');
    const model = context.model || this.config.model;

    try {
      const imagen = this.getVertexAI().preview.getImageGenerationModel(model);
      const count = params.numberOfImages ?? 1;

      const result = await imagen.generateImages({
        prompt: params.prompt,
        numberOfImages: count,
        aspectRatio: this.sizeToAspectRatio(params.size),
      });

      const endTime = Date.now();
      const cost = count * IMAGEN_COST_PER_IMAGE_USD;

      await this.trackUsage(context, 'vertex_ai', model, 0, 0, cost, {
        requestId,
        startTime,
        endTime,
      });

      return {
        images: (result.images ?? []).map((image) => {
          const data = Buffer.from(image.bytesBase64Encoded ?? '', 'base64');
          return {
            data,
            metadata: {
              mimeType: image.mimeType ?? 'image/png',
              sizeBytes: data.byteLength,
            },
          };
        }),
        metadata: {
          provider: 'vertex_ai',
          model,
          requestId,
          timestamp: new Date(endTime).toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost },
          timing: { startTime, endTime, duration: endTime - startTime },
          status: 'completed',
        },
      };
    } catch (error) {
      this.handleError(error, 'VertexAIBackendService.generateImage');
    }
  }

  private sizeToAspectRatio(size?: string): string {
    switch (size) {
      case '1792x1024':
        return '16:9';
      case '1024x1792':
        return '9:16';
      default:
        return '1:1';
    }
  }

  /**
   * The SDK is required lazily so a deployment that never selects Vertex does
   * not need the package installed.
   */
  private getVertexAI(): VertexAIClient {
    if (this.vertexAI) {
      return this.vertexAI;
    }

    const project = process.env.GCP_PROJECT_ID;
    if (!project) {
      throw new Error(
        'GCP_PROJECT_ID is required to call the vertex_ai backend.',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VertexAI } = require('@google-cloud/vertexai') as {
      VertexAI: new (opts: {
        project: string;
        location: string;
      }) => VertexAIClient;
    };

    this.vertexAI = new VertexAI({
      project,
      location: process.env.GCP_REGION || 'us-central1',
    });
    return this.vertexAI;
  }
}
