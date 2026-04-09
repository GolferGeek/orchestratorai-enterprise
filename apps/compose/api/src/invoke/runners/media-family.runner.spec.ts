/**
 * MediaFamilyRunner unit tests
 *
 * Tests image generation path, video generation path,
 * empty prompt guard, and storage integration.
 */

import { MediaFamilyRunner } from './media-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

const mockImageDefinition: AgentDefinition = {
  id: 'def-5',
  slug: 'image-gen',
  name: 'Image Generator',
  agentType: 'media',
  status: 'active',
  outputType: 'image',
  mediaConfig: { type: 'image', size: '1024x1024', quality: 'standard' },
  llmConfig: { provider: 'openai', model: 'dall-e-3' },
};

const mockImageResponse = {
  images: [
    {
      data: 'base64encodeddata==',
      revisedPrompt: 'A beautiful landscape',
      metadata: { width: 1024, height: 1024 },
    },
  ],
  error: null,
};

const mockStoredMedia = {
  url: 'https://storage.example.com/images/gen-1.png',
  assetId: 'asset-1',
};

describe('MediaFamilyRunner', () => {
  let runner: MediaFamilyRunner;
  let mockLlmService: {
    generateImage: jest.Mock;
    generateVideo: jest.Mock;
    pollVideoStatus: jest.Mock;
  };
  let mockMediaStorage: {
    storeGeneratedMedia: jest.Mock;
    downloadAndStore: jest.Mock;
  };

  beforeEach(() => {
    mockLlmService = {
      generateImage: jest.fn().mockResolvedValue(mockImageResponse),
      generateVideo: jest.fn().mockResolvedValue({
        videoUrl: 'https://example.com/video.mp4',
        status: 'completed',
        error: null,
      }),
      pollVideoStatus: jest.fn(),
    };
    mockMediaStorage = {
      storeGeneratedMedia: jest.fn().mockResolvedValue(mockStoredMedia),
      downloadAndStore: jest.fn().mockResolvedValue(mockStoredMedia),
    };

    runner = new MediaFamilyRunner(
      mockLlmService as never,
      mockMediaStorage as never,
    );
  });

  describe('invoke — image generation', () => {
    it('calls generateImage and stores result, returns image InvokeOutput', async () => {
      const context = createMockExecutionContext({ agentSlug: 'image-gen' });
      const data = { content: 'A beautiful mountain landscape at sunset' };

      const output = await runner.invoke(mockImageDefinition, context, data);

      expect(mockLlmService.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'dall-e-3',
          prompt: 'A beautiful mountain landscape at sunset',
          executionContext: context,
        }),
      );
      expect(mockMediaStorage.storeGeneratedMedia).toHaveBeenCalled();
      expect(output.outputType).toBe('image');
      expect(output.content).toBe(
        'https://storage.example.com/images/gen-1.png',
      );
      expect(output.metadata?.assetId).toBe('asset-1');
    });
  });

  describe('invoke — video generation', () => {
    it('calls generateVideo and stores result, returns video InvokeOutput', async () => {
      const videoDefinition: AgentDefinition = {
        ...mockImageDefinition,
        outputType: 'video',
        mediaConfig: { type: 'video', duration: 5 },
      };
      const context = createMockExecutionContext();

      const output = await runner.invoke(videoDefinition, context, {
        content: 'Rocket launch',
      });

      expect(mockLlmService.generateVideo).toHaveBeenCalled();
      expect(output.outputType).toBe('video');
    });
  });

  describe('invoke — error paths', () => {
    it('throws when prompt is empty', async () => {
      const context = createMockExecutionContext();

      await expect(
        runner.invoke(mockImageDefinition, context, { content: '   ' }),
      ).rejects.toThrow('Prompt is required');
    });

    it('throws when image generation returns an error', async () => {
      mockLlmService.generateImage.mockResolvedValueOnce({
        images: [],
        error: { message: 'Content policy violation' },
      });
      const context = createMockExecutionContext();

      await expect(
        runner.invoke(mockImageDefinition, context, {
          content: 'valid prompt',
        }),
      ).rejects.toThrow('Image generation failed');
    });
  });
});
