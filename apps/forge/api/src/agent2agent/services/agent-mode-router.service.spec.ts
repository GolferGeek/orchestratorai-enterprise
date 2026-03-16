import { Test, TestingModule } from '@nestjs/testing';
import {
  AgentModeRouterService,
  AgentExecutionContext,
} from './agent-mode-router.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeDefinitionService } from '@agent-platform/services/agent-runtime-definition.service';
import { AgentRunnerRegistryService } from './agent-runner-registry.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import {
  AgentRecord,
  AgentRuntimeDefinition,
} from '@agent-platform/interfaces/agent.interface';

describe('AgentModeRouterService', () => {
  let service: AgentModeRouterService;
  let agentRegistry: jest.Mocked<AgentRegistryService>;
  let runtimeDefinitions: jest.Mocked<AgentRuntimeDefinitionService>;
  let runnerRegistry: jest.Mocked<AgentRunnerRegistryService>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: 'task-123',
    agentSlug: 'test-agent',
  });

  const mockAgent: AgentRecord = {
    slug: 'test-agent',
    organization_slug: ['test-org'],
    name: 'Test Agent',
    description: 'Test agent description',
    version: '1.0',
    agent_type: 'context',
    department: 'test-department',
    tags: [],
    io_schema: {},
    capabilities: [],
    context: 'Test context',
    endpoint: null,
    llm_config: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockDefinition: AgentRuntimeDefinition = {
    slug: 'test-agent',
    organizationSlug: ['test-org'],
    name: 'Test Agent',
    description: 'Test agent description',
    agentType: 'context',
    department: 'test-department',
    tags: [],
    metadata: { tags: [] },
    capabilities: ['converse', 'plan', 'build'],
    skills: [],
    communication: {
      inputModes: ['text'],
      outputModes: ['text'],
    },
    execution: {
      canConverse: true,
      canPlan: true,
      canBuild: true,
      canOrchestrate: false,
      requiresHumanGate: false,
      modeProfile: 'full',
    },
    llm: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      temperature: 0.7,
      maxTokens: 2000,
    },
    prompts: {},
    context: null,
    config: null,
    ioSchema: null,
    record: mockAgent,
  } as AgentRuntimeDefinition;

  const mockRunner = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentModeRouterService,
        {
          provide: AgentRegistryService,
          useValue: {
            getAgent: jest.fn(),
          },
        },
        {
          provide: AgentRuntimeDefinitionService,
          useValue: {
            buildDefinition: jest.fn(),
          },
        },
        {
          provide: AgentRunnerRegistryService,
          useValue: {
            getRunner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentModeRouterService>(AgentModeRouterService);
    agentRegistry = module.get(AgentRegistryService);
    runtimeDefinitions = module.get(AgentRuntimeDefinitionService);
    runnerRegistry = module.get(AgentRunnerRegistryService);

    // Default mocks
    agentRegistry.getAgent.mockResolvedValue(mockAgent);
    runtimeDefinitions.buildDefinition.mockReturnValue(mockDefinition);
    runnerRegistry.getRunner.mockReturnValue(mockRunner as any);
    mockRunner.execute.mockResolvedValue(
      TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: { result: 'success' },
        metadata: {},
      }),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute - standard modes', () => {
    it('should route CONVERSE mode correctly', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Hello',
        payload: {},
      };

      const execContext: AgentExecutionContext = {
        context: mockContext,
        request,
      };

      const result = await service.execute(execContext);

      expect(agentRegistry.getAgent).toHaveBeenCalledWith(
        'test-org',
        'test-agent',
      );
      expect(runnerRegistry.getRunner).toHaveBeenCalledWith('context');
      expect(mockRunner.execute).toHaveBeenCalledWith(
        mockDefinition,
        request,
        'test-org',
      );
      expect(result.success).toBe(true);
    });

    it('should route PLAN mode correctly', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.PLAN,
        context: mockContext,
        userMessage: 'Create a plan',
        payload: {},
      };

      mockRunner.execute.mockResolvedValue(
        TaskResponseDto.success(AgentTaskMode.PLAN, {
          content: { plan: 'created' },
          metadata: {},
        }),
      );

      const result = await service.execute({
        context: mockContext,
        request,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.PLAN);
    });

    it('should route BUILD mode correctly', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Build deliverable',
        payload: {},
      };

      const result = await service.execute({
        context: mockContext,
        request,
      });

      expect(result.success).toBe(true);
      expect(mockRunner.execute).toHaveBeenCalled();
    });

    it('should use existing definition if provided', async () => {
      const customDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        slug: 'custom-agent',
      };

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        definition: customDefinition,
        request,
      });

      // Should not call buildDefinition since definition was provided
      expect(runtimeDefinitions.buildDefinition).not.toHaveBeenCalled();
      expect(mockRunner.execute).toHaveBeenCalledWith(
        customDefinition,
        request,
        'test-org',
      );
    });

    it('should pass routing metadata to runner', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const routingMetadata = {
        priority: 'high',
        source: 'api',
      };

      await service.execute({
        context: mockContext,
        request,
        routingMetadata,
      });

      expect(mockRunner.execute).toHaveBeenCalled();
    });
  });

  describe('execute - HITL methods', () => {
    it('should route hitl.resume to HITL handler', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Resume workflow',
        payload: {
          method: 'hitl.resume',
          decision: 'approve',
        },
      };

      const apiRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.HITL, {
            content: { resumed: true },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'api') return apiRunner as any;
        return mockRunner as any;
      });

      await service.execute({
        context: mockContext,
        request,
      });

      expect(runnerRegistry.getRunner).toHaveBeenCalledWith('api');
      expect(apiRunner.execute).toHaveBeenCalledWith(
        mockDefinition,
        expect.objectContaining({
          mode: AgentTaskMode.HITL,
          payload: expect.objectContaining({
            method: 'hitl.resume',
            hitlMethod: 'hitl.resume',
          }),
        }),
        'test-org',
      );
    });

    it('should route hitl.status to HITL handler', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Check status',
        payload: {
          method: 'hitl.status',
          taskId: 'task-123',
        },
      };

      const apiRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.HITL, {
            content: { status: 'pending' },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'api') return apiRunner as any;
        return mockRunner as any;
      });

      await service.execute({
        context: mockContext,
        request,
      });

      expect(apiRunner.execute).toHaveBeenCalledWith(
        mockDefinition,
        expect.objectContaining({
          payload: expect.objectContaining({
            hitlMethod: 'hitl.status',
          }),
        }),
        'test-org',
      );
    });

    it('should route hitl.history to HITL handler', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Get history',
        payload: {
          method: 'hitl.history',
          taskId: 'task-123',
        },
      };

      const apiRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.HITL, {
            content: { history: [] },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'api') return apiRunner as any;
        return mockRunner as any;
      });

      await service.execute({
        context: mockContext,
        request,
      });

      expect(apiRunner.execute).toHaveBeenCalled();
    });

    it('should handle hitl.pending for _system agent', async () => {
      const systemContext = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: 'user-123',
        agentSlug: '_system',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: systemContext,
        userMessage: 'Get pending reviews',
        payload: {
          method: 'hitl.pending',
        },
      };

      const apiRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.HITL, {
            content: { pending: [] },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'api') return apiRunner as any;
        return mockRunner as any;
      });

      await service.execute({
        context: systemContext,
        request,
      });

      expect(apiRunner.execute).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          mode: AgentTaskMode.HITL,
          payload: expect.objectContaining({
            hitlMethod: 'hitl.pending',
          }),
        }),
        'test-org',
      );
    });

    it('should fail if API runner not available for HITL', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Resume',
        payload: {
          method: 'hitl.resume',
        },
      };

      runnerRegistry.getRunner.mockReturnValue(null);

      const result = await service.execute({
        context: mockContext,
        request,
      });

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'API runner not available',
      );
    });
  });

  describe('error handling', () => {
    it('should fail if agent not found', async () => {
      agentRegistry.getAgent.mockResolvedValue(null);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute({
        context: mockContext,
        request,
      });

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'Agent record unavailable',
      );
    });

    it('should fail if agentSlug missing from context', async () => {
      const contextWithoutAgent = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: 'user-123',
        agentSlug: '',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: contextWithoutAgent,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute({
        context: contextWithoutAgent,
        request,
      });

      expect(result.success).toBe(false);
    });

    it('should fail if runner not available for agent type', async () => {
      runnerRegistry.getRunner.mockReturnValue(null);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute({
        context: mockContext,
        request,
      });

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'No runner available for agent type',
      );
    });

    it('should propagate runner errors', async () => {
      mockRunner.execute.mockRejectedValue(
        new Error('Runner execution failed'),
      );

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await expect(
        service.execute({
          context: mockContext,
          request,
        }),
      ).rejects.toThrow('Runner execution failed');
    });
  });

  describe('agent type routing', () => {
    it('should route context agent to context runner', async () => {
      const contextRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.BUILD, {
            content: { result: 'success' },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'context') return contextRunner as any;
        return null;
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        request,
      });

      expect(runnerRegistry.getRunner).toHaveBeenCalledWith('context');
      expect(contextRunner.execute).toHaveBeenCalled();
    });

    it('should route external agent to external runner', async () => {
      const externalDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        agentType: 'external',
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(externalDefinition);

      const externalRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.CONVERSE, {
            content: { result: 'success' },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'external') return externalRunner as any;
        return null;
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        request,
      });

      expect(runnerRegistry.getRunner).toHaveBeenCalledWith('external');
      expect(externalRunner.execute).toHaveBeenCalled();
    });

    it('should route API agent to API runner', async () => {
      const apiDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        agentType: 'api',
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(apiDefinition);

      const apiRunner = {
        execute: jest.fn().mockResolvedValue(
          TaskResponseDto.success(AgentTaskMode.BUILD, {
            content: { result: 'success' },
            metadata: {},
          }),
        ),
      };
      runnerRegistry.getRunner.mockImplementation((type: string) => {
        if (type === 'api') return apiRunner as any;
        return null;
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        request,
      });

      expect(runnerRegistry.getRunner).toHaveBeenCalledWith('api');
      expect(apiRunner.execute).toHaveBeenCalled();
    });
  });

  describe('ExecutionContext flow', () => {
    it('should pass ExecutionContext to agent registry', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        request,
      });

      expect(agentRegistry.getAgent).toHaveBeenCalledWith(
        mockContext.orgSlug,
        mockContext.agentSlug,
      );
    });

    it('should pass ExecutionContext orgSlug to runner', async () => {
      const customContext = createMockExecutionContext({
        orgSlug: 'custom-org',
        userId: 'user-456',
        agentSlug: 'test-agent',
        taskId: 'task-456',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: customContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: customContext,
        request,
      });

      expect(mockRunner.execute).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'custom-org',
      );
    });

    it('should maintain ExecutionContext in request', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute({
        context: mockContext,
        request,
      });

      expect(mockRunner.execute).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          context: mockContext,
        }),
        expect.any(String),
      );
    });
  });
});
