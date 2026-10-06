import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { OpenRouterBackendService } from '../openrouter-llm.service';
import type { OpenRouterClient } from '../../../openrouter/openrouter.client';

describe('OpenRouterBackendService video', () => {
  const context = createMockExecutionContext({
    provider: 'openrouter',
    model: 'google/veo-3.1-fast',
  });
  const job = (status: string, extra: Record<string, unknown> = {}) => ({
    id: 'job-1',
    pollingUrl: 'p',
    status,
    unsignedUrls: [],
    ...extra,
  });
  const client = {
    assertConfigured: jest.fn(),
    submitVideo: jest.fn(),
    pollVideo: jest.fn(),
    downloadVideo: jest.fn(),
  };
  const service = () => {
    const s = new OpenRouterBackendService(
      { provider: 'openrouter', model: 'unused' },
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      client as unknown as OpenRouterClient,
    );
    const trackUsage = jest
      .spyOn(s as unknown as { trackUsage: () => Promise<void> }, 'trackUsage')
      .mockResolvedValue(undefined);
    return { s, trackUsage };
  };

  beforeEach(() => jest.clearAllMocks());

  it("submits the job with the agent's settings and the model from the context", async () => {
    client.submitVideo.mockResolvedValue(job('pending'));
    const { s } = service();
    const response = await s.generateVideo(context, {
      prompt: 'A fox',
      duration: 4,
      aspectRatio: '16:9',
      resolution: '4k',
      generateAudio: false,
    });
    expect(client.submitVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/veo-3.1-fast',
        prompt: 'A fox',
        duration: 4,
        aspectRatio: '16:9',
        resolution: '4K',
        generateAudio: false,
      }),
    );
    expect(response).toMatchObject({ operationId: 'job-1', status: 'pending' });
  });

  it('refuses settings OpenRouter video does not take, instead of dropping them', async () => {
    const { s } = service();
    await expect(
      s.generateVideo(context, { prompt: 'x', extendVideoUrl: 'https://v' }),
    ).rejects.toThrow('does not take a video to extend');
    expect(client.submitVideo).not.toHaveBeenCalled();
  });

  it('downloads a finished clip and records its cost; a running job only reports its state', async () => {
    const { s, trackUsage } = service();
    client.pollVideo.mockResolvedValueOnce(job('in_progress'));
    expect(await s.pollVideoStatus('job-1', context)).toMatchObject({
      status: 'processing',
    });
    expect(client.downloadVideo).not.toHaveBeenCalled();

    client.pollVideo.mockResolvedValueOnce(job('completed', { cost: 0.32 }));
    client.downloadVideo.mockResolvedValueOnce(Buffer.from('mp4'));
    const done = await s.pollVideoStatus('job-1', context);
    expect(done).toMatchObject({
      status: 'completed',
      videoMetadata: { mimeType: 'video/mp4', sizeBytes: 3 },
    });
    expect(done.videoData?.toString()).toBe('mp4');
    expect(trackUsage).toHaveBeenCalledWith(
      context,
      'openrouter',
      'google/veo-3.1-fast',
      0,
      0,
      0.32,
      expect.objectContaining({ requestId: 'job-1' }),
    );
  });

  it('reports a failed job with its reason', async () => {
    client.pollVideo.mockResolvedValueOnce(
      job('failed', { error: 'content policy' }),
    );
    expect(await service().s.pollVideoStatus('job-1', context)).toMatchObject({
      status: 'failed',
      error: { code: 'OPENROUTER_VIDEO_FAILED', message: 'content policy' },
    });
  });
});
