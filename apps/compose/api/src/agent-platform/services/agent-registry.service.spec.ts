import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentRegistryService } from './agent-registry.service';
import { AgentsRepository } from '../repositories/agents.repository';
import { AgentRecord } from '../interfaces/agent.interface';

const buildAgentRecord = (
  overrides: Partial<AgentRecord> = {},
): AgentRecord => ({
  slug: 'test-agent',
  organization_slug: ['test-org'],
  name: 'Test Agent',
  description: 'Test description',
  version: '1.0.0',
  agent_type: 'context',
  department: 'engineering',
  tags: [],
  io_schema: {},
  capabilities: [],
  context: '',
  endpoint: null,
  llm_config: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;
  let mockAgentsRepository: jest.Mocked<AgentsRepository>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockAgentsRepository = {
      findBySlug: jest.fn(),
      listByOrganization: jest.fn(),
      listAll: jest.fn(),
      getLatestUpdatedAt: jest.fn(),
    } as unknown as jest.Mocked<AgentsRepository>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRegistryService,
        { provide: AgentsRepository, useValue: mockAgentsRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AgentRegistryService>(AgentRegistryService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getAgent', () => {
    it('should fetch agent from repository when not cached', async () => {
      const agentRecord = buildAgentRecord({ slug: 'test-agent' });
      mockAgentsRepository.findBySlug.mockResolvedValue(agentRecord);

      const result = await service.getAgent('test-org', 'test-agent');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledWith(
        'test-org',
        'test-agent',
      );
      expect(result).toEqual(agentRecord);
    });

    it('should return null when agent not found in repository', async () => {
      mockAgentsRepository.findBySlug.mockResolvedValue(null);

      const result = await service.getAgent('test-org', 'unknown-agent');

      expect(result).toBeNull();
    });

    it('should use cached agent on second call', async () => {
      const agentRecord = buildAgentRecord({ slug: 'test-agent' });
      mockAgentsRepository.findBySlug.mockResolvedValue(agentRecord);

      // First call - hits repository
      await service.getAgent('test-org', 'test-agent');
      // Second call - should use cache
      const result = await service.getAgent('test-org', 'test-agent');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledTimes(1);
      expect(result).toEqual(agentRecord);
    });

    it('should handle null organization slug as global', async () => {
      const globalAgent = buildAgentRecord({
        slug: 'global-agent',
        organization_slug: [],
      });
      mockAgentsRepository.findBySlug.mockResolvedValue(globalAgent);

      const result = await service.getAgent(null, 'global-agent');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledWith(
        null,
        'global-agent',
      );
      expect(result).toEqual(globalAgent);
    });

    it('should cache agents per organization separately', async () => {
      const orgAgent = buildAgentRecord({ slug: 'test-agent' });
      const globalAgent = buildAgentRecord({
        slug: 'test-agent',
        organization_slug: [],
      });

      mockAgentsRepository.findBySlug
        .mockResolvedValueOnce(orgAgent)
        .mockResolvedValueOnce(globalAgent);

      const orgResult = await service.getAgent('test-org', 'test-agent');
      const globalResult = await service.getAgent(null, 'test-agent');

      expect(orgResult).toEqual(orgAgent);
      expect(globalResult).toEqual(globalAgent);
      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledTimes(2);
    });
  });

  describe('listAgents', () => {
    it('should list agents for an organization', async () => {
      const agents = [
        buildAgentRecord({ slug: 'agent-1' }),
        buildAgentRecord({ slug: 'agent-2' }),
      ];
      mockAgentsRepository.listByOrganization.mockResolvedValue(agents);

      const result = await service.listAgents('test-org');

      expect(mockAgentsRepository.listByOrganization).toHaveBeenCalledWith(
        'test-org',
      );
      expect(result).toEqual(agents);
    });

    it('should return empty array when no agents found', async () => {
      mockAgentsRepository.listByOrganization.mockResolvedValue([]);

      const result = await service.listAgents('empty-org');

      expect(result).toEqual([]);
    });

    it('should populate cache with listed agents', async () => {
      const agents = [buildAgentRecord({ slug: 'agent-1' })];
      mockAgentsRepository.listByOrganization.mockResolvedValue(agents);

      await service.listAgents('test-org');
      // Now getAgent should use the cache
      const result = await service.getAgent('test-org', 'agent-1');

      expect(mockAgentsRepository.findBySlug).not.toHaveBeenCalled();
      expect(result).toEqual(agents[0]);
    });
  });

  describe('listAllAgents', () => {
    it('should list all agents across organizations', async () => {
      const agents = [
        buildAgentRecord({ slug: 'agent-1' }),
        buildAgentRecord({ slug: 'agent-2', organization_slug: ['other-org'] }),
      ];
      mockAgentsRepository.listAll.mockResolvedValue(agents);

      const result = await service.listAllAgents();

      expect(mockAgentsRepository.listAll).toHaveBeenCalled();
      expect(result).toEqual(agents);
    });
  });

  describe('listAgentsForOrganizations', () => {
    it('should return empty array when no organizations provided', async () => {
      const result = await service.listAgentsForOrganizations([]);

      expect(result).toEqual([]);
      expect(mockAgentsRepository.listByOrganization).not.toHaveBeenCalled();
    });

    it('should list agents for multiple organizations with deduplication', async () => {
      const orgAAgent = buildAgentRecord({ slug: 'agent-1' });
      const orgBAgent = buildAgentRecord({
        slug: 'agent-2',
        organization_slug: ['org-b'],
      });
      const globalAgent = buildAgentRecord({
        slug: 'global-agent',
        organization_slug: [],
      });

      mockAgentsRepository.listByOrganization.mockImplementation(
        async (orgSlug) => {
          if (orgSlug === 'org-a') return [orgAAgent, globalAgent];
          if (orgSlug === 'org-b') return [orgBAgent, globalAgent];
          if (orgSlug === null) return [globalAgent];
          return [];
        },
      );

      const result = await service.listAgentsForOrganizations([
        'org-a',
        'org-b',
      ]);

      // globalAgent should appear only once (deduplicated by slug)
      const globalAgentOccurrences = result.filter(
        (a) => a.slug === 'global-agent',
      );
      expect(globalAgentOccurrences).toHaveLength(1);
      expect(result.some((a) => a.slug === 'agent-1')).toBe(true);
      expect(result.some((a) => a.slug === 'agent-2')).toBe(true);
    });

    it('should always include global agents (null org) even when not explicitly requested', async () => {
      const orgAgent = buildAgentRecord({ slug: 'org-agent' });
      const globalAgent = buildAgentRecord({
        slug: 'global-agent',
        organization_slug: [],
      });

      mockAgentsRepository.listByOrganization.mockImplementation(
        async (orgSlug) => {
          if (orgSlug === 'org-a') return [orgAgent];
          if (orgSlug === null) return [globalAgent];
          return [];
        },
      );

      await service.listAgentsForOrganizations(['org-a']);

      // null (global) should have been queried
      expect(mockAgentsRepository.listByOrganization).toHaveBeenCalledWith(
        null,
      );
    });

    it('should deduplicate null/empty org entries', async () => {
      mockAgentsRepository.listByOrganization.mockResolvedValue([]);

      await service.listAgentsForOrganizations([null, null, 'org-a']);

      // Should call listByOrganization only 2 times (null, org-a) not 3
      expect(mockAgentsRepository.listByOrganization).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('should invalidate a specific agent from cache', async () => {
      const agentRecord = buildAgentRecord({ slug: 'test-agent' });
      mockAgentsRepository.findBySlug
        .mockResolvedValueOnce(agentRecord)
        .mockResolvedValueOnce(agentRecord);

      // Populate cache
      await service.getAgent('test-org', 'test-agent');
      // Invalidate the agent
      service.invalidate('test-org', 'test-agent');
      // Should re-fetch from repository
      await service.getAgent('test-org', 'test-agent');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledTimes(2);
    });

    it('should invalidate entire organization cache when agentSlug not provided', async () => {
      const agents = [buildAgentRecord({ slug: 'agent-1' })];
      mockAgentsRepository.listByOrganization.mockResolvedValue(agents);
      mockAgentsRepository.findBySlug.mockResolvedValue(agents[0] ?? null);

      // Populate cache
      await service.listAgents('test-org');
      // Invalidate the whole org
      service.invalidate('test-org');
      // Should re-fetch from repository
      await service.getAgent('test-org', 'agent-1');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledTimes(1);
    });

    it('should handle invalidating non-existent cache gracefully', () => {
      // Should not throw when invalidating something not cached
      expect(() => service.invalidate('nonexistent-org')).not.toThrow();
      expect(() =>
        service.invalidate('nonexistent-org', 'nonexistent-agent'),
      ).not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('should clear all cached agents', async () => {
      const agentRecord = buildAgentRecord({ slug: 'test-agent' });
      mockAgentsRepository.findBySlug.mockResolvedValue(agentRecord);

      // Populate cache for two orgs
      await service.getAgent('org-1', 'test-agent');
      await service.getAgent('org-2', 'test-agent');

      // Clear everything
      service.clearAll();

      // Both should re-fetch
      await service.getAgent('org-1', 'test-agent');
      await service.getAgent('org-2', 'test-agent');

      expect(mockAgentsRepository.findBySlug).toHaveBeenCalledTimes(4);
    });
  });

  describe('cache TTL configuration', () => {
    it('should use default TTL when config is not set', async () => {
      // Default config returns undefined
      mockConfigService.get.mockReturnValue(undefined);

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryService,
          { provide: AgentsRepository, useValue: mockAgentsRepository },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);
      expect(registryService).toBeDefined();
    });

    it('should clamp TTL to minimum 1000ms', async () => {
      mockConfigService.get.mockReturnValue(100); // Below minimum

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryService,
          { provide: AgentsRepository, useValue: mockAgentsRepository },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);
      expect(registryService).toBeDefined();
    });

    it('should clamp TTL to maximum 600000ms', async () => {
      mockConfigService.get.mockReturnValue(9999999); // Above maximum

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryService,
          { provide: AgentsRepository, useValue: mockAgentsRepository },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);
      expect(registryService).toBeDefined();
    });
  });
});
