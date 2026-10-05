import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import { OllamaCloudClient } from '../ollama-cloud.client';

describe('OllamaCloudClient', () => {
  let client: OllamaCloudClient;
  let httpService: HttpService;

  beforeEach(async () => {
    process.env.OLLAMA_CLOUD_BASE_URL = 'https://ollama.com';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaCloudClient,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    client = module.get<OllamaCloudClient>(OllamaCloudClient);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    delete process.env.OLLAMA_CLOUD_BASE_URL;
  });

  describe('chatCompletion', () => {
    it('refuses to call anywhere when OLLAMA_CLOUD_BASE_URL is not set', async () => {
      delete process.env.OLLAMA_CLOUD_BASE_URL;
      await expect(client.chatCompletion({ model: 'm', messages: [{ role: 'user', content: 'Hi' }] })).rejects.toThrow(
        'OLLAMA_CLOUD_BASE_URL is not set',
      );
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('sends request and parses response', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: 'chat-456',
          model: 'llama-3.3-70b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Open-source response' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 8,
            total_tokens: 23,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      const result = await client.chatCompletion({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(result.content).toBe('Open-source response');
      expect(result.model).toBe('llama-3.3-70b');
      expect(result.usage.promptTokens).toBe(15);
      expect(result.usage.completionTokens).toBe(8);
      expect(result.requestId).toBe('chat-456');
    });

    it('works without API key (for self-hosted)', async () => {
      delete process.env.OLLAMA_CLOUD_API_KEY;

      const mockResponse: AxiosResponse = {
        data: {
          id: 'chat-789',
          model: 'llama-3.3-70b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      const result = await client.chatCompletion({
        model: 'llama-3.3-70b',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Hello');

      // Verify no Authorization header was sent
      const postCall = (httpService.post as jest.Mock).mock.calls[0];
      expect(postCall[2].headers['Authorization']).toBeUndefined();
    });

    it('uses custom base URL', async () => {
      process.env.OLLAMA_CLOUD_BASE_URL = 'http://custom:11434/v1';

      const mockResponse: AxiosResponse = {
        data: {
          id: 'chat-000',
          model: 'llama-3.3-70b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Custom' },
              finish_reason: 'stop',
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      await client.chatCompletion({
        model: 'llama-3.3-70b',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const postCall = (httpService.post as jest.Mock).mock.calls[0];
      expect(postCall[0]).toContain('http://custom:11434/v1');

      delete process.env.OLLAMA_CLOUD_BASE_URL;
    });

    it('throws when no choices returned', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: 'chat-err',
          model: 'llama-3.3-70b',
          choices: [],
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
      };

      (httpService.post as jest.Mock).mockReturnValue(of(mockResponse));

      await expect(
        client.chatCompletion({
          model: 'llama-3.3-70b',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('Ollama Cloud returned no choices');
    });

    it('propagates HTTP errors', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      await expect(
        client.chatCompletion({
          model: 'llama-3.3-70b',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('listModels', () => {
    const originalBase = process.env.OLLAMA_CLOUD_BASE_URL;
    const originalKey = process.env.OLLAMA_CLOUD_API_KEY;
    beforeEach(() => {
      process.env.OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/v1';
      process.env.OLLAMA_CLOUD_API_KEY = 'test-key';
    });
    afterEach(() => {
      if (originalBase === undefined) delete process.env.OLLAMA_CLOUD_BASE_URL;
      else process.env.OLLAMA_CLOUD_BASE_URL = originalBase;
      if (originalKey === undefined) delete process.env.OLLAMA_CLOUD_API_KEY;
      else process.env.OLLAMA_CLOUD_API_KEY = originalKey;
    });

    it('reads /api/tags only, never /v1/models, with the API key', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of({ data: { models: [{ name: 'kimi-k2.6' }, { name: 'glm-5.2' }] } }),
      );

      await expect(client.listModels()).resolves.toEqual([
        { id: 'kimi-k2.6', name: 'kimi-k2.6', isLocal: true },
        { id: 'glm-5.2', name: 'glm-5.2', isLocal: true },
      ]);
      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://ollama.com/api/tags',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
      );
    });

    it('lists only models that can chat when capabilities are reported', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of({
          data: {
            models: [
              { name: 'clef', capabilities: ['decision'] },
              { name: 'qwen3.6', capabilities: ['completion', 'tools'] },
            ],
          },
        }),
      );

      await expect(client.listModels()).resolves.toEqual([
        { id: 'qwen3.6', name: 'qwen3.6', isLocal: true },
      ]);
    });

    it('throws, naming the URL, when Ollama Cloud does not answer', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        throwError(() => new Error('Request failed with status code 401')),
      );

      await expect(client.listModels()).rejects.toThrow(
        'Cannot list Ollama Cloud models: https://ollama.com/api/tags did not answer (Request failed with status code 401)',
      );
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('throws when /api/tags answers without a models array', async () => {
      (httpService.get as jest.Mock).mockReturnValue(of({ data: {} }));

      await expect(client.listModels()).rejects.toThrow(
        'returned no "models" array',
      );
    });
  });
});
