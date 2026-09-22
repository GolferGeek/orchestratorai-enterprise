import { Test, TestingModule } from '@nestjs/testing';
import { LLMImageService } from './llm-image.service';
import { LLMServiceFactory } from './llm-service-factory';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

describe('LLMImageService', () => {
  let service: LLMImageService;
  let llmServiceFactory: jest.Mocked<LLMServiceFactory>;

  const mockExecutionContext: ExecutionContext = {
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    agentSlug: 'test-agent',
    agentType: 'api',
    provider: 'openai',
    model: 'gpt-image-1.5',
  };

  const mockImageResponse = {
    images: [
      {
        data: Buffer.from('fake-image-data'),
        revisedPrompt: 'revised prompt',
        metadata: {
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      },
    ],
    metadata: {
      provider: 'openai',
      model: 'gpt-image-1.5',
      requestId: 'req-123',
      timestamp: new Date().toISOString(),
      usage: {
        inputTokens: 10,
        outputTokens: 0,
        totalTokens: 10,
        cost: 0.02,
      },
      timing: {
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
      },
      status: 'completed' as const,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMImageService,
        {
          provide: LLMServiceFactory,
          useValue: {
            // Capability now comes from the backend rather than a hardcoded
            // allowlist in the service, so the mock has to model that: only
            // image-capable providers expose generateImage.
            createService: jest.fn(
              async ({ provider }: { provider: string }) =>
                ['openai', 'google', 'openrouter'].includes(
                  provider.toLowerCase(),
                )
                  ? {
                      generateImage: jest
                        .fn()
                        .mockResolvedValue(mockImageResponse),
                    }
                  : {},
            ),
          },
        },
      ],
    }).compile();

    service = module.get<LLMImageService>(LLMImageService);
    llmServiceFactory = module.get(LLMServiceFactory);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateImage', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateImage(null as any, { prompt: 'test' }),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should require provider and model in ExecutionContext', async () => {
      const invalidContext = { ...mockExecutionContext, provider: null };
      await expect(
        service.generateImage(invalidContext as any, { prompt: 'test' }),
      ).rejects.toThrow('ExecutionContext must contain provider and model');
    });

    it('should validate provider supports image generation', async () => {
      const invalidContext = {
        ...mockExecutionContext,
        provider: 'anthropic',
      };

      // Reported as an error response rather than a throw, consistent with
      // every other failure in this method. The media runner checks
      // `response.error` and raises, so it cannot pass as a success.
      const result = await service.generateImage(invalidContext, {
        prompt: 'test',
      });

      expect(result.error?.code).toBe('IMAGE_GENERATION_FAILED');
      expect(result.error?.message).toContain(
        'does not implement image generation',
      );
      expect(result.images).toHaveLength(0);
    });

    it('should generate image with valid parameters', async () => {
      const result = await service.generateImage(mockExecutionContext, {
        prompt: 'A beautiful sunset',
        size: '1024x1024',
        quality: 'hd',
      });

      expect(result.images).toHaveLength(1);
      expect(result.metadata.status).toBe('completed');
      expect(llmServiceFactory.createService).toHaveBeenCalledWith({
        provider: 'openai',
        model: 'gpt-image-1.5',
      });
    });

    it('should handle service errors gracefully', async () => {
      llmServiceFactory.createService.mockResolvedValueOnce({
        generateImage: jest.fn().mockRejectedValue(new Error('Service error')),
      } as any);

      const result = await service.generateImage(mockExecutionContext, {
        prompt: 'test',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Service error');
    });

    it('should support different image sizes', async () => {
      const sizes: Array<
        '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792'
      > = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];

      for (const size of sizes) {
        const mockService = {
          generateImage: jest.fn().mockResolvedValue(mockImageResponse),
        };
        llmServiceFactory.createService.mockResolvedValueOnce(
          mockService as any,
        );

        await service.generateImage(mockExecutionContext, {
          prompt: 'test',
          size,
        });

        expect(mockService.generateImage).toHaveBeenCalledWith(
          mockExecutionContext,
          expect.objectContaining({ size }),
        );
      }
    });

    it('should support quality settings', async () => {
      const qualities: Array<'standard' | 'hd'> = ['standard', 'hd'];

      for (const quality of qualities) {
        const mockService = {
          generateImage: jest.fn().mockResolvedValue(mockImageResponse),
        };
        llmServiceFactory.createService.mockResolvedValueOnce(
          mockService as any,
        );

        await service.generateImage(mockExecutionContext, {
          prompt: 'test',
          quality,
        });

        expect(mockService.generateImage).toHaveBeenCalledWith(
          mockExecutionContext,
          expect.objectContaining({ quality }),
        );
      }
    });
  });

  describe('generateImageEdit', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateImageEdit(null as any, {
          prompt: 'test',
          referenceImage: Buffer.from('test'),
        }),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should only support OpenAI', async () => {
      const googleContext = {
        ...mockExecutionContext,
        provider: 'google',
      };

      await expect(
        service.generateImageEdit(googleContext, {
          prompt: 'test',
          referenceImage: Buffer.from('test'),
        }),
      ).rejects.toThrow('only supported for OpenAI');
    });

    it('should generate image edits with mask', async () => {
      const mockService = {
        generateImage: jest.fn().mockResolvedValue(mockImageResponse),
      };
      llmServiceFactory.createService.mockResolvedValueOnce(mockService as any);

      const result = await service.generateImageEdit(mockExecutionContext, {
        prompt: 'Add a cat',
        referenceImage: Buffer.from('original'),
        mask: Buffer.from('mask'),
      });

      expect(result.images).toHaveLength(1);
      expect(mockService.generateImage).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.objectContaining({
          prompt: 'Add a cat',
          referenceImage: expect.any(Buffer),
          mask: expect.any(Buffer),
        }),
      );
    });
  });

  describe('generateImageVariation', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateImageVariation(null as any, {
          referenceImage: Buffer.from('test'),
        }),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should only support OpenAI', async () => {
      const googleContext = {
        ...mockExecutionContext,
        provider: 'google',
      };

      await expect(
        service.generateImageVariation(googleContext, {
          referenceImage: Buffer.from('test'),
        }),
      ).rejects.toThrow('only supported for OpenAI');
    });

    it('should generate image variations', async () => {
      const mockService = {
        generateImage: jest.fn().mockResolvedValue(mockImageResponse),
      };
      llmServiceFactory.createService.mockResolvedValueOnce(mockService as any);

      const result = await service.generateImageVariation(
        mockExecutionContext,
        {
          referenceImage: Buffer.from('original'),
          numberOfImages: 4,
        },
      );

      expect(result.images).toHaveLength(1);
      expect(mockService.generateImage).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.objectContaining({
          prompt: '', // Empty prompt for variations
          referenceImage: expect.any(Buffer),
          numberOfImages: 4,
        }),
      );
    });
  });

  describe('capability checks', () => {
    it('should check if provider supports image generation', async () => {
      await expect(
        service.supportsImageGeneration(mockExecutionContext),
      ).resolves.toBe(true);

      const anthropicContext = {
        ...mockExecutionContext,
        provider: 'anthropic',
      };
      await expect(
        service.supportsImageGeneration(anthropicContext),
      ).resolves.toBe(false);

      const googleContext = { ...mockExecutionContext, provider: 'google' };
      await expect(
        service.supportsImageGeneration(googleContext),
      ).resolves.toBe(true);
    });

    it('supports a backend added later with no edit to this service', async () => {
      // The point of dropping the allowlist: OpenRouter implements
      // generateImage, so it works here without LLMImageService knowing it
      // exists.
      const openRouterContext = {
        ...mockExecutionContext,
        provider: 'openrouter',
      };
      await expect(
        service.supportsImageGeneration(openRouterContext),
      ).resolves.toBe(true);
    });

    it('should check if provider supports image editing', () => {
      expect(service.supportsImageEditing(mockExecutionContext)).toBe(true);

      const googleContext = { ...mockExecutionContext, provider: 'google' };
      expect(service.supportsImageEditing(googleContext)).toBe(false);
    });

    it('should check if provider supports image variations', () => {
      expect(service.supportsImageVariations(mockExecutionContext)).toBe(true);

      const googleContext = { ...mockExecutionContext, provider: 'google' };
      expect(service.supportsImageVariations(googleContext)).toBe(false);
    });

    it('should handle null ExecutionContext in capability checks', async () => {
      await expect(service.supportsImageGeneration(null as any)).resolves.toBe(
        false,
      );
      expect(service.supportsImageEditing(null as any)).toBe(false);
      expect(service.supportsImageVariations(null as any)).toBe(false);
    });
  });
});
