import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiAgentRunnerService } from './api-agent-runner.service';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { DeliverableVersionsService } from '../deliverables/deliverable-versions.service';
import { LLM_SERVICE } from '../../planes/llm/llm.interface';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { TasksService } from '../tasks/tasks.service';
import { AgentConversationsService } from '../conversations/agent-conversations.service';
import { SupabaseService } from '../../planes/supabase-core/supabase.service';
import { DATABASE_SERVICE } from '../../database';
import { AgentRuntimeDefinition } from '../../agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

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

describe('ApiAgentRunnerService', () => {
  let service: ApiAgentRunnerService;
  let httpService: jest.Mocked<HttpService>;
  let deliverablesService: jest.Mocked<DeliverablesService>;
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiAgentRunnerService,
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
          },
        },
        {
          provide: LLM_SERVICE,
          useValue: {
            generateResponse: jest.fn(),
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
          provide: Agent2AgentConversationsService,
          useValue: {
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            executeAction: jest.fn(),
            findOne: jest.fn(),
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            sendUpdate: jest.fn(),
          },
        },
        {
          provide: TasksService,
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: DeliverableVersionsService,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            findByDeliverable: jest.fn(),
          },
        },
        {
          provide: AgentConversationsService,
          useValue: {
            findByConversationId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(),
            getServiceClient: jest.fn(),
          },
        },
        {
          provide: DATABASE_SERVICE,
          useValue: {
            from: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              delete: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockReturnThis(),
              then: jest.fn((resolve) => resolve({ data: null, error: null })),
            }),
            rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SUPABASE_URL: 'http://test-supabase-host',
                SUPABASE_SERVICE_ROLE_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ApiAgentRunnerService>(ApiAgentRunnerService);
    httpService = module.get(HttpService);
    deliverablesService = module.get(DeliverablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute - BUILD mode with API call', () => {
    it('should execute GET request and save results', async () => {
      const definition = {
        slug: 'test-api-agent',
        displayName: 'Test API Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users',
            method: 'GET',
            headers: {
              'X-API-Key': 'secret-key',
            },
          },
          deliverable: {
            format: 'json',
            type: 'api-response',
          },
        },
        execution: {
          canBuild: true,
        },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Fetch users',
        payload: {
          title: 'User List',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: {
          userId: 'user-123',
        },
      };

      // Mock HTTP response
      const httpResponse = createMockAxiosResponse([
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
      ]);

      httpService.request.mockReturnValue(of(httpResponse));

      // Mock deliverable creation
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-new', title: 'User List' },
          version: { id: 'ver-1', version: 1 },
        },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.BUILD);

      // Verify HTTP call

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
            'Content-Type': 'application/json',
            'User-Agent': 'Orchestrator-AI/1.0',
          }) as Record<string, string>,
          data: undefined,
          params: {},
          timeout: 600000, // Default timeout in implementation (10 minutes for slow local models)
          validateStatus: expect.any(Function) as (status: number) => boolean,
        }),
      );

      // Verify deliverable creation

      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          title: 'User List',
          format: 'json',
          type: 'api-response',
          agentName: 'test-api-agent',
          organizationSlug: 'test-org',
        }),
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
        }),
      );
    });

    it('should execute POST request with body', async () => {
      const definition = {
        slug: 'test-api-agent',
        displayName: 'Test API Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users',
            method: 'POST',
            headers: {},
            body: {
              name: '{{payload.userName}}',
              email: '{{payload.userEmail}}',
            },
          },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Create user',
        payload: {
          userName: 'John Doe',
          userEmail: 'john@example.com',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of(
          createMockAxiosResponse(
            { id: 3, name: 'John Doe', email: 'john@example.com' },
            201,
            'Created',
          ),
        ),
      );

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {} },
      });

      await service.execute(definition, request, mockContext.orgSlug);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        }),
      );
    });

    it('should interpolate URL parameters', async () => {
      const definition = {
        slug: 'test-api-agent',
        displayName: 'Test API Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users/{{payload.userId}}',
            method: 'GET',
          },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Fetch user',
        payload: {
          userId: '42',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of(createMockAxiosResponse({ id: 42 })),
      );

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {} },
      });

      await service.execute(definition, request, mockContext.orgSlug);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/users/42',
        }),
      );
    });

    it('should handle query parameters', async () => {
      const definition = {
        slug: 'test-api-agent',
        displayName: 'Test API Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users',
            method: 'GET',
            queryParams: {
              limit: '10',
              page: '{{payload.page}}',
            },
          },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Fetch users',
        payload: {
          page: '2',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(of(createMockAxiosResponse([])));

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {} },
      });

      await service.execute(definition, request, mockContext.orgSlug);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            limit: '10',
            page: '2',
          },
        }),
      );
    });
  });

  describe('execute - error handling', () => {
    it('should handle missing userId or conversationId', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: { api: { url: 'https://api.example.com' } },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      // Create a context without userId to test the error handling
      const contextWithoutUser = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: '', // Empty userId to trigger the error
        conversationId: 'conv-123',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {},
        context: contextWithoutUser,
      };

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'Missing required userId',
      );
    });

    it('should handle missing API configuration', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {},
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'No API configuration found',
      );
    });

    it('should handle HTTP request failure', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {
          api: { url: 'https://api.example.com/users', method: 'GET' },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain('Network error');
    });

    it('should handle non-2xx status codes when failOnError is true', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users',
            method: 'GET',
            failOnError: true,
          },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of(createMockAxiosResponse({ error: 'Not found' }, 404, 'Not Found')),
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'API returned error status 404',
      );
    });

    it('should succeed with non-2xx when failOnError is false', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {
          api: {
            url: 'https://api.example.com/users',
            method: 'GET',
            failOnError: false,
          },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of(createMockAxiosResponse({ error: 'Not found' }, 404, 'Not Found')),
      );

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {} },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
    });

    it('should handle deliverable creation failure', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {
          api: { url: 'https://api.example.com/users', method: 'GET' },
          deliverable: { format: 'json', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(of(createMockAxiosResponse({})));

      deliverablesService.executeAction.mockResolvedValue({
        success: false,
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create deliverable',
        },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toBe(
        'Failed to create deliverable',
      );
    });
  });

  describe('execute - markdown formatting', () => {
    it('should format response as markdown when configured', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: {
          api: { url: 'https://api.example.com/users', method: 'GET' },
          deliverable: { format: 'markdown', type: 'api-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Test',
        payload: {
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of(createMockAxiosResponse({ users: [] })),
      );

      let capturedContent: string = '';
      deliverablesService.executeAction.mockImplementation(
        (_action: string, params: any, _context: any) => {
          capturedContent = params.content as string;
          return Promise.resolve({
            success: true,
            data: { deliverable: {}, version: {} },
          });
        },
      );

      await service.execute(definition, request, mockContext.orgSlug);

      expect(capturedContent).toContain('# API Response');
      expect(capturedContent).toContain('**Status Code:** 200');
      expect(capturedContent).toContain('**Duration:**');
      expect(capturedContent).toContain('## Response Data');
    });
  });

  describe('execute - non-create actions', () => {
    it('should route read action to DeliverablesService', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'api',
        config: { api: { url: 'https://api.example.com' } },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        userMessage: 'Read deliverable',
        payload: {
          action: 'read',
          deliverableId: 'del-123',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
          },
        },
        context: mockContext,
        metadata: { userId: 'user-123' },
      };

      // Mock findByConversationId to return the deliverable (called by fetchExistingDeliverable)
      deliverablesService.findByConversationId.mockResolvedValue([
        {
          id: 'del-123',
          title: 'Test',
          content: 'Content',
          conversationId: 'conv-123',
        },
      ] as never);

      // Mock findOne to return the full deliverable record
      deliverablesService.findOne.mockResolvedValue({
        id: 'del-123',
        title: 'Test',
        content: 'Content',
        format: 'json',
        type: 'other' as const,
        agentName: 'test-agent',
        conversationId: 'conv-123',
        userId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      // Mock executeAction for read action (returns deliverable and version)
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-123', title: 'Test', content: 'Content' },
          version: { id: 'ver-1', version: 1 },
        },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      const content = result.payload?.content as
        | { deliverable?: { id?: string } }
        | undefined;
      expect(content?.deliverable?.id).toBe('del-123');

      // Verify the read action was executed through deliverablesService

      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'read',
        {},
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
        }),
      );

      // Should not call HTTP service for non-create actions

      expect(httpService.request).not.toHaveBeenCalled();
    });
  });
});
