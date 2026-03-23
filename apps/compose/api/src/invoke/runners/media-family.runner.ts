/**
 * Media Family Runner
 *
 * Handles agents of family type 'media':
 * - Generates images or video via the LLM provider APIs
 * - Stores generated media via MediaStorageProvider
 * - Returns image/video InvokeOutput with asset URL in content
 *
 * Config fields used from AgentDefinition:
 *   mediaConfig  — { type: 'image' | 'video', size?, quality?, style? }
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

type MediaType = 'image' | 'video';

@Injectable()
export class MediaFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(MediaFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly mediaStorage: MediaStorageProvider,
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
    const provider =
      definition.llmConfig?.provider ?? context.provider ?? 'openai';
    const model = definition.llmConfig?.model ?? context.model;

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
    const size =
      (mediaConfig.size as '1024x1024' | '512x512' | '256x256') ?? '1024x1024';
    const quality = (mediaConfig.quality as 'standard' | 'hd') ?? 'standard';
    const style = (mediaConfig.style as 'natural' | 'vivid') ?? 'natural';

    const imageResponse: ImageGenerationResponse =
      await this.llmService.generateImage({
        provider,
        model,
        prompt,
        size,
        quality,
        style,
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

    // Store the generated image
    const stored = await this.mediaStorage.storeGeneratedMedia(
      img.data,
      context,
      {
        prompt,
        revisedPrompt: img.revisedPrompt,
        provider,
        model,
        mime: 'image/png',
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
    const duration = (mediaConfig.duration as number) ?? 5;
    const aspectRatio = (mediaConfig.aspectRatio as '16:9' | '9:16') ?? '16:9';
    const resolution =
      (mediaConfig.resolution as '720p' | '1080p' | '4k') ?? '720p';

    const videoResponse = await this.llmService.generateVideo({
      provider,
      model,
      prompt,
      duration,
      aspectRatio,
      resolution,
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
      // Poll once — in production this would be a webhook or queued job
      let polledResponse = videoResponse;
      let attempts = 0;
      while (
        (polledResponse.status === 'processing' ||
          polledResponse.status === 'pending') &&
        attempts < 30
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        polledResponse = await this.llmService.pollVideoStatus({
          provider,
          model,
          operationId: videoResponse.operationId,
          executionContext: context,
        });
        attempts++;
      }

      if (
        polledResponse.status === 'processing' ||
        polledResponse.status === 'pending'
      ) {
        throw new Error('Video generation timed out after polling');
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
        : await this.mediaStorage.downloadAndStore(
            polledResponse.videoUrl!,
            context,
            {
              prompt,
              provider,
              model,
              mime: 'video/mp4',
            },
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
        },
      };
    }

    if (!videoResponse.videoUrl) {
      throw new Error('Video generation returned no URL');
    }

    const stored = await this.mediaStorage.downloadAndStore(
      videoResponse.videoUrl,
      context,
      {
        prompt,
        provider,
        model,
        mime: 'video/mp4',
      },
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
}
