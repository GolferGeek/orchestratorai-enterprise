import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import {
  LLMUsageReporterService,
  LLMUsageData,
} from './llm-usage-reporter.service';

/**
 * Unit tests for LLMUsageReporterService
 *
 * Tests the service that reports LLM usage from tools
 * that call specialized models directly (e.g., Ollama/SQLCoder).
 */
describe('LLMUsageReporterService', () => {
  let service: LLMUsageReporterService;
  let httpService: jest.Mocked<HttpService>;

  const createMockAxiosResponse = <T = unknown>(
    data: T,
    status = 200,
  ): AxiosResponse<T> => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: {} as never },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMUsageReporterService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                API_PORT: '6100',
                API_HOST: 'test-api-host',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LLMUsageReporterService>(LLMUsageReporterService);
    httpService = module.get(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should throw error when API_PORT is not configured', async () => {
      const moduleRef = Test.createTestingModule({
        providers: [
          LLMUsageReporterService,
          {
            provide: HttpService,
            useValue: { post: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      });

      await expect(moduleRef.compile()).rejects.toThrow(
        'API_PORT environment variable is required',
      );
    });
  });

  describe('reportUsage', () => {
    const validUsage: LLMUsageData = {
      provider: 'ollama',
      model: 'sqlcoder',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      userId: 'user-123',
      callerType: 'langgraph-tool',
      callerName: 'sql-query-tool',
      threadId: 'thread-123',
      conversationId: 'conv-123',
      latencyMs: 500,
    };

    it('should report usage successfully', async () => {
      const mockResponse = createMockAxiosResponse({ success: true });
      httpService.post.mockReturnValue(of(mockResponse));

      await service.reportUsage(validUsage);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://test-api-host:6100/llm/usage',
        expect.objectContaining({
          provider: 'ollama',
          model: 'sqlcoder',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          userId: 'user-123',
          callerType: 'langgraph-tool',
          callerName: 'sql-query-tool',
          threadId: 'thread-123',
          conversationId: 'conv-123',
          latencyMs: 500,
          timestamp: expect.any(String),
        }),
        expect.objectContaining({
          timeout: 2000,
          validateStatus: expect.any(Function),
        }),
      );
    });

    it('should not throw on HTTP error (non-blocking)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      // Should not throw
      await expect(service.reportUsage(validUsage)).resolves.not.toThrow();
    });

    it('should handle non-2xx status codes without throwing', async () => {
      const mockResponse = createMockAxiosResponse(
        { error: 'Bad Request' },
        400,
      );
      httpService.post.mockReturnValue(of(mockResponse));

      await expect(service.reportUsage(validUsage)).resolves.not.toThrow();
    });

    it('should include optional metadata when provided', async () => {
      const usageWithMetadata: LLMUsageData = {
        ...validUsage,
        metadata: {
          queryType: 'SELECT',
          tableCount: 3,
        },
      };

      const mockResponse = createMockAxiosResponse({ success: true });
      httpService.post.mockReturnValue(of(mockResponse));

      await service.reportUsage(usageWithMetadata);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: {
            queryType: 'SELECT',
            tableCount: 3,
          },
        }),
        expect.any(Object),
      );
    });
  });

  describe('reportOllamaUsage', () => {
    it('should report Ollama usage with provider set to ollama', async () => {
      const mockResponse = createMockAxiosResponse({ success: true });
      httpService.post.mockReturnValue(of(mockResponse));

      await service.reportOllamaUsage({
        model: 'llama2',
        promptTokens: 50,
        completionTokens: 25,
        userId: 'user-123',
        callerName: 'test-tool',
        conversationId: 'conv-456',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: 'ollama',
          model: 'llama2',
          totalTokens: 75,
          callerType: 'langgraph-tool',
          callerName: 'test-tool',
        }),
        expect.any(Object),
      );
    });

    it('should handle optional parameters', async () => {
      const mockResponse = createMockAxiosResponse({ success: true });
      httpService.post.mockReturnValue(of(mockResponse));

      await service.reportOllamaUsage({
        model: 'codellama',
        promptTokens: 100,
        completionTokens: 200,
        userId: 'user-456',
        callerName: 'code-tool',
        threadId: 'thread-789',
        conversationId: 'conv-789',
        latencyMs: 1500,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          threadId: 'thread-789',
          conversationId: 'conv-789',
          latencyMs: 1500,
        }),
        expect.any(Object),
      );
    });
  });

  describe('reportSQLCoderUsage', () => {
    it('should report SQLCoder usage with correct model and caller', async () => {
      const mockResponse = createMockAxiosResponse({ success: true });
      httpService.post.mockReturnValue(of(mockResponse));

      await service.reportSQLCoderUsage({
        promptTokens: 200,
        completionTokens: 100,
        userId: 'user-123',
        conversationId: 'conv-sql',
        latencyMs: 800,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          provider: 'ollama',
          model: 'sqlcoder',
          callerName: 'sql-query-tool',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          latencyMs: 800,
        }),
        expect.any(Object),
      );
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      // ~4 characters per token
      expect(service.estimateTokens('1234')).toBe(1);
      expect(service.estimateTokens('12345678')).toBe(2);
      expect(service.estimateTokens('Hello, world!')).toBe(4); // 13 chars / 4 = 3.25 -> 4
    });

    it('should return 1 for empty string', () => {
      expect(service.estimateTokens('')).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000);
      expect(service.estimateTokens(longText)).toBe(250);
    });
  });
});
