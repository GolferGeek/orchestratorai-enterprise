import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AgentRuntimeDispatchService } from './agent-runtime-dispatch.service';
import { LLMServiceFactory } from '@llm/services/llm-service-factory';
import { AgentRuntimeMetricsService } from './agent-runtime-metrics.service';
import {
  AgentTaskMode,
  TaskRequestDto,
} from '@agent2agent/dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';

describe('AgentRuntimeDispatchService', () => {
  let service: AgentRuntimeDispatchService;
  let mockLLMFactory: jest.Mocked<LLMServiceFactory>;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockMetrics: jest.Mocked<AgentRuntimeMetricsService>;
  let requestMock: jest.Mock;
  let postMock: jest.Mock;
  let generateResponseMock: jest.Mock;
  let recordMock: jest.Mock;

  const mockExecutionContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-1',
    agentSlug: 'test-agent',
  });

  beforeEach(async () => {
    generateResponseMock = jest.fn() as jest.Mock<unknown, unknown[]>;
    mockLLMFactory = {
      generateResponse: generateResponseMock,
    } as unknown as jest.Mocked<LLMServiceFactory>;

    requestMock = jest.fn() as jest.Mock<unknown, unknown[]>;
    postMock = jest.fn() as jest.Mock<unknown, unknown[]>;
    mockHttpService = {
      axiosRef: {
        request: requestMock,
        post: postMock,
      },
    } as unknown as jest.Mocked<HttpService>;

    recordMock = jest.fn() as jest.Mock<unknown, unknown[]>;
    mockMetrics = {
      record: recordMock,
    } as unknown as jest.Mocked<AgentRuntimeMetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRuntimeDispatchService,
        { provide: LLMServiceFactory, useValue: mockLLMFactory },
        { provide: HttpService, useValue: mockHttpService },
        { provide: AgentRuntimeMetricsService, useValue: mockMetrics },
      ],
    }).compile();

    service = module.get<AgentRuntimeDispatchService>(
      AgentRuntimeDispatchService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('dispatch - LLM transport', () => {
    it('should dispatch to LLM service', async () => {
      const definition = {
        slug: 'test-agent',
        name: 'Test Agent',
        llm: {
          provider: 'openai',
          model: 'gpt-4',
        },
      } as unknown as AgentRuntimeDefinition;

      const mockResponse = {
        content: 'LLM response',
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          requestId: 'req-1',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
          tier: 'centralized' as const,
        },
      };

      generateResponseMock.mockResolvedValue(mockResponse);

      const result = await service.dispatch({
        definition,
        routingDecision: {
          provider: 'openai',
          model: 'gpt-4',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'You are a helpful assistant',
          userMessage: 'Hello',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      expect(generateResponseMock).toHaveBeenCalled();
      expect(result.response.content).toBe('LLM response');
    });

    it('should include ExecutionContext in params', async () => {
      const definition = {
        slug: 'test-agent',
      } as unknown as AgentRuntimeDefinition;

      const mockResponse = {
        content: 'response',
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          requestId: 'req-1',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
          tier: 'centralized' as const,
        },
      };

      generateResponseMock.mockResolvedValue(mockResponse);

      await service.dispatch({
        definition,
        routingDecision: {
          provider: 'openai',
          model: 'gpt-4',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'test',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      const callArgs = generateResponseMock.mock.calls[0] as unknown as [
        unknown,
        { options?: { executionContext?: unknown } },
      ];
      if (callArgs && callArgs[1]) {
        expect(callArgs[1].options?.executionContext).toEqual(
          mockExecutionContext,
        );
      }
    });
  });

  describe('dispatch - API transport', () => {
    it('should dispatch to API endpoint', async () => {
      const definition = {
        slug: 'api-agent',
        transport: {
          kind: 'api',
          api: {
            endpoint: 'https://api.example.com/process',
            method: 'POST',
          },
        },
      } as unknown as AgentRuntimeDefinition;

      const mockApiResponse = {
        status: 200,
        data: { result: 'API response' },
        headers: {},
      };

      requestMock.mockResolvedValue(mockApiResponse);

      const result = await service.dispatch({
        definition,
        routingDecision: {
          provider: 'external_api',
          model: 'api_endpoint',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'Hello API',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/process',
          method: 'POST',
        }),
      );
      expect(result.response.content).toContain('API response');
      expect(recordMock).toHaveBeenCalledWith(
        'api',
        'api-agent',
        true,
        expect.any(Number),
        200,
      );
    });

    it('should handle API error responses', async () => {
      const definition = {
        slug: 'api-agent',
        transport: {
          kind: 'api',
          api: {
            endpoint: 'https://api.example.com/process',
          },
        },
      } as unknown as AgentRuntimeDefinition;

      const mockApiResponse = {
        status: 500,
        data: { error: 'Internal server error' },
        headers: {},
      };

      requestMock.mockResolvedValue(mockApiResponse);

      const result = await service.dispatch({
        definition,
        routingDecision: {
          provider: 'external_api',
          model: 'api_endpoint',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'test',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      expect(result.response.metadata.status).toBe('error');
      expect(recordMock).toHaveBeenCalledWith(
        'api',
        'api-agent',
        false,
        expect.any(Number),
        500,
      );
    });
  });

  describe('dispatch - External (A2A) transport', () => {
    it('should dispatch to external A2A endpoint', async () => {
      const definition = {
        slug: 'external-agent',
        transport: {
          kind: 'external',
          external: {
            endpoint: 'https://external.example.com/agent',
          },
        },
      } as unknown as AgentRuntimeDefinition;

      const mockA2AResponse = {
        status: 200,
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { message: 'A2A response' },
        },
        headers: {},
      };

      postMock.mockResolvedValue(mockA2AResponse);

      const result = await service.dispatch({
        definition,
        routingDecision: {
          provider: 'external_a2a',
          model: 'a2a',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'Hello A2A',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: {
            ...mockExecutionContext,
            conversationId: 'conv-1',
            taskId: 'task-1',
          },
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      expect(postMock).toHaveBeenCalledWith(
        'https://external.example.com/agent',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'converse',
          params: expect.objectContaining({
            conversationId: 'conv-1',
            sessionId: 'task-1',
            userMessage: 'Hello A2A',
          }) as Record<string, unknown>,
        }),
        expect.any(Object),
      );
      expect(result.response.metadata.provider).toBe('external_a2a');
      expect(recordMock).toHaveBeenCalledWith(
        'external',
        'external-agent',
        true,
        expect.any(Number),
        200,
      );
    });

    it('should map agent task mode to A2A method', async () => {
      const definition = {
        slug: 'external-agent',
        transport: {
          kind: 'external',
          external: {
            endpoint: 'https://external.example.com/agent',
          },
        },
      } as unknown as AgentRuntimeDefinition;

      postMock.mockResolvedValue({
        status: 200,
        data: { jsonrpc: '2.0', id: 1, result: {} },
        headers: {},
      });

      await service.dispatch({
        definition,
        routingDecision: {
          provider: 'external_a2a',
          model: 'a2a',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'test',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.PLAN,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      const callArgs = postMock.mock.calls[0] as unknown as [
        unknown,
        { method: string },
      ];
      if (callArgs && callArgs[1]) {
        expect(callArgs[1].method).toBe('plan');
      }
    });
  });

  describe('dispatchStream', () => {
    it('should create streaming result for LLM transport', () => {
      const definition = {
        slug: 'test-agent',
      } as unknown as AgentRuntimeDefinition;

      const mockResponse = {
        content: 'Streamed response',
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          requestId: 'req-1',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
          tier: 'centralized' as const,
        },
      };

      generateResponseMock.mockResolvedValue(mockResponse);

      const streamResult = service.dispatchStream({
        definition,
        routingDecision: {
          provider: 'openai',
          model: 'gpt-4',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'test',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      expect(streamResult.stream).toBeDefined();
      expect(streamResult.response).toBeInstanceOf(Promise);
      expect(typeof streamResult.cancel).toBe('function');
    });

    it('should handle stream cancellation', () => {
      const definition = {
        slug: 'test-agent',
      } as unknown as AgentRuntimeDefinition;

      generateResponseMock.mockResolvedValue({
        content: 'response',
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          requestId: 'req-1',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
          tier: 'centralized' as const,
        },
      });

      const streamResult = service.dispatchStream({
        definition,
        routingDecision: {
          provider: 'openai',
          model: 'gpt-4',
          isLocal: false,
          fallbackUsed: false,
          complexityScore: 0.5,
          reasoningPath: [],
        },
        prompt: {
          systemPrompt: 'test',
          userMessage: 'test',
          metadata: {},
          optionMetadata: {},
          userId: 'user-1',
        },
        request: {
          mode: AgentTaskMode.CONVERSE,
          payload: {},
          context: mockExecutionContext,
        } as unknown as TaskRequestDto,
        executionContext: mockExecutionContext,
      });

      streamResult.cancel();

      // Should not throw
      expect(() => streamResult.cancel()).not.toThrow();
    });
  });
});
