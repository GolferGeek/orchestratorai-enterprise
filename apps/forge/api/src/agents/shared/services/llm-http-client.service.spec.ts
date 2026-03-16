import { Test, TestingModule } from '@nestjs/testing';
import {
  LLMHttpClientService,
  LLMCallRequest,
} from './llm-http-client.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit tests for LLMHttpClientService
 *
 * Tests the centralized LLM client that calls the LLM provider plane directly.
 */
describe('LLMHttpClientService', () => {
  let service: LLMHttpClientService;
  let mockLlmService: { generateResponse: jest.Mock };

  beforeEach(async () => {
    mockLlmService = {
      generateResponse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMHttpClientService,
        {
          provide: LLM_SERVICE,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<LLMHttpClientService>(LLMHttpClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('callLLM', () => {
    const mockContext = createMockExecutionContext({
      userId: 'test-user-123',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const validRequest: LLMCallRequest = {
      context: mockContext,
      systemMessage: 'You are a helpful assistant',
      userMessage: 'Hello, world!',
      callerName: 'test-caller',
    };

    it('should make successful LLM call and return string response', async () => {
      mockLlmService.generateResponse.mockResolvedValue(
        'Hello! How can I help you today?',
      );

      const result = await service.callLLM(validRequest);

      expect(result.text).toBe('Hello! How can I help you today?');
      expect(result.usage).toBeUndefined();

      expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
        'You are a helpful assistant',
        'Hello, world!',
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 3500,
          callerType: 'langgraph',
          callerName: 'test-caller',
          executionContext: mockContext,
        }),
      );
    });

    it('should handle LLMResponse with metadata', async () => {
      mockLlmService.generateResponse.mockResolvedValue({
        content: 'Response with metadata',
        metadata: {
          usage: {
            inputTokens: 10,
            outputTokens: 8,
            totalTokens: 18,
          },
        },
      });

      const result = await service.callLLM(validRequest);

      expect(result.text).toBe('Response with metadata');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      });
    });

    it('should throw error when userId is missing in context', async () => {
      const contextWithoutUserId = createMockExecutionContext({
        userId: '',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const requestWithoutUserId: LLMCallRequest = {
        context: contextWithoutUserId,
        userMessage: 'Hello',
      };

      await expect(service.callLLM(requestWithoutUserId)).rejects.toThrow(
        'userId is required in ExecutionContext for LLM calls',
      );
    });

    it('should use default values for optional parameters', async () => {
      const minimalContext = createMockExecutionContext({
        userId: 'user-123',
        provider: 'openai',
        model: 'gpt-4',
      });

      const minimalRequest: LLMCallRequest = {
        context: minimalContext,
        userMessage: 'Test message',
      };

      mockLlmService.generateResponse.mockResolvedValue('OK');

      await service.callLLM(minimalRequest);

      expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
        '',
        'Test message',
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 3500,
          callerName: 'workflow',
        }),
      );
    });

    it('should use custom temperature and maxTokens when provided', async () => {
      const request: LLMCallRequest = {
        context: mockContext,
        userMessage: 'Test',
        temperature: 0.2,
        maxTokens: 1000,
      };

      mockLlmService.generateResponse.mockResolvedValue('OK');

      await service.callLLM(request);

      expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
        '',
        'Test',
        expect.objectContaining({
          temperature: 0.2,
          maxTokens: 1000,
        }),
      );
    });

    it('should propagate errors from the LLM service', async () => {
      mockLlmService.generateResponse.mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      await expect(service.callLLM(validRequest)).rejects.toThrow(
        'LLM service unavailable',
      );
    });
  });
});
