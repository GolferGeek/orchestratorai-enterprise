/**
 * Media Family Runner
 *
 * Handles agents of family type 'media':
 * - Generates images or video via the LLM provider APIs
 * - Stores generated media via MediaStorageProvider
 * - Returns image/video InvokeOutput with asset URL in content
 *
 * Config fields used from AgentDefinition:
 *   mediaConfig  — image: { type, size?, quality?, style?, format? }
 *                  video: { type, duration, aspectRatio, resolution, generateAudio? }
 *   llmConfig    — provider and model for generation
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinition } from '../agent-definition.types';
import type { ImageGenerationResponse } from '@orchestratorai/planes/llm';
import { OutboundUrlValidatorService } from '../../../common/outbound/outbound-url-validator.service';

type MediaType = 'image' | 'video';

/** How long a video job may take before we give up: Wan 2.7 took 7 minutes in the 2026-10-01 comparison. */
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;
const VIDEO_POLL_MS = 5000;

@Injectable()
export class MediaFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(MediaFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
    private readonly outboundUrlValidator: OutboundUrlValidatorService,
  ) {}

  async invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
  ): Promise<InvokeOutput> {
    this.logger.debug(`MediaFamilyRunner.invoke — agent: ${definition.slug}`);

    const prompt = this.extractPrompt(data);
    if (!prompt.trim()) {
      throw new Error('Prompt is required for media generation');
    }

    const mediaConfig = definition.mediaConfig ?? {};
    const mediaType = this.resolveMediaType(mediaConfig, definition);
    const provider = context.provider;
    const model = context.model;

    if (mediaType === 'image') {
      return await this.generateImage(
        definition,
        context,
        prompt,
        provider,
        model,
        mediaConfig,
      );
    }

    if (mediaType === 'video') {
      return await this.generateVideo(
        definition,
        context,
        prompt,
        provider,
        model,
        mediaConfig,
      );
    }

    throw new Error(`Unknown media type: ${String(mediaType)}`);
  }

  private async generateImage(
    definition: AgentDefinition,
    context: ExecutionContext,
    prompt: string,
    provider: string,
    model: string,
    mediaConfig: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const size = this.requireImageSize(mediaConfig.size);
    const quality = this.requireImageQuality(mediaConfig.quality);
    const style = this.requireImageStyle(mediaConfig.style);
    const outputFormat = this.requireImageFormat(mediaConfig.format);

    const imageResponse: ImageGenerationResponse =
      await this.llmService.generateImage({
        provider,
        model,
        prompt,
        size,
        quality,
        style,
        ...(outputFormat ? { outputFormat } : {}),
        numberOfImages: 1,
        executionContext: context,
      });

    if (imageResponse.error) {
      throw new Error(
        `Image generation failed: ${imageResponse.error.message}`,
      );
    }

    if (!imageResponse.images || imageResponse.images.length === 0) {
      throw new Error('Image generation returned no images');
    }

    const img = imageResponse.images[0];
    if (!img) {
      throw new Error('Image generation returned an empty image entry');
    }

    // Stored as the type the model returned (PNG, JPEG, WebP or SVG).
    const mime = img.metadata?.mimeType;
    if (!mime) throw new Error(`${provider} did not say what type of image ${model} returned`);
    const stored = await this.mediaStorage.storeGeneratedMedia(
      img.data,
      context,
      {
        prompt,
        revisedPrompt: img.revisedPrompt,
        provider,
        model,
        mime,
        width: img.metadata?.width,
        height: img.metadata?.height,
      },
    );

    return {
      content: stored.url,
      outputType: 'image',
      metadata: {
        agentSlug: definition.slug,
        assetId: stored.assetId,
        url: stored.url,
        provider,
        model,
        prompt,
        revisedPrompt: img.revisedPrompt,
        size,
        quality,
        mimeType: mime,
      },
    };
  }

  private async generateVideo(
    definition: AgentDefinition,
    context: ExecutionContext,
    prompt: string,
    provider: string,
    model: string,
    mediaConfig: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const duration = this.requireVideoDuration(mediaConfig.duration);
    const aspectRatio = this.requireVideoAspectRatio(mediaConfig.aspectRatio);
    const resolution = this.requireVideoResolution(mediaConfig.resolution);
    const generateAudio = this.requireOptionalBoolean(mediaConfig.generateAudio, 'generateAudio');

    const videoResponse = await this.llmService.generateVideo({
      provider,
      model,
      prompt,
      duration,
      aspectRatio,
      resolution,
      ...(generateAudio === undefined ? {} : { generateAudio }),
      executionContext: context,
    });

    if (videoResponse.error) {
      throw new Error(
        `Video generation failed: ${videoResponse.error.message}`,
      );
    }

    // Video may need polling for async completion
    const needsPolling =
      videoResponse.status === 'processing' ||
      videoResponse.status === 'pending';
    if (needsPolling && videoResponse.operationId) {
      let polledResponse = videoResponse;
      const deadline = Date.now() + VIDEO_TIMEOUT_MS;
      while (
        (polledResponse.status === 'processing' ||
          polledResponse.status === 'pending') &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_MS));
        polledResponse = await this.llmService.pollVideoStatus({
          provider,
          model,
          operationId: videoResponse.operationId,
          executionContext: context,
        });
      }

      if (
        polledResponse.status === 'processing' ||
        polledResponse.status === 'pending'
      ) {
        throw new Error(`Video generation did not finish within ${VIDEO_TIMEOUT_MS / 60000} minutes`);
      }

      if (polledResponse.error) {
        throw new Error(
          `Video generation failed: ${polledResponse.error.message}`,
        );
      }

      if (!polledResponse.videoUrl && !polledResponse.videoData) {
        throw new Error('Video generation returned no URL after polling');
      }

      // Prefer videoData (already downloaded) over videoUrl (requires re-download with auth)
      const stored = polledResponse.videoData
        ? await this.mediaStorage.storeGeneratedMedia(
            polledResponse.videoData,
            context,
            {
              prompt,
              provider,
              model,
              mime: 'video/mp4',
            },
          )
        : await this.downloadAndStoreVideo(
            polledResponse.videoUrl!,
            context,
            prompt,
            provider,
            model,
          );

      return {
        content: stored.url,
        outputType: 'video',
        metadata: {
          agentSlug: definition.slug,
          assetId: stored.assetId,
          url: stored.url,
          provider,
          model,
          prompt,
          duration,
          aspectRatio,
          resolution,
          mimeType: 'video/mp4',
        },
      };
    }

    if (!videoResponse.videoUrl) {
      throw new Error('Video generation returned no URL');
    }

    const stored = await this.downloadAndStoreVideo(
      videoResponse.videoUrl,
      context,
      prompt,
      provider,
      model,
    );

    return {
      content: stored.url,
      outputType: 'video',
      metadata: {
        agentSlug: definition.slug,
        assetId: stored.assetId,
        url: stored.url,
        provider,
        model,
        prompt,
        duration,
        aspectRatio,
        resolution,
        mimeType: 'video/mp4',
      },
    };
  }

  private resolveMediaType(
    mediaConfig: Record<string, unknown>,
    definition: AgentDefinition,
  ): MediaType {
    const fromConfig = mediaConfig.type as string | undefined;
    if (fromConfig === 'image' || fromConfig === 'video') {
      return fromConfig;
    }

    // Fallback: infer from outputType
    if (definition.outputType === 'image') {
      return 'image';
    }
    if (definition.outputType === 'video') {
      return 'video';
    }

    return 'image';
  }

  private extractPrompt(data: InvokeData): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      const msg = obj.prompt ?? obj.message ?? obj.userMessage ?? obj.text;
      if (typeof msg === 'string') {
        return msg;
      }
    }
    return '';
  }

  // An image setting the agent leaves out takes the default; one it sets must be valid.
  private requireImageSize(value: unknown): '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' {
    if (value === undefined) return '1024x1024';
    const sizes = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'] as const;
    if (!sizes.includes(value as (typeof sizes)[number])) throw new Error(`Image mediaConfig.size must be one of ${sizes.join(', ')}`);
    return value as (typeof sizes)[number];
  }

  private requireImageQuality(value: unknown): 'standard' | 'hd' {
    if (value === undefined) return 'standard';
    if (value !== 'standard' && value !== 'hd') throw new Error("Image mediaConfig.quality must be 'standard' or 'hd'");
    return value;
  }

  private requireImageStyle(value: unknown): 'natural' | 'vivid' {
    if (value === undefined) return 'natural';
    if (value !== 'natural' && value !== 'vivid') throw new Error("Image mediaConfig.style must be 'natural' or 'vivid'");
    return value;
  }

  /** Vector models (e.g. Recraft vector) answer only 'svg'; unset means the backend's default (PNG). */
  private requireImageFormat(value: unknown): 'png' | 'jpeg' | 'webp' | 'svg' | undefined {
    if (value === undefined) return undefined;
    if (value !== 'png' && value !== 'jpeg' && value !== 'webp' && value !== 'svg') {
      throw new Error("Image mediaConfig.format must be 'png', 'jpeg', 'webp' or 'svg'");
    }
    return value;
  }

  private requireVideoDuration(value: unknown): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new Error('Video mediaConfig.duration must be a positive integer');
    }
    return value as number;
  }

  private requireVideoAspectRatio(value: unknown): '16:9' | '9:16' {
    if (value !== '16:9' && value !== '9:16') {
      throw new Error("Video mediaConfig.aspectRatio must be '16:9' or '9:16'");
    }
    return value;
  }

  private requireVideoResolution(value: unknown): '720p' | '1080p' | '4k' {
    if (value !== '720p' && value !== '1080p' && value !== '4k') {
      throw new Error(
        "Video mediaConfig.resolution must be '720p', '1080p', or '4k'",
      );
    }
    return value;
  }

  private requireOptionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new Error(`Video mediaConfig.${field} must be true or false`);
    return value;
  }

  private async downloadAndStoreVideo(
    rawUrl: string,
    context: ExecutionContext,
    prompt: string,
    provider: string,
    model: string,
  ) {
    const safeUrl = await this.outboundUrlValidator.assertSafe(rawUrl);
    return this.mediaStorage.downloadAndStore(safeUrl.toString(), context, {
      prompt,
      provider,
      model,
      mime: 'video/mp4',
    });
  }
}
