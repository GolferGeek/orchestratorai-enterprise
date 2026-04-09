import { Test, TestingModule } from '@nestjs/testing';
import { AgentRegistryService } from './agent-registry.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

const makeRow = (slug: string): Record<string, unknown> => ({
  slug,
  name: `${slug} agent`,
  description: 'Test agent',
  agent_type: 'context',
  organization_slug: 'org-a',
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

// Build a chainable mock that ends in a promise resolving to { data, error }
const makeChainable = (result: {
  data: unknown;
  error: null | { message: string };
}) => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'order', 'limit', 'update', 'single'];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so await works
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  chain['catch'] = (reject: (e: unknown) => unknown) =>
    Promise.resolve(result).catch(reject);
  return chain;
};

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;
  let mockDb: {
    from: jest.Mock;
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      from: jest.fn(),
      rawQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRegistryService,
        { provide: DATABASE_SERVICE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AgentRegistryService>(AgentRegistryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listAgents', () => {
    it('should aggregate agents from database', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({
          data: [makeRow('agent-a'), makeRow('agent-b')],
          error: null,
        }),
      );

      const result = await service.listAgents();

      expect(result.agents).toHaveLength(2);
      expect(result.sources).toEqual(['database']);
    });

    it('should propagate errors when database query fails', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({ data: null, error: { message: 'DB down' } }),
      );

      await expect(service.listAgents()).rejects.toThrow(
        'Failed to query agents: DB down',
      );
    });
  });

  describe('getAgent', () => {
    it('should return agent from database when found', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({ data: makeRow('my-agent'), error: null }),
      );

      const result = await service.getAgent('my-agent');

      expect(result.agent.slug).toBe('my-agent');
      expect(result.source).toBe('database');
    });

    it('should throw NotFoundException when agent is not found', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({ data: null, error: { message: 'Not found' } }),
      );

      await expect(service.getAgent('missing-agent')).rejects.toThrow(
        'Agent "missing-agent" not found',
      );
    });

    it('should throw NotFoundException when data is null', async () => {
      mockDb.from.mockReturnValue(makeChainable({ data: null, error: null }));

      await expect(service.getAgent('missing-agent')).rejects.toThrow(
        'Agent "missing-agent" not found',
      );
    });
  });

  describe('updateAgentConfig', () => {
    it('should update agent config in database', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({ data: makeRow('my-agent'), error: null }),
      );

      const result = await service.updateAgentConfig('my-agent', {
        config: { key: 'value' },
      });

      expect(result.slug).toBe('my-agent');
    });

    it('should throw when database update fails', async () => {
      mockDb.from.mockReturnValue(
        makeChainable({ data: null, error: { message: 'DB error' } }),
      );

      await expect(
        service.updateAgentConfig('ghost-agent', { config: {} }),
      ).rejects.toThrow(
        'Failed to update config for agent "ghost-agent": DB error',
      );
    });
  });

  describe('getStats', () => {
    it('should aggregate stats from database', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { agent_type: 'context', count: '10' },
          { agent_type: 'rag', count: '5' },
        ],
        error: null,
      });

      const result = await service.getStats();

      expect(result.stats).toHaveLength(2);
      expect(result.sources).toEqual(['database']);
    });

    it('should propagate errors when stats query fails', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'Stats query failed' },
      });

      await expect(service.getStats()).rejects.toThrow(
        'Failed to aggregate agent stats: Stats query failed',
      );
    });
  });
});
