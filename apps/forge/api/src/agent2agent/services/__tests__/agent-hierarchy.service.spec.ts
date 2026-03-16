import { Test, TestingModule } from '@nestjs/testing';
import { AgentHierarchyService } from '../agent-hierarchy.service';
import { AgentRegistryService } from '../../../agent-platform/services/agent-registry.service';
import { AgentRecord } from '../../../agent-platform/interfaces/agent.interface';

describe('AgentHierarchyService', () => {
  let service: AgentHierarchyService;
  let agentRegistry: jest.Mocked<AgentRegistryService>;

  const makeRecord = (overrides: Partial<AgentRecord> = {}): AgentRecord => ({
    slug: 'test-agent',
    organization_slug: ['test-org'],
    name: 'Test Agent',
    description: 'A test agent',
    version: '1.0.0',
    agent_type: 'context',
    department: 'eng',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentHierarchyService,
        {
          provide: AgentRegistryService,
          useValue: {
            listAllAgents: jest.fn(),
            listAgentsForOrganizations: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentHierarchyService>(AgentHierarchyService);
    agentRegistry = module.get(AgentRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchDatabaseAgents', () => {
    it('should call listAllAgents when no organizations provided', async () => {
      agentRegistry.listAllAgents.mockResolvedValue([]);
      await service.fetchDatabaseAgents();
      expect(agentRegistry.listAllAgents).toHaveBeenCalled();
      expect(agentRegistry.listAgentsForOrganizations).not.toHaveBeenCalled();
    });

    it('should call listAllAgents when empty organizations array', async () => {
      agentRegistry.listAllAgents.mockResolvedValue([]);
      await service.fetchDatabaseAgents([]);
      expect(agentRegistry.listAllAgents).toHaveBeenCalled();
    });

    it('should call listAgentsForOrganizations when organizations provided', async () => {
      agentRegistry.listAgentsForOrganizations.mockResolvedValue([]);
      await service.fetchDatabaseAgents(['my-org']);
      expect(agentRegistry.listAgentsForOrganizations).toHaveBeenCalledWith([
        'my-org',
      ]);
    });

    it('should normalize "global" org to null', async () => {
      agentRegistry.listAgentsForOrganizations.mockResolvedValue([]);
      await service.fetchDatabaseAgents(['global']);
      expect(agentRegistry.listAgentsForOrganizations).toHaveBeenCalledWith([
        null,
      ]);
    });

    it('should normalize empty-string org to null', async () => {
      agentRegistry.listAgentsForOrganizations.mockResolvedValue([]);
      await service.fetchDatabaseAgents(['   ']);
      expect(agentRegistry.listAgentsForOrganizations).toHaveBeenCalledWith([
        null,
      ]);
    });

    it('should handle multiple organizations', async () => {
      agentRegistry.listAgentsForOrganizations.mockResolvedValue([]);
      await service.fetchDatabaseAgents(['org-a', 'global', 'org-b']);
      expect(agentRegistry.listAgentsForOrganizations).toHaveBeenCalledWith([
        'org-a',
        null,
        'org-b',
      ]);
    });
  });

  describe('buildDatabaseHierarchy', () => {
    it('should return empty array for empty records', () => {
      const result = service.buildDatabaseHierarchy([]);
      expect(result).toEqual([]);
    });

    it('should build a simple standalone agent node', () => {
      const record = makeRecord({ slug: 'simple-agent' });
      const result = service.buildDatabaseHierarchy([record]);
      expect(result).toHaveLength(1);
      const node = result[0] as Record<string, unknown>;
      expect(node.id).toBe('simple-agent');
      expect(node.name).toBe('simple-agent');
      expect(node.displayName).toBe('Test Agent');
    });

    it('should group agents by organization', () => {
      const records = [
        makeRecord({ slug: 'agent-a', organization_slug: ['org-a'] }),
        makeRecord({ slug: 'agent-b', organization_slug: ['org-b'] }),
      ];
      const result = service.buildDatabaseHierarchy(records);
      // Both are standalone → 2 roots
      expect(result).toHaveLength(2);
    });

    it('should create orchestrator node with children', () => {
      const orchestrator = makeRecord({
        slug: 'swarm-orchestrator',
        capabilities: ['orchestrate'],
      });
      const child = makeRecord({ slug: 'swarm-worker', capabilities: [] });
      const records = [orchestrator, child];

      const result = service.buildDatabaseHierarchy(records);
      const orchNode = result.find(
        (n) => (n as Record<string, unknown>).id === 'swarm-orchestrator',
      ) as Record<string, unknown>;

      expect(orchNode).toBeDefined();
      const children = orchNode.children as unknown[];
      expect(children).toHaveLength(1);
      expect((children[0] as Record<string, unknown>).id).toBe('swarm-worker');
    });

    it('should leave agents standalone when they do not match orchestrator prefix', () => {
      const orchestrator = makeRecord({
        slug: 'alpha-orchestrator',
        capabilities: ['orchestrate'],
      });
      const unrelated = makeRecord({ slug: 'beta-agent', capabilities: [] });
      const result = service.buildDatabaseHierarchy([orchestrator, unrelated]);

      const orchNode = result.find(
        (n) => (n as Record<string, unknown>).id === 'alpha-orchestrator',
      ) as Record<string, unknown>;
      const standaloneNode = result.find(
        (n) => (n as Record<string, unknown>).id === 'beta-agent',
      );

      expect((orchNode.children as unknown[]).length).toBe(0);
      expect(standaloneNode).toBeDefined();
    });

    it('should detect orchestrator via metadata.orchestrator flag', () => {
      const orchestrator = makeRecord({
        slug: 'meta-orch',
        capabilities: [],
        metadata: { orchestrator: true },
      });
      const result = service.buildDatabaseHierarchy([orchestrator]);
      const node = result[0] as Record<string, unknown>;
      const metadata = node.metadata as Record<string, unknown>;
      expect(metadata.isOrchestrator).toBe(true);
    });

    it('should assign "global" org slug when organization_slug is empty', () => {
      const record = makeRecord({ organization_slug: [] });
      const result = service.buildDatabaseHierarchy([record]);
      const node = result[0] as Record<string, unknown>;
      expect(node.organization).toBe('global');
    });

    it('should set type to "tool" when agent_category is tool', () => {
      const record = makeRecord({ metadata: { agent_category: 'tool' } });
      const result = service.buildDatabaseHierarchy([record]);
      const node = result[0] as Record<string, unknown>;
      expect(node.type).toBe('tool');
    });
  });

  describe('extractExecutionModes', () => {
    it('should default to "immediate" when no execution_modes in metadata', () => {
      const record = makeRecord({ metadata: {} });
      const modes = service.extractExecutionModes(record);
      expect(modes).toEqual(['immediate']);
    });

    it('should extract execution_modes from metadata', () => {
      const record = makeRecord({
        metadata: { execution_modes: ['async', 'sync'] },
      });
      const modes = service.extractExecutionModes(record);
      expect(modes).toContain('async');
      expect(modes).toContain('sync');
    });

    it('should also read executionModes (camelCase) from metadata', () => {
      const record = makeRecord({
        metadata: { executionModes: ['streaming'] },
      });
      const modes = service.extractExecutionModes(record);
      expect(modes).toContain('streaming');
    });

    it('should ignore non-string values in execution_modes array', () => {
      const record = makeRecord({
        metadata: { execution_modes: ['valid', 42, null, '', 'also-valid'] },
      });
      const modes = service.extractExecutionModes(record);
      expect(modes).toContain('valid');
      expect(modes).toContain('also-valid');
      // 42, null, '' are filtered out
      expect(modes).toHaveLength(2);
    });

    it('should deduplicate execution modes', () => {
      const record = makeRecord({
        metadata: { execution_modes: ['async', 'async', 'sync'] },
      });
      const modes = service.extractExecutionModes(record);
      expect(modes.filter((m) => m === 'async')).toHaveLength(1);
    });

    it('should default to "immediate" when execution_modes array is empty', () => {
      const record = makeRecord({ metadata: { execution_modes: [] } });
      const modes = service.extractExecutionModes(record);
      expect(modes).toEqual(['immediate']);
    });
  });
});
