import { Test, TestingModule } from '@nestjs/testing';
import { MediaAgentRunnerService } from './media-agent-runner.service';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { LLMService } from '@llm/llm.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { PlansService } from '../plans/services/plans.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from './media-storage-provider.interface';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('MediaAgentRunnerService', () => {
  let service: MediaAgentRunnerService;
  let llmService: jest.Mocked<LLMService>;
  let mediaStorage: jest.Mocked<MediaStorageProvider>;
  let deliverablesService: jest.Mocked<DeliverablesService>;
  let streamingService: jest.Mocked<StreamingService>;
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAgentRunnerService,
        {
          provide: LLM_SERVICE,
          useValue: {
            generateImage: jest.fn(),
            generateVideo: jest.fn(),
            pollVideoStatus: jest.fn(),
            emitLlmObservabilityEvent: jest.fn(),
          },
        },
        {
          provide: ContextOptimizationService,
          useValue: {
            optimizeContext: jest.fn(),
          },
        },
        {
          provide: PlansService,
          useValue: {
            executeAction: jest.fn(),
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            executeAction: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: Agent2AgentConversationsService,
          useValue: {
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            sendUpdate: jest.fn(),
            emitProgress: jest.fn(),
          },
        },
        {
          provide: MEDIA_STORAGE_PROVIDER,
          useValue: {
            storeGeneratedMedia: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MediaAgentRunnerService>(MediaAgentRunnerService);
    llmService = module.get(LLM_SERVICE);
    mediaStorage = module.get(MEDIA_STORAGE_PROVIDER);
    deliverablesService = module.get(DeliverablesService);
    streamingService = module.get(StreamingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ExecutionContext handling', () => {
    it('should pass ExecutionContext unchanged to generateImage', async () => {
      // Arrange
      const definition = {
        slug: 'image-generator',
        displayName: 'Image Generator',
        agentType: 'media',
        config: { mediaType: 'image' },
        llm: { provider: 'openai', model: 'gpt-image-1.5' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate an image of a sunset',
        payload: {
          action: 'create',
        },
        metadata: {
          userId: 'user-123',
        },
      };

      const imageResponse = {
        images: [
          {
            data: Buffer.from('fake-image-data'),
            revisedPrompt: 'A beautiful sunset over the ocean',
            metadata: {
              width: 1024,
              height: 1024,
              mimeType: 'image/png',
            },
          },
        ],
        metadata: {
          provider: 'openai',
          model: 'gpt-image-1.5',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 1000,
          },
          status: 'completed' as const,
        },
      };

      llmService.generateImage.mockResolvedValue(imageResponse);
      mediaStorage.storeGeneratedMedia.mockResolvedValue({
        assetId: 'asset-123',
        url: 'https://storage.example.com/image.png',
        storagePath: 'images/image.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-123' },
          version: { id: 'ver-123' },
          isNew: true,
        },
      });

      // Act
      await service.execute(definition, request, mockContext.orgSlug);

      // Assert - Verify generateImage was called with ExecutionContext
      expect(llmService.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          executionContext: mockContext,
        }),
      );
    });
  });

  describe('BUILD mode - image generation', () => {
    it('should generate image and create deliverable', async () => {
      const definition = {
        slug: 'image-generator',
        displayName: 'Image Generator',
        agentType: 'media',
        config: { mediaType: 'image' },
        llm: { provider: 'openai', model: 'gpt-image-1.5' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate a futuristic cityscape',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const imageResponse = {
        images: [
          {
            data: Buffer.from('fake-image-data'),
            revisedPrompt: 'A futuristic cityscape with flying cars',
            metadata: {
              width: 1024,
              height: 1024,
              mimeType: 'image/png',
            },
          },
        ],
        metadata: {
          provider: 'openai',
          model: 'gpt-image-1.5',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0.04,
          },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 2000,
          },
          status: 'completed' as const,
        },
      };

      llmService.generateImage.mockResolvedValue(imageResponse);
      mediaStorage.storeGeneratedMedia.mockResolvedValue({
        assetId: 'asset-123',
        url: 'https://storage.example.com/image.png',
        storagePath: 'images/image.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-123' },
          version: { id: 'ver-123' },
          isNew: true,
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.BUILD);
      expect(llmService.generateImage).toHaveBeenCalled();
      // Service uses context.provider and context.model first (from ExecutionContext)
      expect(mediaStorage.storeGeneratedMedia).toHaveBeenCalledWith(
        expect.any(Buffer),
        mockContext,
        expect.objectContaining({
          prompt: 'Generate a futuristic cityscape',
          provider: mockContext.provider,
          model: mockContext.model,
        }),
      );
      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          type: 'image',
          format: 'image/png',
        }),
        mockContext,
      );
      expect(streamingService.emitProgress).toHaveBeenCalled();
    });

    it('should handle missing userId', async () => {
      const definition = {
        slug: 'image-generator',
        agentType: 'media',
        config: { mediaType: 'image' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const contextWithoutUser = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: '',
        conversationId: 'conv-123',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: contextWithoutUser,
        userMessage: 'Generate image',
        payload: {},
      };

      // Act
      const result = await service.execute(
        definition,
        request,
        contextWithoutUser.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'User identity is required',
      );
    });

    it('should handle missing conversationId', async () => {
      const definition = {
        slug: 'image-generator',
        agentType: 'media',
        config: { mediaType: 'image' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const contextWithoutConversation = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: '',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: contextWithoutConversation,
        userMessage: 'Generate image',
        payload: {},
      };

      // Act
      const result = await service.execute(
        definition,
        request,
        contextWithoutConversation.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'Conversation context is required',
      );
    });

    it('should handle image generation errors', async () => {
      const definition = {
        slug: 'image-generator',
        agentType: 'media',
        config: { mediaType: 'image' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate invalid image',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      llmService.generateImage.mockResolvedValue({
        images: [],
        metadata: {
          provider: 'openai',
          model: 'gpt-image-1.5',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'error',
        },
        error: {
          code: 'INVALID_PROMPT',
          message: 'Prompt violates content policy',
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain('content policy');
    });
  });

  describe('BUILD mode - video generation', () => {
    it('should generate video and create deliverable', async () => {
      const definition = {
        slug: 'video-generator',
        displayName: 'Video Generator',
        agentType: 'media',
        config: { mediaType: 'video' },
        llm: { provider: 'openai', model: 'sora-2' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate a video of waves crashing',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const videoResponse = {
        operationId: 'op-123',
        status: 'pending' as const,
        metadata: {
          provider: 'openai',
          model: 'sora-2',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'started' as const,
        },
      };

      const completedResponse = {
        operationId: 'op-123',
        status: 'completed' as const,
        videoData: Buffer.from('fake-video-data'),
        videoMetadata: {
          durationSeconds: 4,
          mimeType: 'video/mp4',
        },
        metadata: {
          provider: 'openai',
          model: 'sora-2',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0.5 },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 30000,
          },
          status: 'completed' as const,
        },
      };

      llmService.generateVideo.mockResolvedValue(videoResponse);
      llmService.pollVideoStatus.mockResolvedValue(completedResponse);
      mediaStorage.storeGeneratedMedia.mockResolvedValue({
        assetId: 'asset-video-123',
        url: 'https://storage.example.com/video.mp4',
        storagePath: 'videos/video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 102400,
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-video-123' },
          version: { id: 'ver-video-123' },
          isNew: true,
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(llmService.generateVideo).toHaveBeenCalled();
      expect(llmService.pollVideoStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'op-123',
          executionContext: mockContext,
        }),
      );
      expect(mediaStorage.storeGeneratedMedia).toHaveBeenCalled();
      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          type: 'video',
        }),
        mockContext,
      );
    });

    it.skip('should handle video generation timeout', async () => {
      // Skipped: This test requires real polling timeout which takes too long
      // TODO: Refactor to use jest.useFakeTimers() for proper timeout testing
      const definition = {
        slug: 'video-generator',
        agentType: 'media',
        config: { mediaType: 'video' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate video',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      llmService.generateVideo.mockResolvedValue({
        operationId: 'op-timeout',
        status: 'pending' as const,
        metadata: {
          provider: 'openai',
          model: 'sora-2',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'started' as const,
        },
      });

      // Mock polling to always return processing status (simulating timeout)
      llmService.pollVideoStatus.mockResolvedValue({
        operationId: 'op-timeout',
        status: 'processing' as const,
        metadata: {
          provider: 'openai',
          model: 'sora-2',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'started' as const,
        },
      });

      // Act - this will timeout in the actual implementation
      // For testing, we'll mock a failure scenario
      const _result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert - expect timeout or still processing
      expect(llmService.generateVideo).toHaveBeenCalled();
      expect(llmService.pollVideoStatus).toHaveBeenCalled();
    });
  });

  describe('Media type resolution', () => {
    it('should resolve media type from config.mediaType', async () => {
      const definition = {
        slug: 'media-agent',
        agentType: 'media',
        config: { mediaType: 'image' },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate media',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      llmService.generateImage.mockResolvedValue({
        images: [
          {
            data: Buffer.from('test'),
            metadata: {
              mimeType: 'image/png',
            },
          },
        ],
        metadata: {
          provider: 'openai',
          model: 'test',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'completed' as const,
        },
      });
      mediaStorage.storeGeneratedMedia.mockResolvedValue({
        assetId: 'asset-123',
        url: 'https://storage.example.com/media',
        storagePath: 'media',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {}, isNew: true },
      });

      // Act
      await service.execute(definition, request, mockContext.orgSlug);

      // Assert - should call generateImage
      expect(llmService.generateImage).toHaveBeenCalled();
      expect(llmService.generateVideo).not.toHaveBeenCalled();
    });

    it('should default to image when no media type specified', async () => {
      const definition = {
        slug: 'media-agent',
        agentType: 'media',
        config: {},
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate media',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      llmService.generateImage.mockResolvedValue({
        images: [
          {
            data: Buffer.from('test'),
            metadata: {
              mimeType: 'image/png',
            },
          },
        ],
        metadata: {
          provider: 'openai',
          model: 'test',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 0 },
          status: 'completed' as const,
        },
      });
      mediaStorage.storeGeneratedMedia.mockResolvedValue({
        assetId: 'asset-123',
        url: 'url',
        storagePath: 'path',
        mimeType: 'image/png',
        sizeBytes: 512,
      });
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {}, isNew: true },
      });

      // Act
      await service.execute(definition, request, mockContext.orgSlug);

      // Assert - should default to image
      expect(llmService.generateImage).toHaveBeenCalled();
    });
  });
});
