import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentExecutionGateway } from './agent-execution-gateway.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeDefinitionService } from '@agent-platform/services/agent-runtime-definition.service';
import { AgentRuntimeExecutionService } from '@agent-platform/services/agent-runtime-execution.service';
import { RoutingPolicyAdapterService } from './routing-policy-adapter.service';
import { AgentModeRouterService } from './agent-mode-router.service';
import { ObservabilityEventsService } from '../../observability/observability-events.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';
import {
  AgentRecord,
  AgentRuntimeDefinition,
} from '@agent-platform/interfaces/agent.interface';

describe('AgentExecutionGateway', () => {
  let service: AgentExecutionGateway;
  let agentRegistry: jest.Mocked<AgentRegistryService>;
  let runtimeDefinitions: jest.Mocked<AgentRuntimeDefinitionService>;
  let modeRouter: jest.Mocked<AgentModeRouterService>;
  let routingPolicy: jest.Mocked<RoutingPolicyAdapterService>;
  let runtimeExecution: jest.Mocked<AgentRuntimeExecutionService>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentExecutionGateway,
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
          provide: AgentRuntimeExecutionService,
          useValue: {
            getAgentMetadataFromDefinition: jest.fn(),
          },
        },
        {
          provide: RoutingPolicyAdapterService,
          useValue: {
            evaluate: jest.fn(),
          },
        },
        {
          provide: AgentModeRouterService,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: ObservabilityEventsService,
          useValue: {
            push: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AgentExecutionGateway>(AgentExecutionGateway);
    agentRegistry = module.get(AgentRegistryService);
    runtimeDefinitions = module.get(AgentRuntimeDefinitionService);
    modeRouter = module.get(AgentModeRouterService);
    routingPolicy = module.get(RoutingPolicyAdapterService);
    runtimeExecution = module.get(AgentRuntimeExecutionService);

    // Default mocks
    agentRegistry.getAgent.mockResolvedValue(mockAgent);
    runtimeDefinitions.buildDefinition.mockReturnValue(mockDefinition);
    routingPolicy.evaluate.mockResolvedValue({
      showstopper: false,
      metadata: {},
    });
    runtimeExecution.getAgentMetadataFromDefinition.mockReturnValue({
      id: 'test-agent',
      slug: 'test-agent',
    });
    modeRouter.execute.mockResolvedValue(
      TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: { result: 'success' },
        metadata: {},
      }),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should throw NotFoundException if agent not found', async () => {
      agentRegistry.getAgent.mockResolvedValue(null);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await expect(service.execute(mockContext, request)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should execute agent through mode router', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test message',
        payload: {},
      };

      const result = await service.execute(mockContext, request);

      expect(agentRegistry.getAgent).toHaveBeenCalledWith(
        'test-org',
        'test-agent',
      );
      expect(runtimeDefinitions.buildDefinition).toHaveBeenCalledWith(
        mockAgent,
      );
      expect(modeRouter.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext,
          definition: mockDefinition,
          request,
        }),
      );
      expect(result.success).toBe(true);
    });

    it('should support CONVERSE mode', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Hello',
        payload: {},
      };

      modeRouter.execute.mockResolvedValue(
        TaskResponseDto.success(AgentTaskMode.CONVERSE, {
          content: { message: 'Hi' },
          metadata: {},
        }),
      );

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.CONVERSE);
    });

    it('should support PLAN mode', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.PLAN,
        context: mockContext,
        userMessage: 'Create plan',
        payload: {},
      };

      modeRouter.execute.mockResolvedValue(
        TaskResponseDto.success(AgentTaskMode.PLAN, {
          content: { plan: 'created' },
          metadata: {},
        }),
      );

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.PLAN);
    });

    it('should support HITL mode', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.HITL,
        context: mockContext,
        userMessage: 'Resume workflow',
        payload: {
          method: 'hitl.resume',
        },
      };

      modeRouter.execute.mockResolvedValue(
        TaskResponseDto.success(AgentTaskMode.HITL, {
          content: { resumed: true },
          metadata: {},
        }),
      );

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.HITL);
    });

    it('should reject unsupported mode if agent cannot execute it', async () => {
      const limitedDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        execution: {
          canConverse: true,
          canPlan: false,
          canBuild: false,
          canOrchestrate: false,
          requiresHumanGate: false,
          modeProfile: 'converse-only',
        },
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(limitedDefinition);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain('not supported');
    });

    it('should pass ExecutionContext to agent registry', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(mockContext, request);

      expect(agentRegistry.getAgent).toHaveBeenCalledWith(
        mockContext.orgSlug,
        mockContext.agentSlug,
      );
    });

    it('should handle execution errors', async () => {
      modeRouter.execute.mockRejectedValue(new Error('Execution failed'));

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await expect(service.execute(mockContext, request)).rejects.toThrow(
        'Execution failed',
      );
    });
  });

  describe('mode validation', () => {
    it('should allow CONVERSE if canConverse is true', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(mockContext, request);

      expect(modeRouter.execute).toHaveBeenCalled();
    });

    it('should reject CONVERSE if canConverse is false', async () => {
      const limitedDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        execution: {
          canConverse: false,
          canPlan: true,
          canBuild: true,
          canOrchestrate: false,
          requiresHumanGate: false,
          modeProfile: 'plan-build',
        },
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(limitedDefinition);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(false);
    });

    it('should allow PLAN if canPlan is true', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.PLAN,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(mockContext, request);

      expect(modeRouter.execute).toHaveBeenCalled();
    });

    it('should reject PLAN if canPlan is false', async () => {
      const limitedDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        execution: {
          canConverse: true,
          canPlan: false,
          canBuild: true,
          canOrchestrate: false,
          requiresHumanGate: false,
          modeProfile: 'converse-build',
        },
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(limitedDefinition);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.PLAN,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(false);
    });

    it('should allow BUILD if canBuild is true', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(mockContext, request);

      expect(modeRouter.execute).toHaveBeenCalled();
    });

    it('should reject BUILD if canBuild is false', async () => {
      const limitedDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        execution: {
          canConverse: true,
          canPlan: true,
          canBuild: false,
          canOrchestrate: false,
          requiresHumanGate: false,
          modeProfile: 'converse-plan',
        },
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(limitedDefinition);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(mockContext, request);

      expect(result.success).toBe(false);
    });

    it('should always allow HITL mode', async () => {
      const limitedDefinition: AgentRuntimeDefinition = {
        ...mockDefinition,
        execution: {
          canConverse: false,
          canPlan: false,
          canBuild: false,
          canOrchestrate: false,
          requiresHumanGate: false,
          modeProfile: 'none',
        },
      };

      runtimeDefinitions.buildDefinition.mockReturnValue(limitedDefinition);

      const request: TaskRequestDto = {
        mode: AgentTaskMode.HITL,
        context: mockContext,
        userMessage: 'Resume',
        payload: {
          method: 'hitl.resume',
        },
      };

      await service.execute(mockContext, request);

      expect(modeRouter.execute).toHaveBeenCalled();
    });
  });

  describe('ExecutionContext flow', () => {
    it('should maintain ExecutionContext throughout execution', async () => {
      const customContext = createMockExecutionContext({
        orgSlug: 'custom-org',
        userId: 'user-456',
        conversationId: 'conv-456',
        taskId: 'task-456',
        agentSlug: 'custom-agent',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: customContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(customContext, request);

      expect(agentRegistry.getAgent).toHaveBeenCalledWith(
        'custom-org',
        'custom-agent',
      );
      expect(modeRouter.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          context: customContext,
        }),
      );
    });

    it('should pass ExecutionContext to mode router', async () => {
      const request: TaskRequestDto = {
        mode: AgentTaskMode.CONVERSE,
        context: mockContext,
        userMessage: 'Test',
        payload: {},
      };

      await service.execute(mockContext, request);

      expect(modeRouter.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext,
          request: expect.objectContaining({
            context: mockContext,
          }),
        }),
      );
    });
  });
});
