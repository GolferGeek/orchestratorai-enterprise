import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentModeRouterService } from '../agent-mode-router.service';
import { AgentRegistryService } from '@agent-platform/services/agent-registry.service';
import { AgentRuntimeDefinitionService } from '@agent-platform/services/agent-runtime-definition.service';
import { AgentRunnerRegistryService } from '../agent-runner-registry.service';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { TaskResponseDto } from '../../dto/task-response.dto';
import {
  AgentRuntimeDefinition,
  AgentRecord,
} from '@agent-platform/interfaces/agent.interface';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('AgentModeRouterService - Sovereign Mode Enforcement', () => {
  let service: AgentModeRouterService;
  let agentRegistryService: jest.Mocked<AgentRegistryService>;
  let runtimeDefinitionService: jest.Mocked<AgentRuntimeDefinitionService>;
  let _runnerRegistryService: jest.Mocked<AgentRunnerRegistryService>;

  const createMockAgentRecord = (
    overrides: Partial<AgentRecord> = {},
  ): AgentRecord => ({
    slug: 'test-agent',
    organization_slug: ['test-org'],
    name: 'Test Agent',
    description: 'Test agent description',
    version: '1.0.0',
    agent_type: 'context',
    department: 'testing',
    tags: [],
    io_schema: {},
    capabilities: [],
    context: 'Test context',
    endpoint: null,
    llm_config: null,
    metadata: {},
    require_local_model: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  const createMockRuntimeDefinition = (
    overrides: Partial<AgentRuntimeDefinition> = {},
  ): AgentRuntimeDefinition =>
    ({
      slug: 'test-agent',
      organizationSlug: ['test-org'],
      name: 'Test Agent',
      description: 'Test agent description',
      agentType: 'context',
      department: 'testing',
      tags: [],
      metadata: { tags: [] },
      capabilities: [],
      skills: [],
      communication: { inputModes: [], outputModes: [] },
      execution: {
        modeProfile: 'standard',
        canConverse: true,
        canPlan: true,
        canBuild: true,
        canOrchestrate: false,
        requiresHumanGate: false,
      },
      prompts: {},
      context: null,
      config: null,
      ioSchema: null,
      require_local_model: false,
      record: createMockAgentRecord(),
      ...overrides,
    }) as AgentRuntimeDefinition;

  const createMockTaskRequest = (
    overrides: Partial<TaskRequestDto> = {},
  ): TaskRequestDto => ({
    mode: AgentTaskMode.CONVERSE,
    payload: {},
    context: createMockExecutionContext(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockRunner = {
      execute: jest.fn().mockResolvedValue(
        TaskResponseDto.success(AgentTaskMode.CONVERSE, {
          content: { message: 'Success' },
          metadata: {},
        }),
      ),
    };

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
            getRunner: jest.fn().mockReturnValue(mockRunner),
          },
        },
      ],
    }).compile();

    service = module.get<AgentModeRouterService>(AgentModeRouterService);
    agentRegistryService = module.get(AgentRegistryService);
    runtimeDefinitionService = module.get(AgentRuntimeDefinitionService);
    _runnerRegistryService = module.get(AgentRunnerRegistryService);
  });

  describe('validateSovereignModeCompliance', () => {
    it('should reject non-Ollama provider when agent requires local model', async () => {
      const agentRecord = createMockAgentRecord({
        slug: 'sovereign-agent',
        require_local_model: true,
      });
      const definition = createMockRuntimeDefinition({
        slug: 'sovereign-agent',
        require_local_model: true,
        record: agentRecord,
      });

      agentRegistryService.getAgent.mockResolvedValue(agentRecord);
      runtimeDefinitionService.buildDefinition.mockReturnValue(definition);

      const context = createMockExecutionContext({
        agentSlug: 'sovereign-agent',
        provider: 'openai',
        model: 'gpt-4',
      });

      const request = createMockTaskRequest({
        context,
      });

      await expect(
        service.execute({
          context,
          request,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.execute({
          context,
          request,
        }),
      ).rejects.toThrow('requires local model execution');
    });

    it('should allow Ollama provider when agent requires local model', async () => {
      const agentRecord = createMockAgentRecord({
        slug: 'sovereign-agent',
        require_local_model: true,
      });
      const definition = createMockRuntimeDefinition({
        slug: 'sovereign-agent',
        require_local_model: true,
        record: agentRecord,
      });

      agentRegistryService.getAgent.mockResolvedValue(agentRecord);
      runtimeDefinitionService.buildDefinition.mockReturnValue(definition);

      const context = createMockExecutionContext({
        agentSlug: 'sovereign-agent',
        provider: 'ollama',
        model: 'llama3.2:1b',
      });

      const request = createMockTaskRequest({
        context,
      });

      const result = await service.execute({
        context,
        request,
      });

      expect(result.success).toBe(true);
    });

    it('should allow any provider when agent does not require local model', async () => {
      const agentRecord = createMockAgentRecord({
        slug: 'cloud-agent',
        require_local_model: false,
      });
      const definition = createMockRuntimeDefinition({
        slug: 'cloud-agent',
        require_local_model: false,
        record: agentRecord,
      });

      agentRegistryService.getAgent.mockResolvedValue(agentRecord);
      runtimeDefinitionService.buildDefinition.mockReturnValue(definition);

      const context = createMockExecutionContext({
        agentSlug: 'cloud-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const request = createMockTaskRequest({
        context,
      });

      const result = await service.execute({
        context,
        request,
      });

      expect(result.success).toBe(true);
    });

    it('should allow request with no provider specified for sovereign agent', async () => {
      const agentRecord = createMockAgentRecord({
        slug: 'sovereign-agent',
        require_local_model: true,
      });
      const definition = createMockRuntimeDefinition({
        slug: 'sovereign-agent',
        require_local_model: true,
        record: agentRecord,
      });

      agentRegistryService.getAgent.mockResolvedValue(agentRecord);
      runtimeDefinitionService.buildDefinition.mockReturnValue(definition);

      const context = createMockExecutionContext({
        agentSlug: 'sovereign-agent',
        provider: '', // No provider specified
        model: '',
      });

      const request = createMockTaskRequest({
        context,
      });

      // Should not throw - frontend might set provider later
      const result = await service.execute({
        context,
        request,
      });

      expect(result.success).toBe(true);
    });

    it('should check require_local_model on record if not on definition', async () => {
      const agentRecord = createMockAgentRecord({
        slug: 'sovereign-agent',
        require_local_model: true,
      });
      const definition = createMockRuntimeDefinition({
        slug: 'sovereign-agent',
        require_local_model: undefined, // Not set on definition
        record: agentRecord,
      });

      agentRegistryService.getAgent.mockResolvedValue(agentRecord);
      runtimeDefinitionService.buildDefinition.mockReturnValue(definition);

      const context = createMockExecutionContext({
        agentSlug: 'sovereign-agent',
        provider: 'openai',
        model: 'gpt-4',
      });

      const request = createMockTaskRequest({
        context,
      });

      await expect(
        service.execute({
          context,
          request,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
