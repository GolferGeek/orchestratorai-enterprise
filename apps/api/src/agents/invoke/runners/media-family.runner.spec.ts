import type {
  ExecutionContext,
  InvokeData,
} from '@orchestrator-ai/transport-types';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { MediaStorageProvider } from '@orchestratorai/planes/storage';
import { MediaFamilyRunner } from './media-family.runner';
import type { AgentDefinition } from '../agent-definition.types';
import { ServiceUnavailableException } from '@nestjs/common';

jest.mock('@orchestratorai/planes/llm', () => ({
  LLM_SERVICE: Symbol('LLM_SERVICE'),
}));
jest.mock('@orchestratorai/planes/storage', () => ({
  MEDIA_STORAGE_PROVIDER: Symbol('MEDIA_STORAGE_PROVIDER'),
}));

describe('MediaFamilyRunner video workflow', () => {
  const context: ExecutionContext = Object.freeze({
    orgSlug: 'org',
    userId: 'user',
    conversationId: 'conversation',
    agentSlug: 'video-agent',
    agentType: 'media',
    provider: 'google',
    model: 'google/veo-3.1-generate-preview',
  });
  const definition: AgentDefinition = {
    id: 'agent-id',
    slug: 'video-agent',
    name: 'Video agent',
    agentType: 'media',
    status: 'active',
    outputType: 'video',
    mediaConfig: {
      type: 'video',
      duration: 8,
      aspectRatio: '16:9',
      resolution: '1080p',
    },
  };
  const data: InvokeData = { content: 'A camera orbiting a lighthouse' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('polls an OpenRouter job, stores the completed bytes, and passes context whole', async () => {
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback: (_: void) => void) => {
        callback();
        return 0 as unknown as NodeJS.Timeout;
      });
    const videoData = Buffer.from('video-bytes');
    const llmService = {
      generateVideo: jest.fn().mockResolvedValue({
        operationId: 'video-job-1',
        status: 'pending',
      }),
      pollVideoStatus: jest.fn().mockResolvedValue({
        operationId: 'video-job-1',
        status: 'completed',
        videoData,
      }),
    } as unknown as LLMServiceProvider;
    const mediaStorage = {
      storeGeneratedMedia: jest.fn().mockResolvedValue({
        assetId: 'asset-1',
        url: '/assets/video.mp4',
      }),
    } as unknown as MediaStorageProvider;
    const outboundUrlValidator = {
      assertSafe: jest.fn(),
    };
    const runner = new MediaFamilyRunner(
      llmService,
      mediaStorage,
      outboundUrlValidator as never,
    );

    const result = await runner.invoke(definition, context, data);

    expect(llmService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ executionContext: context }),
    );
    expect(llmService.pollVideoStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'video-job-1',
        executionContext: context,
      }),
    );
    expect(mediaStorage.storeGeneratedMedia).toHaveBeenCalledWith(
      videoData,
      context,
      expect.objectContaining({ mime: 'video/mp4' }),
    );
    expect(result).toMatchObject({
      content: '/assets/video.mp4',
      outputType: 'video',
      metadata: { assetId: 'asset-1' },
    });
  });

  it('rejects a provider URL that resolves to a private network before download', async () => {
    const llmService = {
      generateVideo: jest.fn().mockResolvedValue({
        status: 'completed',
        videoUrl: 'http://169.254.169.254/latest/meta-data',
      }),
    } as unknown as LLMServiceProvider;
    const mediaStorage = {
      downloadAndStore: jest.fn(),
    } as unknown as MediaStorageProvider;
    const outboundUrlValidator = {
      assertSafe: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('private network rejected'),
        ),
    };
    const runner = new MediaFamilyRunner(
      llmService,
      mediaStorage,
      outboundUrlValidator as never,
    );

    await expect(runner.invoke(definition, context, data)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(outboundUrlValidator.assertSafe).toHaveBeenCalledWith(
      'http://169.254.169.254/latest/meta-data',
    );
    expect(mediaStorage.downloadAndStore).not.toHaveBeenCalled();
  });
});
