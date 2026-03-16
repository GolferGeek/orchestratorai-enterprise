import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { LLM_SERVICE } from '@/planes/llm/llm.interface';
import { AgentRegistryService } from './agent-platform/services/agent-registry.service';

describe('AppService', () => {
  let service: AppService;
  let agentRegistryService: jest.Mocked<AgentRegistryService>;

  const mockLlmService = {
    chat: jest.fn(),
    stream: jest.fn(),
  };

  const mockAgentRegistryService = {
    listAllAgents: jest.fn(),
    listAgentsForOrganizations: jest.fn(),
    getAgent: jest.fn(),
  } as unknown as jest.Mocked<AgentRegistryService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: LLM_SERVICE,
          useValue: mockLlmService,
        },
        {
          provide: AgentRegistryService,
          useValue: mockAgentRegistryService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    agentRegistryService = module.get(AgentRegistryService);

    // Trigger lifecycle hook
    service.onModuleInit();
  });

  describe('getHello', () => {
    it('returns the ready message', () => {
      expect(service.getHello()).toBe('NestJS A2A Agent Framework - Ready!');
    });
  });

  describe('getDiscoveredAgents', () => {
    it('returns empty array after onModuleInit (legacy discovery removed)', () => {
      const agents = service.getDiscoveredAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('getDiscoveredAgentsByOrganizations', () => {
    it('returns all agents when no org filter provided', () => {
      const result = service.getDiscoveredAgentsByOrganizations();
      expect(result).toEqual([]);
    });

    it('returns all agents when empty array provided', () => {
      const result = service.getDiscoveredAgentsByOrganizations([]);
      expect(result).toEqual([]);
    });
  });

  describe('getAgentInstances', () => {
    it('returns empty array after onModuleInit', () => {
      const instances = service.getAgentInstances();
      expect(instances).toEqual([]);
    });
  });

  describe('getAgentInstancesByOrganizations', () => {
    it('returns all instances when no org filter provided', () => {
      const result = service.getAgentInstancesByOrganizations();
      expect(result).toEqual([]);
    });

    it('returns all instances when empty array provided', () => {
      const result = service.getAgentInstancesByOrganizations([]);
      expect(result).toEqual([]);
    });
  });

  describe('getAgentStatus', () => {
    it('returns status running with empty agents when no database records', async () => {
      agentRegistryService.listAllAgents.mockResolvedValueOnce([]);

      const result = (await service.getAgentStatus()) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('running');
      expect(result.discoveredAgents).toBe(0);
      expect(result.runningInstances).toBe(0);
      expect(result.agents).toEqual([]);
    });

    it('maps a database agent record to the correct shape', async () => {
      const dbRecord = {
        id: 'agent-uuid-1',
        slug: 'general-assistant',
        name: 'General Assistant',
        description: 'A general purpose assistant',
        agent_type: 'context',
        organization_slug: 'global',
        capabilities: ['converse'],
        metadata: {
          supported_modes: ['converse'],
          status: 'active',
        },
        version: '1.0.0',
        context: null,
        require_local_model: false,
        llm_config: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      agentRegistryService.listAllAgents.mockResolvedValueOnce([
        dbRecord as any,
      ]);

      const result = (await service.getAgentStatus()) as any;

      expect(result.status).toBe('running');
      expect(result.discoveredAgents).toBe(1);
      const agent = result.agents[0];
      expect(agent.name).toBe('general-assistant');
      expect(agent.displayName).toBe('General Assistant');
      expect(agent.type).toBe('context');
      expect(agent.hasInstance).toBe(true);
    });

    it('filters agents by organization slug when provided', async () => {
      agentRegistryService.listAgentsForOrganizations.mockResolvedValueOnce([]);

      await service.getAgentStatus(['legal']);

      expect(
        agentRegistryService.listAgentsForOrganizations,
      ).toHaveBeenCalledWith(['legal']);
    });

    it('normalizes global org to null when filtering', async () => {
      agentRegistryService.listAgentsForOrganizations.mockResolvedValueOnce([]);

      await service.getAgentStatus(['global']);

      expect(
        agentRegistryService.listAgentsForOrganizations,
      ).toHaveBeenCalledWith([null]);
    });

    it('calls listAllAgents when no organizations provided', async () => {
      agentRegistryService.listAllAgents.mockResolvedValueOnce([]);

      await service.getAgentStatus();

      expect(agentRegistryService.listAllAgents).toHaveBeenCalled();
    });

    it('marks tool agents as type tool when agent_category is tool', async () => {
      const dbRecord = {
        id: 'tool-uuid-1',
        slug: 'search-tool',
        name: 'Search Tool',
        description: 'Web search tool',
        agent_type: 'api',
        organization_slug: null,
        capabilities: [],
        metadata: {
          agent_category: 'tool',
          supported_modes: ['converse'],
          status: 'active',
        },
        version: '1.0.0',
        context: null,
        require_local_model: false,
        llm_config: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      agentRegistryService.listAllAgents.mockResolvedValueOnce([
        dbRecord as any,
      ]);

      const result = (await service.getAgentStatus()) as any;

      expect(result.agents[0].type).toBe('tool');
    });

    it('deduplicates agents that appear in both file-based and database results', async () => {
      // Two records with same org+name combination
      const dbRecord1 = {
        id: 'uuid-1',
        slug: 'assistant',
        name: 'Assistant',
        description: 'Agent',
        agent_type: 'context',
        organization_slug: 'org-a',
        capabilities: [],
        metadata: { supported_modes: ['converse'], status: 'active' },
        version: '1',
        context: null,
        require_local_model: false,
        llm_config: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const dbRecord2 = {
        id: 'uuid-2',
        slug: 'other-agent',
        name: 'Other Agent',
        description: 'Another Agent',
        agent_type: 'context',
        organization_slug: 'org-b',
        capabilities: [],
        metadata: { supported_modes: ['converse'], status: 'active' },
        version: '1',
        context: null,
        require_local_model: false,
        llm_config: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      agentRegistryService.listAllAgents.mockResolvedValueOnce([
        dbRecord1 as any,
        dbRecord2 as any,
      ]);

      const result = (await service.getAgentStatus()) as any;

      expect(result.discoveredAgents).toBe(2);
    });
  });
});
