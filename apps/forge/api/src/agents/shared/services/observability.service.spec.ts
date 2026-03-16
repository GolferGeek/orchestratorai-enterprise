import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import {
  ObservabilityService,
  LangGraphObservabilityEvent,
  LangGraphStatus,
} from './observability.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Unit and Integration tests for ObservabilityService
 *
 * Unit tests: Mock HttpService to test all convenience methods and error handling
 * Integration tests: Make REAL HTTP calls to verify webhook integration
 *
 * Prerequisites for integration tests:
 * - API server running on configured API_HOST:API_PORT
 * - Set INTEGRATION_TESTS=true to run these tests
 */

// Skip integration tests if environment is not configured
const shouldRunIntegration = process.env.INTEGRATION_TESTS === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

// Unit tests - mock HTTP service
describe('ObservabilityService - Unit Tests', () => {
  let service: ObservabilityService;
  let httpService: jest.Mocked<HttpService>;
  let _configService: jest.Mocked<ConfigService>;

  // Helper to create mock Axios response
  const createMockAxiosResponse = <T = unknown>(
    data: T,
    status = 200,
    statusText = 'OK',
  ): AxiosResponse<T> => ({
    data,
    status,
    statusText,
    headers: {},
    config: { headers: {} as never },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
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
                API_PORT: '8080',
                API_HOST: 'test-api-host',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ObservabilityService>(ObservabilityService);
    httpService = module.get(HttpService);
    _configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error when API_PORT is not configured', async () => {
      const moduleRef = Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ObservabilityService,
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

    it('should initialize with correct API URL', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ObservabilityService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const config: Record<string, string> = {
                  API_PORT: '8080',
                  API_HOST: 'test-api-host',
                };
                return config[key];
              }),
            },
          },
        ],
      }).compile();

      const service = module.get<ObservabilityService>(ObservabilityService);
      expect(service).toBeDefined();
    });

    it('should use default API_HOST when not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ObservabilityService,
          {
            provide: HttpService,
            useValue: { post: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'API_PORT') return '6100';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const serviceWithDefaults =
        module.get<ObservabilityService>(ObservabilityService);
      expect(serviceWithDefaults).toBeDefined();
    });
  });

  describe('emit', () => {
    const mockContext = createMockExecutionContext({
      taskId: 'test-task-123',
      conversationId: 'test-conv-123',
      userId: 'test-user-123',
      agentSlug: 'test-agent',
      orgSlug: 'test-org',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const threadId = 'test-thread-123';

    it('should successfully emit event with required fields', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const event: LangGraphObservabilityEvent = {
        context: mockContext,
        threadId,
        status: 'started',
        message: 'Test message',
      };

      await service.emit(event);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://test-api-host:8080/webhooks/status',
        expect.objectContaining({
          context: mockContext,
          taskId: mockContext.taskId,
          status: 'langgraph.started',
          message: 'Test message',
          mode: 'build',
          userMessage: 'Test message',
          data: expect.objectContaining({
            hook_event_type: 'langgraph.started',
            source_app: 'langgraph',
            threadId,
          }),
        }),
        expect.objectContaining({
          timeout: 2000,
          validateStatus: expect.any(Function),
        }),
      );
    });

    it('should include step and progress in payload', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const event: LangGraphObservabilityEvent = {
        context: mockContext,
        threadId,
        status: 'processing',
        message: 'Processing step 1',
        step: 'analyze-data',
        progress: 50,
      };

      await service.emit(event);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          step: 'analyze-data',
          percent: 50,
        }),
        expect.any(Object),
      );
    });

    it('should include metadata in data field', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const event: LangGraphObservabilityEvent = {
        context: mockContext,
        threadId,
        status: 'tool_calling',
        message: 'Calling tool',
        metadata: {
          toolName: 'sql-query',
          toolInput: { query: 'SELECT * FROM test' },
          customField: 'custom-value',
        },
      };

      await service.emit(event);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            hook_event_type: 'langgraph.tool_calling',
            source_app: 'langgraph',
            threadId,
            toolName: 'sql-query',
            toolInput: { query: 'SELECT * FROM test' },
            customField: 'custom-value',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should not throw when HTTP call fails (non-blocking)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const event: LangGraphObservabilityEvent = {
        context: mockContext,
        threadId,
        status: 'started',
        message: 'Test message',
      };

      // Should not throw - observability failures are non-blocking
      await expect(service.emit(event)).resolves.not.toThrow();
    });

    it('should log warning when HTTP call fails', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const event: LangGraphObservabilityEvent = {
        context: mockContext,
        threadId,
        status: 'started',
        message: 'Test message',
      };

      await service.emit(event);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send observability event'),
      );
    });
  });

  describe('mapStatusToEventType', () => {
    it.each([
      ['started', 'langgraph.started'],
      ['processing', 'langgraph.processing'],
      ['hitl_waiting', 'langgraph.hitl_waiting'],
      ['hitl_resumed', 'langgraph.hitl_resumed'],
      ['completed', 'langgraph.completed'],
      ['failed', 'langgraph.failed'],
      ['tool_calling', 'langgraph.tool_calling'],
      ['tool_completed', 'langgraph.tool_completed'],
    ] as [LangGraphStatus, string][])(
      'should map %s to %s',
      async (status, expectedEventType) => {
        const mockContext = createMockExecutionContext();
        const mockResponse = createMockAxiosResponse({});
        httpService.post.mockReturnValue(of(mockResponse));

        await service.emit({
          context: mockContext,
          threadId: 'test-thread',
          status,
          message: 'Test',
        });

        expect(httpService.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: expectedEventType,
            data: expect.objectContaining({
              hook_event_type: expectedEventType,
            }),
          }),
          expect.any(Object),
        );
      },
    );
  });

  describe('emitStarted', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with started status and default message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitStarted(mockContext, threadId);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.started',
          message: 'Workflow started',
        }),
        expect.any(Object),
      );
    });

    it('should call emit with started status and custom message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitStarted(mockContext, threadId, 'Custom start message');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.started',
          message: 'Custom start message',
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitProgress', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with processing status and message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitProgress(
        mockContext,
        threadId,
        'Processing step 1 of 3',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.processing',
          message: 'Processing step 1 of 3',
        }),
        expect.any(Object),
      );
    });

    it('should include step when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitProgress(mockContext, threadId, 'Analyzing data', {
        step: 'analyze-phase',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          step: 'analyze-phase',
        }),
        expect.any(Object),
      );
    });

    it('should include progress percentage when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitProgress(mockContext, threadId, 'Processing', {
        progress: 75,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          percent: 75,
        }),
        expect.any(Object),
      );
    });

    it('should include metadata when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitProgress(mockContext, threadId, 'Processing', {
        metadata: {
          rowsProcessed: 100,
          totalRows: 200,
        },
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            rowsProcessed: 100,
            totalRows: 200,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include all options when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitProgress(mockContext, threadId, 'Processing phase 2', {
        step: 'writing',
        progress: 60,
        metadata: {
          phase: 'writing',
          type: 'phase_changed',
        },
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Processing phase 2',
          step: 'writing',
          percent: 60,
          data: expect.objectContaining({
            phase: 'writing',
            type: 'phase_changed',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitHitlWaiting', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with hitl_waiting status and default message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitHitlWaiting(mockContext, threadId);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.hitl_waiting',
          message: 'Awaiting human review',
        }),
        expect.any(Object),
      );
    });

    it('should include pendingContent in metadata', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const pendingContent = {
        blogPost: 'Draft blog post content...',
        seoDescription: 'SEO description pending approval...',
      };

      await service.emitHitlWaiting(mockContext, threadId, pendingContent);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            pendingContent,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should use custom message when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitHitlWaiting(
        mockContext,
        threadId,
        null,
        'Custom HITL message',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Custom HITL message',
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitHitlResumed', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it.each(['approve', 'edit', 'reject'] as const)(
      'should call emit with decision: %s',
      async (decision) => {
        const mockResponse = createMockAxiosResponse({});
        httpService.post.mockReturnValue(of(mockResponse));

        await service.emitHitlResumed(mockContext, threadId, decision);

        expect(httpService.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: 'langgraph.hitl_resumed',
            message: `Human review decision: ${decision}`,
            data: expect.objectContaining({
              decision,
            }),
          }),
          expect.any(Object),
        );
      },
    );

    it('should use custom message when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitHitlResumed(
        mockContext,
        threadId,
        'approve',
        'User approved the content',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'User approved the content',
          data: expect.objectContaining({
            decision: 'approve',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitToolCalling', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with tool_calling status and toolName', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitToolCalling(mockContext, threadId, 'sql-query');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.tool_calling',
          message: 'Calling tool: sql-query',
          step: 'sql-query',
          data: expect.objectContaining({
            toolName: 'sql-query',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include toolInput in metadata when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const toolInput = {
        query: 'SELECT * FROM users WHERE active = true',
        database: 'production',
      };

      await service.emitToolCalling(
        mockContext,
        threadId,
        'sql-query',
        toolInput,
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: 'sql-query',
            toolInput,
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitToolCompleted', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should emit success message when success is true', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const toolResult = { rows: 42, executionTime: '125ms' };

      await service.emitToolCompleted(
        mockContext,
        threadId,
        'sql-query',
        true,
        toolResult,
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.tool_completed',
          message: 'Tool completed: sql-query',
          step: 'sql-query',
          data: expect.objectContaining({
            toolName: 'sql-query',
            toolResult,
            success: true,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should emit failure message when success is false', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitToolCompleted(
        mockContext,
        threadId,
        'sql-query',
        false,
        undefined,
        'Query syntax error: unexpected token',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Tool failed: sql-query',
          data: expect.objectContaining({
            toolName: 'sql-query',
            success: false,
            error: 'Query syntax error: unexpected token',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include both toolResult and error fields in metadata', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitToolCompleted(
        mockContext,
        threadId,
        'list-tables',
        true,
        ['users', 'orders', 'products'],
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: 'list-tables',
            toolResult: ['users', 'orders', 'products'],
            success: true,
            error: undefined,
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitCompleted', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with completed status and default message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitCompleted(mockContext, threadId);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.completed',
          message: 'Workflow completed successfully',
        }),
        expect.any(Object),
      );
    });

    it('should include result in metadata when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const result = {
        summary: 'Analysis complete',
        rowCount: 42,
        insights: ['Insight 1', 'Insight 2'],
      };

      await service.emitCompleted(mockContext, threadId, result);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            result,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include duration in metadata when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitCompleted(mockContext, threadId, undefined, 5000);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            duration: 5000,
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include both result and duration when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      const result = { status: 'success', itemsProcessed: 100 };
      await service.emitCompleted(mockContext, threadId, result, 3500);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            result,
            duration: 3500,
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('emitFailed', () => {
    const mockContext = createMockExecutionContext();
    const threadId = 'test-thread-123';

    it('should call emit with failed status and error message', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitFailed(
        mockContext,
        threadId,
        'Database connection failed',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'langgraph.failed',
          message: 'Workflow failed: Database connection failed',
          data: expect.objectContaining({
            error: 'Database connection failed',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should include duration in metadata when provided', async () => {
      const mockResponse = createMockAxiosResponse({});
      httpService.post.mockReturnValue(of(mockResponse));

      await service.emitFailed(
        mockContext,
        threadId,
        'Timeout after 30s',
        30000,
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            error: 'Timeout after 30s',
            duration: 30000,
          }),
        }),
        expect.any(Object),
      );
    });
  });
});

describeIntegration(
  'ObservabilityService - Integration Tests (Real HTTP)',
  () => {
    let service: ObservabilityService;
    let httpService: HttpService;

    // Test context - uses real ExecutionContext structure
    const testContext = createMockExecutionContext({
      taskId: `test-task-${Date.now()}`,
      conversationId: `test-conv-${Date.now()}`,
      userId: 'test-user-integration',
      agentSlug: 'marketing-swarm',
      orgSlug: 'demo-org',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const threadId = testContext.taskId;

    beforeAll(async () => {
      // Create module with REAL HttpModule (no mocking)
      const module: TestingModule = await Test.createTestingModule({
        imports: [HttpModule],
        providers: [
          ObservabilityService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                // Use environment variables or defaults
                const config: Record<string, string> = {
                  API_PORT: process.env.API_PORT || '8080',
                  API_HOST: process.env.API_HOST || 'test-api-host',
                };
                return config[key];
              }),
            },
          },
        ],
      }).compile();

      service = module.get<ObservabilityService>(ObservabilityService);
      httpService = module.get<HttpService>(HttpService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
      expect(httpService).toBeDefined();
    });

    describe('emit - real HTTP calls', () => {
      it('should successfully send event to webhook endpoint', async () => {
        const event: LangGraphObservabilityEvent = {
          context: testContext,
          threadId,
          status: 'started',
          message: 'Integration test - workflow started',
        };

        // Should not throw - webhook should accept the event
        await expect(service.emit(event)).resolves.not.toThrow();
      });

      it('should send event with metadata', async () => {
        const event: LangGraphObservabilityEvent = {
          context: testContext,
          threadId,
          status: 'processing',
          message: 'Integration test - processing with metadata',
          metadata: {
            type: 'phase_changed',
            phase: 'writing',
            customField: 'test-value',
          },
        };

        await expect(service.emit(event)).resolves.not.toThrow();
      });

      it.each([
        'started',
        'processing',
        'hitl_waiting',
        'hitl_resumed',
        'completed',
        'failed',
        'tool_calling',
        'tool_completed',
      ] as LangGraphStatus[])(
        'should send %s event successfully',
        async (status) => {
          const event: LangGraphObservabilityEvent = {
            context: testContext,
            threadId,
            status,
            message: `Integration test - ${status} event`,
          };

          await expect(service.emit(event)).resolves.not.toThrow();
        },
      );
    });

    describe('convenience methods - real HTTP calls', () => {
      it('emitStarted should send started event', async () => {
        await expect(
          service.emitStarted(
            testContext,
            threadId,
            'Integration test started',
          ),
        ).resolves.not.toThrow();
      });

      it('emitProgress should send progress event with step and progress', async () => {
        await expect(
          service.emitProgress(testContext, threadId, 'Processing step 2', {
            step: 'analyze-data',
            progress: 50,
            metadata: { rowsProcessed: 100 },
          }),
        ).resolves.not.toThrow();
      });

      it('emitHitlWaiting should send HITL waiting event', async () => {
        const pendingContent = {
          blogPost: 'Draft blog content for review...',
          seoDescription: 'SEO text pending approval...',
        };

        await expect(
          service.emitHitlWaiting(
            testContext,
            threadId,
            pendingContent,
            'Awaiting human review',
          ),
        ).resolves.not.toThrow();
      });

      it.each(['approve', 'edit', 'reject'] as const)(
        'emitHitlResumed should send HITL resumed with decision: %s',
        async (decision) => {
          await expect(
            service.emitHitlResumed(testContext, threadId, decision),
          ).resolves.not.toThrow();
        },
      );

      it('emitToolCalling should send tool calling event', async () => {
        await expect(
          service.emitToolCalling(testContext, threadId, 'sql-query', {
            query: 'SELECT * FROM test',
          }),
        ).resolves.not.toThrow();
      });

      it('emitToolCompleted should send tool completed event (success)', async () => {
        await expect(
          service.emitToolCompleted(
            testContext,
            threadId,
            'list-tables',
            true,
            ['users', 'orders'],
          ),
        ).resolves.not.toThrow();
      });

      it('emitToolCompleted should send tool completed event (failure)', async () => {
        await expect(
          service.emitToolCompleted(
            testContext,
            threadId,
            'sql-query',
            false,
            undefined,
            'Query syntax error',
          ),
        ).resolves.not.toThrow();
      });

      it('emitCompleted should send completed event with result', async () => {
        await expect(
          service.emitCompleted(
            testContext,
            threadId,
            { summary: 'Analysis complete', rowCount: 42 },
            5000,
          ),
        ).resolves.not.toThrow();
      });

      it('emitFailed should send failed event', async () => {
        await expect(
          service.emitFailed(
            testContext,
            threadId,
            'Test failure message',
            1500,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('marketing swarm specific events - real HTTP calls', () => {
      it('should send phase_changed event with correct structure', async () => {
        await expect(
          service.emitProgress(testContext, threadId, 'Phase: writing', {
            metadata: {
              type: 'phase_changed',
              phase: 'writing',
            },
          }),
        ).resolves.not.toThrow();
      });

      it('should send queue_built event with correct structure', async () => {
        await expect(
          service.emitProgress(
            testContext,
            threadId,
            'Queue built: 4 output combinations',
            {
              metadata: {
                type: 'queue_built',
                taskId: testContext.taskId,
                totalOutputs: 4,
                writers: 2,
                editors: 2,
                evaluators: 1,
                outputs: [
                  {
                    id: 'output-1',
                    status: 'pending_write',
                    writerAgentSlug: 'writer-creative',
                    editorAgentSlug: 'editor-clarity',
                  },
                  {
                    id: 'output-2',
                    status: 'pending_write',
                    writerAgentSlug: 'writer-technical',
                    editorAgentSlug: 'editor-clarity',
                  },
                ],
              },
            },
          ),
        ).resolves.not.toThrow();
      });

      it('should send output_updated event with correct structure', async () => {
        await expect(
          service.emitProgress(
            testContext,
            threadId,
            'Output output-1 status: writing',
            {
              metadata: {
                type: 'output_updated',
                taskId: testContext.taskId,
                output: {
                  id: 'output-1',
                  status: 'writing',
                  writerAgent: {
                    slug: 'writer-creative',
                    name: 'Creative Writer',
                    llmProvider: 'anthropic',
                    llmModel: 'claude-sonnet-4-20250514',
                    isLocal: false,
                  },
                  editorAgent: {
                    slug: 'editor-clarity',
                    name: 'Clarity Editor',
                    llmProvider: 'anthropic',
                    llmModel: 'claude-sonnet-4-20250514',
                    isLocal: false,
                  },
                  content: 'Generated content here...',
                  editCycle: 1,
                  editorFeedback: 'Good start, needs more detail.',
                  initialAvgScore: 7.5,
                  initialRank: 2,
                  isFinalist: true,
                },
              },
            },
          ),
        ).resolves.not.toThrow();
      });

      it('should send evaluation_updated event with correct structure', async () => {
        await expect(
          service.emitProgress(
            testContext,
            threadId,
            'Evaluation eval-1 completed',
            {
              metadata: {
                type: 'evaluation_updated',
                taskId: testContext.taskId,
                evaluation: {
                  id: 'eval-1',
                  outputId: 'output-1',
                  stage: 'initial',
                  status: 'completed',
                  evaluatorAgent: {
                    slug: 'evaluator-quality',
                    name: 'Quality Evaluator',
                    llmProvider: 'anthropic',
                    llmModel: 'claude-sonnet-4-20250514',
                    isLocal: false,
                  },
                  score: 8,
                  reasoning: 'Well-written with clear structure.',
                },
              },
            },
          ),
        ).resolves.not.toThrow();
      });

      it('should send finalists_selected event with correct structure', async () => {
        await expect(
          service.emitProgress(testContext, threadId, 'Selected 2 finalists', {
            metadata: {
              type: 'finalists_selected',
              taskId: testContext.taskId,
              count: 2,
              finalists: [
                {
                  id: 'output-1',
                  rank: 1,
                  avgScore: 8.5,
                  writerAgentSlug: 'writer-creative',
                  editorAgentSlug: 'editor-clarity',
                },
                {
                  id: 'output-2',
                  rank: 2,
                  avgScore: 7.8,
                  writerAgentSlug: 'writer-technical',
                  editorAgentSlug: 'editor-clarity',
                },
              ],
            },
          }),
        ).resolves.not.toThrow();
      });

      it('should send ranking_updated event with correct structure', async () => {
        await expect(
          service.emitProgress(
            testContext,
            threadId,
            'Ranking updated (initial)',
            {
              metadata: {
                type: 'ranking_updated',
                taskId: testContext.taskId,
                stage: 'initial',
                rankings: [
                  {
                    outputId: 'output-1',
                    rank: 1,
                    totalScore: 17,
                    avgScore: 8.5,
                    writerAgentSlug: 'writer-creative',
                    editorAgentSlug: 'editor-clarity',
                  },
                  {
                    outputId: 'output-2',
                    rank: 2,
                    totalScore: 15.6,
                    avgScore: 7.8,
                    writerAgentSlug: 'writer-technical',
                    editorAgentSlug: 'editor-clarity',
                  },
                ],
              },
            },
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('error handling - non-blocking', () => {
      it('should not throw when webhook is unavailable', async () => {
        // Create a service pointing to wrong port
        const badModule = await Test.createTestingModule({
          imports: [HttpModule],
          providers: [
            ObservabilityService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn((key: string) => {
                  const config: Record<string, string> = {
                    API_PORT: '59999', // Wrong port - should fail
                    API_HOST: 'test-api-host',
                  };
                  return config[key];
                }),
              },
            },
          ],
        }).compile();

        const badService =
          badModule.get<ObservabilityService>(ObservabilityService);

        // Should NOT throw - observability failures are non-blocking
        await expect(
          badService.emit({
            context: testContext,
            threadId,
            status: 'started',
            message: 'This should fail silently',
          }),
        ).resolves.not.toThrow();
      });
    });
  },
);
