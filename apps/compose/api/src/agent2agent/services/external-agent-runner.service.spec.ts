import { Test, TestingModule } from '@nestjs/testing';
import { ExternalAgentRunnerService } from './external-agent-runner.service';
import { HttpService } from '@nestjs/axios';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { AgentRuntimeDefinition } from '../../agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import { of, throwError } from 'rxjs';
import { LLM_SERVICE } from '../../planes/llm/llm.interface';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { PlansService } from '../plans/services/plans.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('ExternalAgentRunnerService', () => {
  let service: ExternalAgentRunnerService;
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
        ExternalAgentRunnerService,
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
          },
        },
        {
          provide: LLM_SERVICE,
          useValue: {
            generateResponse: jest.fn(),
          },
        },
        {
          provide: ContextOptimizationService,
          useValue: {
            optimize: jest.fn(),
          },
        },
        {
          provide: PlansService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: Agent2AgentConversationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            executeAction: jest.fn(),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            sendUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExternalAgentRunnerService>(
      ExternalAgentRunnerService,
    );
    httpService = module.get(HttpService);
    deliverablesService = module.get(DeliverablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute - BUILD mode with external agent', () => {
    it('should forward BUILD request and save deliverable', async () => {
      const definition = {
        slug: 'test-external-agent',
        displayName: 'Test External Agent',
        agentType: 'external',
        config: {
          external: {
            url: 'https://external-agent.example.com/task',
            apiKey: 'secret-key',
            timeout: 60000,
          },
          deliverable: {
            format: 'json',
            type: 'external-response',
          },
        },
        execution: {
          canBuild: true,
        },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Execute external task',
        payload: {
          title: 'External Task Result',
          data: 'test-data',
        },
        metadata: {
          userId: 'user-123',
        },
      };

      // Mock external agent A2A response
      const externalResponse = TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: { result: 'External agent completed successfully' },
        metadata: { externalMetric: 42 },
      });

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: externalResponse,
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      // Mock deliverable creation
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverable: { id: 'del-new', title: 'External Task Result' },
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

      // Verify external agent HTTP call

      expect(httpService.request).toHaveBeenCalledWith({
        url: 'https://external-agent.example.com/task',
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'secret-key',
        }) as Record<string, string>,
        data: expect.objectContaining({
          mode: AgentTaskMode.BUILD,
          context: expect.objectContaining({
            conversationId: 'conv-123',
            userId: 'user-123',
            orgSlug: 'test-org',
          }) as Record<string, unknown>,
          userMessage: 'Execute external task',
          metadata: expect.objectContaining({
            userId: 'user-123',
            forwardedFrom: 'test-external-agent',
          }) as Record<string, string>,
        }) as Record<string, unknown>,
        timeout: 60000,
        validateStatus: expect.any(Function) as (status: number) => boolean,
      });

      // Verify deliverable creation

      expect(deliverablesService.executeAction).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          title: 'External Task Result',
          format: 'json',
          type: 'external-response',
          agentName: 'test-external-agent',
          organizationSlug: 'test-org',
        }),
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
        }),
      );
    });

    it('should handle external agent without API key', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: {
            url: 'https://external-agent.example.com/task',
          },
          deliverable: { format: 'json', type: 'external-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: TaskResponseDto.success(AgentTaskMode.BUILD, {
            content: {},
            metadata: {},
          }),
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { deliverable: {}, version: {} },
      });

      await service.execute(definition, request, mockContext.orgSlug);

      // Verify no API key in headers

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-API-Key': expect.anything() as string,
          }) as Record<string, string>,
        }),
      );
    });
  });

  describe('execute - CONVERSE mode', () => {
    it('should forward CONVERSE request to external agent', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: {
            url: 'https://external-agent.example.com/task',
          },
        },
        execution: { canConverse: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Hello external agent',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      const externalResponse = TaskResponseDto.success(AgentTaskMode.CONVERSE, {
        content: { message: 'Hello from external agent' },
        metadata: {},
      });

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: externalResponse,
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.CONVERSE);
      expect(
        (result.payload?.content as Record<string, unknown> | undefined)
          ?.message,
      ).toBe('Hello from external agent');

      // Should not create deliverable for CONVERSE

      expect(deliverablesService.executeAction).not.toHaveBeenCalled();
    });
  });

  describe('execute - PLAN mode', () => {
    it('should forward PLAN request to external agent', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: {
            url: 'https://external-agent.example.com/task',
          },
        },
        execution: { canPlan: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.PLAN,
        context: mockContext,
        userMessage: 'Create a plan',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      const externalResponse = TaskResponseDto.success(AgentTaskMode.PLAN, {
        content: { plan: 'External agent plan' },
        metadata: {},
      });

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: externalResponse,
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.PLAN);

      // Should not create deliverable for PLAN

      expect(deliverablesService.executeAction).not.toHaveBeenCalled();
    });
  });

  describe('execute - error handling', () => {
    it('should handle missing userId or conversationId', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: { external: { url: 'https://example.com' } },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const contextWithoutUserOrConv = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: '',
        conversationId: '',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: contextWithoutUserOrConv,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'Missing required userId or conversationId',
      );
    });

    it('should handle missing external configuration', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {},
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'No external agent configuration found',
      );
    });

    it('should handle HTTP request failure', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: { url: 'https://external-agent.example.com/task' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        throwError(() => new Error('Network error')) as unknown as ReturnType<
          typeof httpService.request
        >,
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'External agent call failed',
      );
    });

    it('should handle non-200 status from external agent', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: { url: 'https://external-agent.example.com/task' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of({
          status: 500,
          data: { error: 'Internal server error' },
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'External agent returned error status 500',
      );
    });

    it('should handle invalid A2A response format', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: { url: 'https://external-agent.example.com/task' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: { invalidResponse: true }, // Not a valid A2A response
        }) as unknown as ReturnType<typeof httpService.request>,
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'Invalid A2A response format',
      );
    });

    it('should handle deliverable creation failure', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: {
          external: { url: 'https://external-agent.example.com/task' },
          deliverable: { format: 'json', type: 'external-response' },
        },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
        metadata: { userId: 'user-123' },
      };

      httpService.request.mockReturnValue(
        of({
          status: 200,
          data: TaskResponseDto.success(AgentTaskMode.BUILD, {
            content: {},
            metadata: {},
          }),
        }) as unknown as ReturnType<typeof httpService.request>,
      );

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

  describe('execute - non-create actions', () => {
    // TODO: This test describes planned functionality where non-create BUILD actions
    // (like 'read') should be routed directly to DeliverablesService without calling
    // the external agent. Currently, external agents forward all BUILD requests to
    // the external endpoint regardless of the action type.
    it.skip('should route read action to DeliverablesService', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'external',
        config: { external: { url: 'https://example.com' } },
        execution: { canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Read deliverable',
        payload: {
          action: 'read',
          deliverableId: 'del-123',
        },
        metadata: { userId: 'user-123' },
      };

      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: { id: 'del-123', title: 'Test', content: 'Content' },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      expect(
        (result.payload?.content as Record<string, unknown> | undefined)?.id,
      ).toBe('del-123');

      // Should not call external agent for non-create actions

      expect(httpService.request).not.toHaveBeenCalled();
    });
  });
});
