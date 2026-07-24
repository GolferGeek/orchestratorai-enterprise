import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { OpenRouterClient } from '../../openrouter/openrouter.client';

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;
  let httpService: HttpService;

  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_SITE_URL = 'https://orchestratorai.test';
    process.env.OPENROUTER_SITE_NAME = 'OrchestratorAI Test';
    process.env.OPENROUTER_VIDEO_ENABLED = 'false';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterClient,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    client = module.get<OpenRouterClient>(OpenRouterClient);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_SITE_URL;
    delete process.env.OPENROUTER_SITE_NAME;
    delete process.env.OPENROUTER_VIDEO_ENABLED;
  });

  describe('chatCompletion', () => {
    it('sends request and parses response', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: 'gen-123',
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello world' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            cost: 0.0001,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'x-openrouter-cost': '0.0001' }),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      const result = await client.chatCompletion({
        model: 'gpt-4o',
        sessionId: 'conversation-1',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(result.content).toBe('Hello world');
      expect(result.model).toBe('gpt-4o');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.cost).toBe(0.0001);
      expect(result.requestId).toBe('gen-123');
    });

    it('throws when no API key', async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        client.chatCompletion({
          model: 'gpt-4o',
          sessionId: 'conversation-1',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('OPENROUTER_API_KEY is required');
    });

    it('throws when no choices returned', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: 'gen-123',
          model: 'gpt-4o',
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      await expect(
        client.chatCompletion({
          model: 'gpt-4o',
          sessionId: 'conversation-1',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('OpenRouter returned no text completion');
    });

    it('propagates HTTP errors', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => new Error('Request failed with status 429')),
      );

      await expect(
        client.chatCompletion({
          model: 'gpt-4o',
          sessionId: 'conversation-1',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('Request failed with status 429');
    });
  });

  describe('imageGeneration', () => {
    it('sends image request with modalities', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: [
            {
              b64_json: 'iVBORw0KGgoAAAANSUhEUg==',
              media_type: 'image/png',
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 0,
            total_tokens: 20,
            cost: 0.04,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'x-openrouter-cost': '0.04' }),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      const result = await client.imageGeneration({
        model: 'dall-e-3',
        prompt: 'A cat',
      });

      expect(result.imageBase64).toBe('iVBORw0KGgoAAAANSUhEUg==');
      expect(result.cost).toBe(0.04);
    });
  });

  describe('video generation', () => {
    it('requires an explicit retention acknowledgement', async () => {
      process.env.OPENROUTER_VIDEO_ENABLED = 'true';
      process.env.OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED = 'false';

      await expect(
        client.submitVideo({
          model: 'google/veo-3.1-generate-preview',
          prompt: 'A camera orbiting a lighthouse',
        }),
      ).rejects.toThrow(
        'OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED=true is required',
      );
    });

    it('submits a native asynchronous video job', async () => {
      process.env.OPENROUTER_VIDEO_ENABLED = 'true';
      process.env.OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED = 'true';
      (httpService.post as jest.Mock).mockReturnValue(
        of({
          data: {
            id: 'video-job-1',
            polling_url: '/api/v1/videos/video-job-1',
            status: 'queued',
          },
        }),
      );

      const job = await client.submitVideo({
        model: 'google/veo-3.1-generate-preview',
        prompt: 'A camera orbiting a lighthouse',
        duration: 8,
        aspectRatio: '16:9',
        resolution: '1080p',
      });

      expect(job).toMatchObject({ id: 'video-job-1', status: 'queued' });
      expect(httpService.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/videos',
        expect.objectContaining({
          model: 'google/veo-3.1-generate-preview',
          duration: 8,
          aspect_ratio: '16:9',
          resolution: '1080p',
        }),
        expect.any(Object),
      );
    });
  });
});
