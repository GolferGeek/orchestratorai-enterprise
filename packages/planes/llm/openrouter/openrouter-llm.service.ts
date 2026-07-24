import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from '../../observability';
import type {
  ImageGenerationResponse,
  LLMRequestOptions,
  LLMResponse,
  ResponseMetadata,
  UnifiedGenerateResponseParams,
  VideoGenerationResponse,
} from '../fine-control/services/llm-interfaces';
import type {
  LLMModelInfo,
  LLMProviderInfo,
  LLMServiceProvider,
} from '../llm.interface';
import {
  OpenRouterClient,
  type OpenRouterMessageContent,
  type OpenRouterModelEntry,
  type OpenRouterUsage,
  type OpenRouterVideoJob,
} from './openrouter.client';

@Injectable()
export class OpenRouterLLMService implements LLMServiceProvider {
  private readonly logger = new Logger(OpenRouterLLMService.name);

  constructor(
    private readonly client: OpenRouterClient,
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
  ) {}

  assertConfigured(): void {
    this.client.assertConfigured();
  }

  async listModels(filters?: {
    modelType?: string;
    sovereignMode?: boolean;
  }): Promise<LLMModelInfo[]> {
    this.assertNonSovereign(filters?.sovereignMode);
    const models: LLMModelInfo[] = (await this.client.listModels()).map(
      (model) => {
      const outputModalities = model.architecture?.output_modalities ?? [];
      const modelType: LLMModelInfo['modelType'] = outputModalities.includes(
        'image',
      )
        ? 'image-generation'
        : model.id.includes('reasoning') || model.id.includes(':thinking')
          ? 'reasoning'
          : 'text-generation';
      return {
        id: model.id,
        name: model.name,
        providerName: this.providerFromModel(model.id),
        modelType,
        contextWindow: model.context_length,
        maxOutputTokens: model.top_provider?.max_completion_tokens,
        pricing: this.mapPricing(model.pricing),
        capabilities: [
          ...(model.architecture?.input_modalities ?? []).map(
            (modality) => `input:${modality}`,
          ),
          ...outputModalities.map((modality) => `output:${modality}`),
          ...(model.supported_parameters ?? []).map(
            (parameter) => `parameter:${parameter}`,
          ),
        ],
        isLocal: false,
      } satisfies LLMModelInfo;
      },
    );

    models.unshift({
      id: 'openrouter/auto',
      name: 'Use best model',
      providerName: 'openrouter',
      modelType: 'text-generation',
      capabilities: ['automatic-routing'],
      isLocal: false,
    });

    if (this.client.isVideoEnabled()) {
      const videoModels = (await this.client.listVideoModels()).map(
        (model) =>
          ({
            id: model.id,
            name: model.name,
            providerName: this.providerFromModel(model.id),
            modelType: 'video-generation',
            capabilities: [
              ...(model.supported_resolutions ?? []).map(
                (resolution) => `resolution:${resolution}`,
              ),
              ...(model.supported_aspect_ratios ?? []).map(
                (ratio) => `aspect-ratio:${ratio}`,
              ),
              ...(model.allowed_passthrough_parameters ?? []).map(
                (parameter) => `parameter:${parameter}`,
              ),
            ],
            isLocal: false,
          }) satisfies LLMModelInfo,
      );
      models.push(...videoModels);
    }

    return filters?.modelType
      ? models.filter((model) => model.modelType === filters.modelType)
      : models;
  }

  async listProviders(): Promise<LLMProviderInfo[]> {
    const providers = new Map<string, LLMProviderInfo>();
    for (const model of await this.listModels()) {
      if (!providers.has(model.providerName)) {
        providers.set(model.providerName, {
          name: model.providerName,
          displayName: this.formatProviderName(model.providerName),
          status: 'active',
        });
      }
    }
    return [...providers.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    options?: LLMRequestOptions & {
      images?: Array<{ base64: string; mimeType: string }>;
    },
  ): Promise<string | LLMResponse> {
    const context = options?.executionContext;
    if (!context) {
      throw new Error(
        'ExecutionContext is required for OpenRouter generateResponse',
      );
    }
    this.assertNonSovereign(context.sovereignMode);
    const requestedModel = this.resolveModel(context.provider, context.model);
    const userContent = this.buildUserContent(userMessage, options?.images);
    const startedAt = Date.now();

    await this.emitLifecycle(context, 'invocation.started', {
      message: 'OpenRouter generation started',
      requestedModel,
    });

    try {
      const result = await this.client.chatCompletion({
        model: requestedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        sessionId: context.conversationId,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens ?? options?.max_tokens,
        topP: options?.top_p,
      });
      const completedAt = Date.now();
      await this.recordUsage(
        context,
        requestedModel,
        result.model,
        result.usage,
        completedAt - startedAt,
        true,
      );
      await this.emitLifecycle(context, 'invocation.completed', {
        message: 'OpenRouter generation completed',
        requestedModel,
        resolvedModel: result.model,
        requestId: result.requestId,
        duration: completedAt - startedAt,
      });

      if (!options?.includeMetadata) {
        return result.content;
      }
      return {
        content: result.content,
        metadata: this.metadata({
          provider: 'openrouter',
          model: result.model,
          requestId: result.requestId,
          usage: result.usage,
          startedAt,
          completedAt,
        }),
      };
    } catch (error) {
      await this.recordFailure(context, requestedModel, startedAt, error);
      throw error;
    }
  }

  async generateUnifiedResponse(
    params: UnifiedGenerateResponseParams,
  ): Promise<string | LLMResponse> {
    const context = params.options?.executionContext;
    if (!context) {
      throw new Error(
        'ExecutionContext is required for OpenRouter generateUnifiedResponse',
      );
    }
    const requestedModel = this.resolveModel(params.provider, params.model);
    const contextModel = this.resolveModel(context.provider, context.model);
    if (requestedModel !== contextModel) {
      throw new Error(
        `Unified OpenRouter model '${requestedModel}' does not match ExecutionContext model '${contextModel}'`,
      );
    }
    return this.generateResponse(params.systemPrompt, params.userMessage, {
      ...params.options,
      executionContext: context,
      provider: params.provider,
      model: params.model,
    });
  }

  async generateImage(params: {
    provider: string;
    model: string;
    prompt: string;
    size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
    quality?: 'standard' | 'hd';
    style?: 'natural' | 'vivid';
    numberOfImages?: number;
    referenceImageUrl?: string;
    background?: 'transparent' | 'opaque' | 'auto';
    executionContext: ExecutionContext;
  }): Promise<ImageGenerationResponse> {
    this.assertNonSovereign(params.executionContext.sovereignMode);
    if (params.style !== undefined) {
      throw new Error(
        'OpenRouter dedicated image generation does not define a portable style parameter',
      );
    }
    const model = this.resolveModel(params.provider, params.model);
    const startedAt = Date.now();
    await this.emitLifecycle(params.executionContext, 'invocation.started', {
      message: 'OpenRouter image generation started',
      requestedModel: model,
      outputType: 'image',
    });

    try {
      const result = await this.client.imageGeneration({
        model,
        prompt: params.prompt,
        size: params.size,
        quality: params.quality,
        numberOfImages: params.numberOfImages,
        referenceImageUrl: params.referenceImageUrl,
        background: params.background,
      });
      const completedAt = Date.now();
      await this.recordUsage(
        params.executionContext,
        model,
        model,
        result.usage,
        completedAt - startedAt,
        true,
      );
      await this.emitLifecycle(
        params.executionContext,
        'invocation.completed',
        {
          message: 'OpenRouter image generation completed',
          requestedModel: model,
          outputType: 'image',
          imageCount: result.images.length,
          duration: completedAt - startedAt,
        },
      );

      return {
        images: result.images.map((image) => ({
          data: Buffer.from(image.base64, 'base64'),
          metadata: { mimeType: image.mediaType },
        })),
        metadata: this.metadata({
          provider: 'openrouter',
          model,
          requestId: `openrouter-image-${startedAt}`,
          usage: result.usage,
          startedAt,
          completedAt,
        }),
      };
    } catch (error) {
      await this.recordFailure(
        params.executionContext,
        model,
        startedAt,
        error,
      );
      throw error;
    }
  }

  async generateVideo(params: {
    provider: string;
    model: string;
    prompt: string;
    duration?: number;
    aspectRatio?: '16:9' | '9:16';
    resolution?: '720p' | '1080p' | '4k';
    firstFrameImageUrl?: string;
    firstFrameImage?: Buffer;
    lastFrameImageUrl?: string;
    lastFrameImage?: Buffer;
    generateAudio?: boolean;
    executionContext: ExecutionContext;
  }): Promise<VideoGenerationResponse> {
    this.assertNonSovereign(params.executionContext.sovereignMode);
    const model = this.resolveModel(params.provider, params.model);
    const startedAt = Date.now();
    await this.emitLifecycle(params.executionContext, 'invocation.started', {
      message: 'OpenRouter video generation started',
      requestedModel: model,
      outputType: 'video',
    });

    try {
      const job = await this.client.submitVideo({
        model,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution === '4k' ? '4K' : params.resolution,
        firstFrameImageUrl: this.resolveFrameImage(
          params.firstFrameImageUrl,
          params.firstFrameImage,
        ),
        lastFrameImageUrl: this.resolveFrameImage(
          params.lastFrameImageUrl,
          params.lastFrameImage,
        ),
        generateAudio: params.generateAudio,
      });
      const completedAt = Date.now();
      await this.emitLifecycle(
        params.executionContext,
        job.status === 'failed'
          ? 'invocation.failed'
          : 'invocation.progress',
        {
          message: `OpenRouter video generation ${job.status}`,
          requestedModel: model,
          operationId: job.id,
          outputType: 'video',
          duration: completedAt - startedAt,
        },
      );
      return this.videoResponse(job, model, startedAt, completedAt);
    } catch (error) {
      await this.recordFailure(
        params.executionContext,
        model,
        startedAt,
        error,
      );
      throw error;
    }
  }

  async pollVideoStatus(params: {
    provider: string;
    model?: string;
    operationId: string;
    executionContext: ExecutionContext;
  }): Promise<VideoGenerationResponse> {
    this.assertNonSovereign(params.executionContext.sovereignMode);
    if (!params.model) {
      throw new Error('model is required when polling OpenRouter video status');
    }
    const model = this.resolveModel(params.provider, params.model);
    const startedAt = Date.now();
    try {
      const job = await this.client.pollVideo(params.operationId);
      const videoData =
        job.status === 'completed'
          ? await this.client.downloadVideo(params.operationId)
          : undefined;
      const completedAt = Date.now();
      if (job.status === 'completed') {
        await this.recordUsage(
          params.executionContext,
          model,
          model,
          {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cost: job.cost,
          },
          completedAt - startedAt,
          true,
        );
      }
      await this.emitLifecycle(
        params.executionContext,
        this.videoLifecycleType(job),
        {
          message: `OpenRouter video generation ${job.status}`,
          requestedModel: model,
          operationId: job.id,
          outputType: 'video',
          duration: completedAt - startedAt,
          error: job.error,
        },
      );
      return {
        ...this.videoResponse(job, model, startedAt, completedAt),
        videoData,
        videoMetadata: videoData
          ? {
              mimeType: 'video/mp4',
              sizeBytes: videoData.length,
            }
          : undefined,
      };
    } catch (error) {
      await this.recordFailure(
        params.executionContext,
        model,
        startedAt,
        error,
      );
      throw error;
    }
  }

  emitLlmObservabilityEvent(
    hookEventType: string,
    executionContext: ExecutionContext,
    payload?: Record<string, unknown>,
  ): void {
    const type = hookEventType.endsWith('.failed')
      ? 'invocation.failed'
      : hookEventType.endsWith('.completed')
        ? 'invocation.completed'
        : hookEventType.endsWith('.processing')
          ? 'invocation.progress'
          : 'invocation.started';
    void this.emitLifecycle(executionContext, type, {
      ...payload,
      message:
        typeof payload?.message === 'string'
          ? payload.message
          : hookEventType,
    }).catch((error) => {
      this.logger.error(
        `OpenRouter observability emission failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private async emitLifecycle(
    context: ExecutionContext,
    type:
      | 'invocation.started'
      | 'invocation.progress'
      | 'invocation.completed'
      | 'invocation.failed',
    payload: Record<string, unknown> & { message?: string },
  ): Promise<void> {
    await this.observability.emitInvocationEvent(context, {
      type,
      sourceApp: 'llm-plane',
      message: payload.message,
      payload,
      duration:
        typeof payload.duration === 'number' ? payload.duration : undefined,
      success:
        type === 'invocation.completed'
          ? true
          : type === 'invocation.failed'
            ? false
            : undefined,
      error: typeof payload.error === 'string' ? payload.error : undefined,
    });
  }

  private async recordUsage(
    context: ExecutionContext,
    requestedModel: string,
    resolvedModel: string,
    usage: OpenRouterUsage,
    durationMs: number,
    success: boolean,
    error?: string,
  ): Promise<void> {
    await this.observability.recordLLMUsage(context, {
      provider: 'openrouter',
      model: resolvedModel,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      costUsd: usage.cost,
      durationMs,
      streaming: false,
      success,
      error,
      metadata: {
        requestedModel,
        resolvedModel,
        automaticRouting: requestedModel === 'openrouter/auto',
        providerFallbacksAllowed: false,
        dataCollection: 'deny',
      },
    });
  }

  private async recordFailure(
    context: ExecutionContext,
    requestedModel: string,
    startedAt: number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.recordUsage(
      context,
      requestedModel,
      requestedModel,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      Date.now() - startedAt,
      false,
      message,
    );
    await this.emitLifecycle(context, 'invocation.failed', {
      message: 'OpenRouter request failed',
      requestedModel,
      error: message,
      duration: Date.now() - startedAt,
    });
  }

  private metadata(params: {
    provider: string;
    model: string;
    requestId: string;
    usage: OpenRouterUsage;
    startedAt: number;
    completedAt: number;
  }): ResponseMetadata {
    return {
      provider: params.provider,
      model: params.model,
      requestId: params.requestId,
      timestamp: new Date(params.completedAt).toISOString(),
      usage: {
        inputTokens: params.usage.promptTokens,
        outputTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens,
        cost: params.usage.cost,
      },
      timing: {
        startTime: params.startedAt,
        endTime: params.completedAt,
        duration: params.completedAt - params.startedAt,
      },
      tier: 'external',
      status: 'completed',
    };
  }

  private videoResponse(
    job: OpenRouterVideoJob,
    model: string,
    startedAt: number,
    completedAt: number,
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
      videoUrl: job.unsignedUrls[0],
      metadata: this.metadata({
        provider: 'openrouter',
        model,
        requestId: job.generationId ?? job.id,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: job.cost,
        },
        startedAt,
        completedAt,
      }),
      error: failed
        ? {
            code: `OPENROUTER_VIDEO_${job.status.toUpperCase()}`,
            message: job.error ?? `OpenRouter video job ${job.status}`,
          }
        : undefined,
    };
  }

  private videoLifecycleType(
    job: OpenRouterVideoJob,
  ):
    | 'invocation.progress'
    | 'invocation.completed'
    | 'invocation.failed' {
    if (job.status === 'completed') {
      return 'invocation.completed';
    }
    if (['failed', 'cancelled', 'expired'].includes(job.status)) {
      return 'invocation.failed';
    }
    return 'invocation.progress';
  }

  private buildUserContent(
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>,
  ): OpenRouterMessageContent {
    if (!images || images.length === 0) {
      return userMessage;
    }
    return [
      { type: 'text', text: userMessage },
      ...images.map((image) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
        },
      })),
    ];
  }

  private resolveFrameImage(
    url: string | undefined,
    data: Buffer | undefined,
  ): string | undefined {
    if (url && data) {
      throw new Error('Provide a frame image URL or Buffer, not both');
    }
    if (url) {
      return url;
    }
    return data ? `data:image/png;base64,${data.toString('base64')}` : undefined;
  }

  private resolveModel(provider: string, model: string): string {
    if (!provider || !model) {
      throw new Error(
        'ExecutionContext provider and model are required for OpenRouter',
      );
    }
    if (model === 'openrouter/auto' || model.includes('/')) {
      return model;
    }
    if (provider === 'openrouter') {
      throw new Error(
        `OpenRouter model '${model}' must be a full provider/model slug`,
      );
    }
    return `${provider}/${model}`;
  }

  private assertNonSovereign(sovereignMode: boolean | undefined): void {
    if (sovereignMode) {
      throw new Error(
        'OpenRouter is an external provider and cannot serve sovereignMode requests',
      );
    }
  }

  private providerFromModel(model: string): string {
    const separator = model.indexOf('/');
    return separator > 0 ? model.slice(0, separator) : 'openrouter';
  }

  private formatProviderName(provider: string): string {
    return provider
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private mapPricing(
    pricing: OpenRouterModelEntry['pricing'],
  ): LLMModelInfo['pricing'] {
    if (!pricing) {
      return undefined;
    }
    return {
      inputPer1M: this.parsePrice(pricing.prompt, 'prompt'),
      outputPer1M: this.parsePrice(pricing.completion, 'completion'),
    };
  }

  private parsePrice(
    value: string | undefined,
    label: string,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const price = Number(value);
    if (price === -1) {
      return undefined;
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`OpenRouter returned invalid ${label} pricing '${value}'`);
    }
    return price * 1_000_000;
  }
}
