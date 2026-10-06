import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { BaseLLMService } from './base-llm.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { LLMPricingService } from '../llm-pricing.service';
import {
  OpenRouterClient,
  type OpenRouterVideoJob,
} from '../../openrouter/openrouter.client';
import type {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  ResponseMetadata,
  ImageGenerationParams,
  ImageGenerationResponse,
  VideoGenerationParams,
  VideoGenerationResponse,
} from './llm-interfaces';

/**
 * OpenRouter as a backend — a peer of openai/anthropic/google/grok/ollama,
 * selected per request by `ExecutionContext.provider`.
 *
 * ARCHITECTURAL NOTE. This class is deliberately thin, and that is the point.
 * OpenRouter previously existed as `OpenRouterLLMService`, a whole parallel
 * plane sitting *beside* the before/after layer rather than beneath it. Being
 * a parallel stack, it had to reimplement everything the base already
 * provides — and its reimplementation diverged: PII was absent entirely, and
 * its usage recording wrote to observability events instead of `llm_usage`,
 * so no OpenRouter call has ever appeared in the LLM usage admin.
 *
 * As a backend it implements one method and inherits pseudonymization,
 * redaction, usage recording, cost, metadata and error handling from
 * everything above it. If this file ever starts growing privacy or accounting
 * logic, that is the signal it has been wired in at the wrong layer again.
 *
 * See docs/architecture/llm-boundary.md.
 */
@Injectable()
export class OpenRouterBackendService extends BaseLLMService {
  /** OpenRouter's API takes response_format json_object (see OpenRouterClient). */
  override readonly supportsJsonResponseFormat = true;

  constructor(
    config: LLMServiceConfig,
    piiService: PIIService,
    dictionaryPseudonymizerService: DictionaryPseudonymizerService,
    runMetadataService: RunMetadataService,
    providerConfigService: ProviderConfigService,
    private readonly client: OpenRouterClient,
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
   * redacted; the reply is un-redacted and un-pseudonymized above.
   */
  async generateResponse(
    context: ExecutionContext,
    params: GenerateResponseParams,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId('openrouter');

    try {
      this.validateConfig(params.config);
      this.client.assertConfigured();

      const piiMetadata = params.options?.piiMetadata ?? null;

      const result = await this.client.chatCompletion({
        model: params.config.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userMessage },
        ],
        sessionId: context.conversationId,
        temperature:
          params.options?.temperature ?? params.config.temperature ?? undefined,
        maxTokens: params.options?.maxTokens ?? params.config.maxTokens,
        ...(params.options?.responseFormat === 'json'
          ? { responseFormat: 'json' as const }
          : {}),
      });

      const endTime = Date.now();

      // OpenRouter reports real token counts and real cost, so prefer them
      // over the base class's estimates.
      const metadata: ResponseMetadata = {
        provider: params.config.provider,
        model: result.model || params.config.model,
        requestId,
        timestamp: new Date(endTime).toISOString(),
        usage: {
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          cost: result.cost ?? result.usage.cost,
        },
        timing: { startTime, endTime, duration: endTime - startTime },
        status: 'completed',
        providerSpecific: {
          requestedModel: params.config.model,
          resolvedModel: result.model,
          automaticRouting: params.config.model === 'openrouter/auto',
          openRouterRequestId: result.requestId,
        },
      };

      // Inherited from BaseLLMService — this is what puts the row in
      // llm_usage, including the privacy columns derived from piiMetadata.
      await this.trackUsage(
        context,
        params.config.provider,
        metadata.model,
        metadata.usage.inputTokens,
        metadata.usage.outputTokens,
        metadata.usage.cost,
        {
          requestId,
          callerType: params.options?.callerType,
          callerName: params.options?.callerName,
          piiMetadata: (piiMetadata ?? undefined) as unknown as
            Record<string, unknown> | undefined,
          startTime,
          endTime,
        },
      );

      const llmResponse: LLMResponse = {
        content: result.content,
        metadata,
        piiMetadata: piiMetadata ?? undefined,
      };

      this.logRequestResponse(params, llmResponse, metadata.timing.duration);

      return llmResponse;
    } catch (error) {
      this.handleError(error, 'OpenRouterBackendService.generateResponse');
    }
  }

  /**
   * Image generation, reached through LLMImageService the same way OpenAI and
   * Google are. Optional on the base: providers that cannot do it simply omit
   * the method, and LLMImageService reports that clearly.
   */
  async generateImage(
    context: ExecutionContext,
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId('openrouter-img');
    // Same convention as the OpenAI and Google backends: the model rides on
    // ExecutionContext, with the service config as the fallback.
    const model = context.model || this.config.model;

    try {
      this.client.assertConfigured();

      const result = await this.client.imageGeneration({
        model,
        prompt: params.prompt,
        size: params.size,
        quality: params.quality,
        numberOfImages: params.numberOfImages,
        referenceImageUrl: params.referenceImageUrl,
        background: params.background,
        outputFormat: params.outputFormat,
      });

      const endTime = Date.now();

      await this.trackUsage(
        context,
        'openrouter',
        model,
        result.usage.promptTokens,
        result.usage.completionTokens,
        result.cost ?? result.usage.cost,
        { requestId, startTime, endTime },
      );

      return {
        // The contract is raw bytes; OpenRouter hands back base64.
        images: result.images.map((image) => {
          const data = Buffer.from(image.base64, 'base64');
          return {
            data,
            metadata: {
              mimeType: image.mediaType,
              sizeBytes: data.byteLength,
            },
          };
        }),
        metadata: {
          provider: 'openrouter',
          model: result.model || model,
          requestId,
          timestamp: new Date(endTime).toISOString(),
          usage: {
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            cost: result.cost ?? result.usage.cost,
          },
          timing: { startTime, endTime, duration: endTime - startTime },
          status: 'completed',
        },
      };
    } catch (error) {
      this.handleError(error, 'OpenRouterBackendService.generateImage');
    }
  }

  /**
   * Video generation, reached through LLMVideoService like OpenAI's. OpenRouter
   * runs video as a job: this submits it, and pollVideoStatus follows it,
   * downloads the clip when it is done, and records its cost.
   */
  async generateVideo(
    context: ExecutionContext,
    params: VideoGenerationParams,
  ): Promise<VideoGenerationResponse> {
    const startTime = Date.now();
    const model = context.model || this.config.model;
    if (params.extendVideoUrl || params.styleImages?.length) {
      throw new Error(
        'OpenRouter video does not take a video to extend or style images',
      );
    }

    try {
      this.client.assertConfigured();
      const job = await this.client.submitVideo({
        model,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution === '4k' ? '4K' : params.resolution,
        firstFrameImageUrl: frameImage(
          params.firstFrameImageUrl,
          params.firstFrameImage,
        ),
        lastFrameImageUrl: frameImage(
          params.lastFrameImageUrl,
          params.lastFrameImage,
        ),
        generateAudio: params.generateAudio,
      });
      return this.videoResponse(job, model, startTime, Date.now());
    } catch (error) {
      this.handleError(error, 'OpenRouterBackendService.generateVideo');
    }
  }

  async pollVideoStatus(
    operationId: string,
    context: ExecutionContext,
  ): Promise<VideoGenerationResponse> {
    const startTime = Date.now();
    const model = context.model || this.config.model;

    try {
      const job = await this.client.pollVideo(operationId);
      if (job.status !== 'completed') {
        return this.videoResponse(job, model, startTime, Date.now());
      }
      const videoData = await this.client.downloadVideo(operationId);
      const endTime = Date.now();
      await this.trackUsage(context, 'openrouter', model, 0, 0, job.cost, {
        requestId: job.generationId ?? job.id,
        startTime,
        endTime,
      });
      return {
        ...this.videoResponse(job, model, startTime, endTime),
        videoData,
        videoMetadata: { mimeType: 'video/mp4', sizeBytes: videoData.length },
      };
    } catch (error) {
      this.handleError(error, 'OpenRouterBackendService.pollVideoStatus');
    }
  }

  private videoResponse(
    job: OpenRouterVideoJob,
    model: string,
    startTime: number,
    endTime: number,
  ): VideoGenerationResponse {
    const failed = ['failed', 'cancelled', 'expired'].includes(job.status);
    const status: VideoGenerationResponse['status'] =
      job.status === 'in_progress'
        ? 'processing'
        : failed
          ? 'failed'
          : job.status === 'completed'
            ? 'completed'
            : 'pending';
    return {
      operationId: job.id,
      status,
      metadata: {
        provider: 'openrouter',
        model,
        requestId: job.generationId ?? job.id,
        timestamp: new Date(endTime).toISOString(),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: job.cost,
        },
        timing: { startTime, endTime, duration: endTime - startTime },
        status: failed
          ? 'error'
          : status === 'completed'
            ? 'completed'
            : 'started',
      },
      ...(failed
        ? {
            error: {
              code: `OPENROUTER_VIDEO_${job.status.toUpperCase()}`,
              message: job.error ?? `OpenRouter video job ${job.status}`,
            },
          }
        : {}),
    };
  }
}

/** A start or end frame as OpenRouter takes it: a URL, or the image inline. */
function frameImage(
  url: string | undefined,
  data: Buffer | undefined,
): string | undefined {
  if (url && data)
    throw new Error('Give a frame image as a URL or as bytes, not both');
  if (url) return url;
  return data ? `data:image/png;base64,${data.toString('base64')}` : undefined;
}
