import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { OrchestratorAgentRunnerService } from './orchestrator-agent-runner.service';
import { ContextOptimizationService } from '../context-optimization/context-optimization.service';
import { LLMService } from '@llm/llm.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { PlansService } from '../plans/services/plans.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { Agent2AgentConversationsService } from './agent-conversations.service';
import { StreamingService } from './streaming.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import {
  AgentRecord,
  AgentRuntimeDefinition,
} from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto, AgentTaskMode } from '../dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { of } from 'rxjs';

describe('OrchestratorAgentRunnerService', () => {
  let service: OrchestratorAgentRunnerService;
  let agentRegistry: jest.Mocked<AgentRegistryService>;
  let httpService: jest.Mocked<HttpService>;
  let llmService: jest.Mocked<LLMService>;
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorAgentRunnerService,
        {
          provide: AgentRegistryService,
          useValue: {
            getAgent: jest.fn(),
            listAgents: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
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
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<OrchestratorAgentRunnerService>(
      OrchestratorAgentRunnerService,
    );
    agentRegistry = module.get(AgentRegistryService);
    httpService = module.get(HttpService);
    llmService = module.get(LLM_SERVICE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ExecutionContext handling', () => {
    it('should pass ExecutionContext unchanged to sub-agent', async () => {
      // Arrange
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate', 'build'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test request',
        payload: {
          action: 'create',
        },
        metadata: {
          userId: 'user-123',
        },
      };

      const subAgents = [
        {
          slug: 'sub-agent-1',
          organization_slug: ['test-org'],
          name: 'Sub Agent 1',
          description: 'Test sub-agent',
          version: '1.0',
          agent_type: 'context' as const,
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
        },
      ];

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: { message: 'Sub-agent response' },
          metadata: {},
        },
      };

      agentRegistry.listAgents.mockResolvedValue(subAgents);
      agentRegistry.getAgent.mockResolvedValue(subAgents[0] as AgentRecord);
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      await service.execute(definition, request, mockContext.orgSlug);

      // Assert - Verify HTTP call was made with correct ExecutionContext
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/agent-to-agent/'),
        expect.objectContaining({
          context: mockContext,
          metadata: expect.objectContaining({
            current_sub_agent: 'sub-agent-1',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('BUILD mode - delegation logic', () => {
    it('should delegate to sub-agent via HTTP when multiple sub-agents available', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test delegation',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const subAgents = [
        {
          slug: 'marketing',
          organization_slug: ['test-org'],
          name: 'Marketing Agent',
          description: 'Handles marketing tasks',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'marketing',
          tags: [],
          io_schema: {},
          capabilities: ['build'],
          context: 'Marketing context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          slug: 'analytics',
          organization_slug: ['test-org'],
          name: 'Analytics Agent',
          description: 'Handles analytics tasks',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'analytics',
          tags: [],
          io_schema: {},
          capabilities: ['build'],
          context: 'Analytics context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: { message: 'Delegated response' },
          metadata: {},
        },
      };

      agentRegistry.listAgents.mockResolvedValue(subAgents);
      llmService.generateResponse.mockResolvedValue({
        content: 'marketing',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
        },
      });
      agentRegistry.getAgent.mockResolvedValue(subAgents[0] as AgentRecord);
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.payload?.metadata?.resolvedBy).toBe('marketing');
      expect(agentRegistry.listAgents).toHaveBeenCalledWith('test-org');
      expect(llmService.generateResponse).toHaveBeenCalled();
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should use sticky routing when current_sub_agent exists in metadata', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Continue conversation',
        payload: {},
        metadata: {
          userId: 'user-123',
          current_sub_agent: 'marketing',
        },
      };

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: { message: 'Sticky routing response' },
          metadata: {},
        },
      };

      agentRegistry.getAgent.mockResolvedValue({
        slug: 'marketing',
        organization_slug: ['test-org'],
        name: 'Marketing Agent',
        description: 'Marketing agent',
        version: '1.0',
        agent_type: 'context' as const,
        department: 'marketing',
        tags: [],
        io_schema: {},
        capabilities: [],
        context: 'Marketing context',
        endpoint: null,
        llm_config: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.payload?.metadata?.current_sub_agent).toBe('marketing');
      expect(llmService.generateResponse).not.toHaveBeenCalled(); // Should skip LLM selection
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should handle single sub-agent without LLM selection', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Single agent test',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const subAgents = [
        {
          slug: 'only-agent',
          organization_slug: ['test-org'],
          name: 'Only Agent',
          description: 'Single available agent',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'test-department',
          tags: [],
          io_schema: {},
          capabilities: [],
          context: 'Agent context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: { message: 'Single agent response' },
          metadata: {},
        },
      };

      agentRegistry.listAgents.mockResolvedValue(subAgents);
      agentRegistry.getAgent.mockResolvedValue(subAgents[0] as AgentRecord);
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(llmService.generateResponse).not.toHaveBeenCalled(); // Should skip LLM for single agent
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should handle no available sub-agents', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'No agents test',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      agentRegistry.listAgents.mockResolvedValue([]);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain(
        'No sub-agents available for delegation',
      );
    });

    it('should handle HTTP delegation errors', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Error test',
        payload: {},
        metadata: {
          userId: 'user-123',
          current_sub_agent: 'failing-agent',
        },
      };

      agentRegistry.getAgent.mockResolvedValue({
        slug: 'failing-agent',
        organization_slug: ['test-org'],
        name: 'Failing Agent',
        description: 'Failing agent',
        version: '1.0',
        agent_type: 'context' as const,
        department: 'test-department',
        tags: [],
        io_schema: {},
        capabilities: [],
        context: 'Agent context',
        endpoint: null,
        llm_config: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      httpService.post.mockImplementation(() => {
        throw new Error('HTTP request failed');
      });

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.payload?.metadata?.reason).toContain('HTTP request failed');
    });
  });

  describe('LLM-based sub-agent selection', () => {
    it('should use LLM to select best sub-agent based on user message', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Create a marketing campaign',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const subAgents = [
        {
          slug: 'marketing',
          organization_slug: ['test-org'],
          name: 'Marketing Agent',
          description: 'Creates marketing materials',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'marketing',
          tags: [],
          io_schema: {},
          capabilities: [],
          context: 'Marketing context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          slug: 'analytics',
          organization_slug: ['test-org'],
          name: 'Analytics Agent',
          description: 'Analyzes data',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'analytics',
          tags: [],
          io_schema: {},
          capabilities: [],
          context: 'Analytics context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: {
          content: { message: 'Marketing campaign created' },
          metadata: {},
        },
      };

      agentRegistry.listAgents.mockResolvedValue(subAgents);
      llmService.generateResponse.mockResolvedValue({
        content: 'marketing',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
        },
      });
      agentRegistry.getAgent.mockResolvedValue(subAgents[0] as AgentRecord);
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(llmService.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('marketing'),
        '',
        expect.objectContaining({
          executionContext: mockContext,
          maxTokens: 50,
          temperature: 0.1,
        }),
      );
      expect(result.payload?.metadata?.resolvedBy).toBe('marketing');
    });

    it('should fallback to first agent when LLM returns invalid selection', async () => {
      const definition = {
        slug: 'orchestrator',
        displayName: 'Orchestrator Agent',
        agentType: 'orchestrator',
        capabilities: ['orchestrate'],
        execution: { canConverse: false, canPlan: false, canBuild: true },
      } as unknown as AgentRuntimeDefinition;

      const request: TaskRequestDto = {
        mode: AgentTaskMode.BUILD,
        context: mockContext,
        userMessage: 'Test invalid selection',
        payload: {},
        metadata: {
          userId: 'user-123',
        },
      };

      const subAgents = [
        {
          slug: 'agent-1',
          organization_slug: ['test-org'],
          name: 'Agent 1',
          description: 'Agent 1',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'test-department',
          tags: [],
          io_schema: {},
          capabilities: [],
          context: 'Agent 1 context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          slug: 'agent-2',
          organization_slug: ['test-org'],
          name: 'Agent 2',
          description: 'Agent 2',
          version: '1.0',
          agent_type: 'context' as const,
          department: 'test-department',
          tags: [],
          io_schema: {},
          capabilities: [],
          context: 'Agent 2 context',
          endpoint: null,
          llm_config: null,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const subAgentResponse = {
        success: true,
        mode: AgentTaskMode.BUILD,
        payload: { content: {}, metadata: {} },
      };

      agentRegistry.listAgents.mockResolvedValue(subAgents);
      llmService.generateResponse.mockResolvedValue({
        content: 'invalid-agent-slug',
        metadata: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requestId: 'req-123',
          timestamp: new Date().toISOString(),
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          timing: { startTime: Date.now(), endTime: Date.now(), duration: 100 },
          status: 'completed' as const,
        },
      });
      agentRegistry.getAgent.mockResolvedValue(subAgents[0] as AgentRecord);
      httpService.post.mockReturnValue(of({ data: subAgentResponse }) as any);

      // Act
      const result = await service.execute(
        definition,
        request,
        mockContext.orgSlug,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('agent-1'),
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
