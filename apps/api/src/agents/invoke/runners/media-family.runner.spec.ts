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
    version: '1.0.0',
    updatedAt: '2026-09-28T00:00:00.000Z',
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

describe('MediaFamilyRunner image workflow', () => {
  const context: ExecutionContext = Object.freeze({
    orgSlug: 'marketing',
    userId: 'user',
    conversationId: 'conversation',
    agentSlug: 'infographic-agent',
    agentType: 'media',
    provider: 'openrouter',
    model: 'recraft/recraft-v4.1-vector',
  });
  const definition = (mediaConfig: Record<string, unknown>): AgentDefinition => ({
    id: 'infographic-agent',
    slug: 'infographic-agent',
    name: 'Infographic agent',
    version: '1.0.0',
    updatedAt: '2026-10-01T00:00:00.000Z',
    agentType: 'media',
    status: 'active',
    outputType: 'image',
    mediaConfig: { type: 'image', ...mediaConfig },
  });
  const data: InvokeData = { content: 'Three-way match' };
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  function runnerWith(image: { data: Buffer; metadata?: Record<string, unknown> }) {
    const llm = { generateImage: jest.fn(async () => ({ images: [image] })) };
    const storage = { storeGeneratedMedia: jest.fn(async () => ({ assetId: 'a1', url: 'https://assets/a1.svg' })) };
    const runner = new MediaFamilyRunner(llm as unknown as LLMServiceProvider, storage as unknown as MediaStorageProvider, {} as never);
    return { runner, llm, storage };
  }

  it('asks for the agent\'s format and stores the image as the type the model returned', async () => {
    const { runner, llm, storage } = runnerWith({ data: svg, metadata: { mimeType: 'image/svg+xml' } });
    const out = await runner.invoke(definition({ format: 'svg', size: '1024x1024' }), context, data);

    expect(llm.generateImage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openrouter', model: 'recraft/recraft-v4.1-vector', outputFormat: 'svg', size: '1024x1024', executionContext: context }));
    expect(storage.storeGeneratedMedia).toHaveBeenCalledWith(svg, context, expect.objectContaining({ mime: 'image/svg+xml' }));
    expect(out).toMatchObject({ outputType: 'image', content: 'https://assets/a1.svg', metadata: { mimeType: 'image/svg+xml' } });
  });

  it('sends no format when the agent sets none, and defaults size, quality and style', async () => {
    const { runner, llm } = runnerWith({ data: Buffer.from('png'), metadata: { mimeType: 'image/png' } });
    await runner.invoke(definition({}), context, data);
    const params = (llm.generateImage.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params).toMatchObject({ size: '1024x1024', quality: 'standard', style: 'natural' });
    expect(params).not.toHaveProperty('outputFormat');
  });

  it('refuses an invalid image setting, and an image whose type the provider did not say', async () => {
    await expect(runnerWith({ data: svg }).runner.invoke(definition({ format: 'gif' }), context, data)).rejects.toThrow("mediaConfig.format must be 'png', 'jpeg', 'webp' or 'svg'");
    await expect(runnerWith({ data: svg }).runner.invoke(definition({ size: '999x1' }), context, data)).rejects.toThrow('mediaConfig.size must be one of');
    await expect(runnerWith({ data: svg }).runner.invoke(definition({}), context, data)).rejects.toThrow('openrouter did not say what type of image recraft/recraft-v4.1-vector returned');
  });
});
