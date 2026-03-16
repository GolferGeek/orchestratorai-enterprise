import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ContextAgentRunnerService } from './context-agent-runner.service';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { LLMService } from '@llm/llm.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { PlansService } from '../plans/services/plans.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { ActionResult } from '../common/interfaces/action-handler.interface';
import {
  DeliverableType,
  DeliverableFormat,
  DeliverableVersionCreationType,
} from '../deliverables/dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('ContextAgentRunnerService', () => {
  let service: ContextAgentRunnerService;
  let contextOptimization: jest.Mocked<ContextOptimizationService>;
  let llmService: jest.Mocked<LLMService>;
  let plansService: jest.Mocked<PlansService>;
  let deliverablesService: jest.Mocked<DeliverablesService>;
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextAgentRunnerService,
        {
          provide: ContextOptimizationService,
          useValue: {
            optimizeContext: jest.fn(),
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
          provide: PlansService,
          useValue: {
            executeAction: jest.fn(),
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: DeliverablesService,
          useValue: {
            executeAction: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: Agent2AgentConversationsService,
          useValue: {
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            sendUpdate: jest.fn(),
            emitProgress: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ContextAgentRunnerService>(ContextAgentRunnerService);
    contextOptimization = module.get(ContextOptimizationService);
    llmService = module.get(LLM_SERVICE);
    plansService = module.get(PlansService);
    deliverablesService = module.get(DeliverablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute - BUILD mode with create action', () => {
    it('should fetch context, call LLM, and create deliverable', async () => {
      // Arrange
      const definition = {
        slug: 'test-context-agent',
        displayName: 'Test Context Agent',
        agentType: 'context',
        context: { instructions: 'Test agent instructions' },
        config: {
          context: {
            sources: ['plans', 'deliverables'],
            systemPromptTemplate:
              'Context: {{plan.content}}\n\nDeliverables: {{deliverables}}',
            tokenBudget: 8000,
          },
          deliverable: {
            format: 'markdown',
            type: 'document',
          },
        },
        llm: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          maxTokens: 2000,
        },
        capabilities: ['converse', 'plan', 'build'],
        execution: {
          canConverse: true,
          canPlan: true,
          canBuild: true,
        },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Generate analysis',
        payload: {
          title: 'Test Analysis',
          action: 'create',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
          },
        },
        metadata: {
          userId: 'user-123',
        },
      };

      const planData = {
        content: 'Test plan content',
      };

      const optimizedContext = [
        {
          role: 'user',
          content: 'Previous message',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      const _llmResponse = {
        content: 'Generated analysis content',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          usage: {
            inputTokens: 100,
            outputTokens: 200,
          },
        },
      };

      const deliverableResult: ActionResult = {
        success: true,
        data: {
          deliverable: {
            id: 'del-new',
            title: 'Test Analysis',
            content: 'Generated analysis content',
          },
          version: {
            id: 'ver-1',
            version: 1,
          },
          isNew: true,
        },
      };

      // Mock service responses
      plansService.findByConversationId.mockResolvedValue({
        id: 'plan-123',
        conversationId: 'conv-123',
        userId: 'user-123',
        agentName: 'Test Agent',
        organization: 'test-org',
        title: 'Test Plan',
        currentVersionId: 'ver-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersion: {
          id: 'ver-1',
          planId: 'plan-123',
          content: 'Test plan content',
          versionNumber: 1,
          format: 'markdown',
          createdByType: 'agent',
          createdById: 'user-123',
          isCurrentVersion: true,
          createdAt: new Date().toISOString(),
        },
      });

      plansService.executeAction.mockResolvedValue({
        success: true,
        data: planData,
      });

      deliverablesService.executeAction.mockResolvedValue(deliverableResult);

      contextOptimization.optimizeContext.mockResolvedValue(optimizedContext);
      llmService.generateResponse.mockResolvedValue({
        content: 'Generated analysis content',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: {
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300,
          },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 1000,
          },
          status: 'completed',
        },
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.mode).toBe(AgentTaskMode.BUILD);
      const deliverableData = deliverableResult.data as
        | {
            deliverable: unknown;
            version: unknown;
            isNew: boolean;
          }
        | undefined;
      expect(
        (result.payload?.content as Record<string, unknown> | undefined)
          ?.deliverable,
      ).toEqual(deliverableData?.deliverable);
      expect(
        (result.payload?.content as Record<string, unknown> | undefined)
          ?.version,
      ).toEqual(deliverableData?.version);
      expect(result.payload?.metadata?.provider).toBe('anthropic');

      // Verify service calls - plansService.findByConversationId now takes ExecutionContext

      expect(plansService.findByConversationId).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-123',
          orgSlug: 'test-org',
        }),
      );

      expect(llmService.generateResponse).toHaveBeenCalled();

      expect(deliverablesService.executeAction).toHaveBeenCalled();
    });

    it('should handle missing userId or conversationId', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'context',
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const contextWithoutUser = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: '',
        conversationId: 'conv-123',
      });

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: contextWithoutUser,
        userMessage: 'Test',
        payload: {},
      };

      const result = await service.execute(
        definition,
        request,
        contextWithoutUser.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'User identity is required for build execution',
      );
    });

    it('should handle LLM service errors', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'context',
        config: {
          context: {
            sources: [],
          },
        },
        llmConfig: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {
          action: 'create',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-latest',
          },
        },
        metadata: {
          userId: 'user-123',
        },
      };

      plansService.findByConversationId.mockResolvedValue(null);
      contextOptimization.optimizeContext.mockResolvedValue([]);
      llmService.generateResponse.mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'LLM service unavailable',
      );
    });

    it('should handle deliverable creation failure', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'context',
        config: {
          context: {
            sources: [],
          },
        },
        llmConfig: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
        },
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test',
        payload: {
          action: 'create',
          config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-latest',
          },
        },
        metadata: {
          userId: 'user-123',
        },
      };

      plansService.findByConversationId.mockResolvedValue(null);
      contextOptimization.optimizeContext.mockResolvedValue([]);
      llmService.generateResponse.mockResolvedValue({
        content: 'Test content',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: {
            inputTokens: 50,
            outputTokens: 100,
            totalTokens: 150,
          },
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 500,
          },
          status: 'completed',
        },
      });

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

  describe('execute - BUILD mode with non-create actions', () => {
    it('should route read action to DeliverablesService', async () => {
      const definition = {
        slug: 'test-agent',
        displayName: 'Test Agent',
        agentType: 'context',
        capabilities: ['build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Read deliverable',
        payload: {
          action: 'read',
          deliverableId: 'del-123',
        },
        metadata: {
          userId: 'user-123',
        },
      };

      // Mock finding existing deliverable by conversation
      deliverablesService.executeAction.mockResolvedValue({
        success: true,
        data: {
          deliverables: [{ id: 'del-123' }],
        },
      });

      // Mock findOne to return the deliverable
      deliverablesService.findOne.mockResolvedValue({
        id: 'del-123',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentName: 'test-agent',
        title: 'Test Deliverable',
        type: DeliverableType.DOCUMENT,
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersion: {
          id: 'ver-1',
          deliverableId: 'del-123',
          versionNumber: 1,
          content: 'Test content',
          format: DeliverableFormat.MARKDOWN,
          isCurrentVersion: true,
          createdByType: DeliverableVersionCreationType.AI_RESPONSE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      expect(result.success).toBe(true);
      expect(
        (
          (result.payload?.content as Record<string, unknown> | undefined)
            ?.deliverable as Record<string, unknown> | undefined
        )?.id,
      ).toBe('del-123');

      // Deliverable is fetched by conversation context

      expect(deliverablesService.findOne).toHaveBeenCalledWith(
        'del-123',
        'user-123',
      );
    });
  });
});
