import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExternalRegistryService, ExternalAgentInfo } from './external-registry.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';
import { ExternalAgentRow } from '../database/bridge-database.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAgentData = (
  overrides: Partial<Omit<ExternalAgentInfo, 'registeredAt' | 'status' | 'lastSeen'>> = {},
): Omit<ExternalAgentInfo, 'registeredAt' | 'status' | 'lastSeen'> => ({
  id: 'agent-test-001',
  name: 'Test Agent',
  description: 'An agent for testing',
  url: 'http://test-agent.io',
  version: '1.0.0',
  capabilities: ['compose', 'rag'],
  trustScore: 0,
  trustLevel: 'unknown',
  interactions: 0,
  ...overrides,
});

const makeRow = (overrides: Partial<ExternalAgentRow> = {}): ExternalAgentRow => ({
  id: 'uuid-1',
  org_slug: 'default',
  agent_id: 'agent-test-001',
  name: 'Test Agent',
  description: 'An agent for testing',
  url: 'http://test-agent.io',
  version: '1.0.0',
  capabilities: ['compose', 'rag'],
  trust_score: 0,
  trust_level: 'unknown',
  interactions_count: 0,
  status: 'unknown',
  last_heartbeat: null,
  allowed_origin: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock BridgeDatabaseService
// ---------------------------------------------------------------------------

const mockDb: jest.Mocked<Pick<
  BridgeDatabaseService,
  | 'getAllAgents'
  | 'getAgent'
  | 'upsertAgent'
  | 'updateHeartbeat'
  | 'updateInteractions'
  | 'deleteAgent'
>> = {
  getAllAgents: jest.fn(),
  getAgent: jest.fn(),
  upsertAgent: jest.fn(),
  updateHeartbeat: jest.fn(),
  updateInteractions: jest.fn(),
  deleteAgent: jest.fn(),
};

describe('ExternalRegistryService', () => {
  let service: ExternalRegistryService;
  let originValidator: OriginValidatorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalRegistryService,
        OriginValidatorService,
        { provide: BridgeDatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ExternalRegistryService>(ExternalRegistryService);
    originValidator = module.get<OriginValidatorService>(OriginValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // registerAgent()
  // ---------------------------------------------------------------------------

  describe('registerAgent()', () => {
    it('should register an agent and return its info', async () => {
      const row = makeRow();
      mockDb.upsertAgent.mockResolvedValue(row);

      const info = await service.registerAgent(makeAgentData());

      expect(info.id).toBe('agent-test-001');
      expect(info.status).toBe('unknown');
      expect(info.registeredAt).toBeDefined();
    });

    it('should add the agent URL origin to the trusted origins', async () => {
      mockDb.upsertAgent.mockResolvedValue(makeRow({ url: 'http://trusted-new.io' }));
      const addSpy = jest.spyOn(originValidator, 'addTrustedOrigin');

      await service.registerAgent(makeAgentData({ url: 'http://trusted-new.io' }));

      expect(addSpy).toHaveBeenCalledWith('http://trusted-new.io');
    });

    it('should make the agent retrievable', async () => {
      mockDb.upsertAgent.mockResolvedValue(makeRow());
      mockDb.getAgent.mockResolvedValue(makeRow());

      await service.registerAgent(makeAgentData());
      const agent = await service.getAgent('agent-test-001');

      expect(agent.name).toBe('Test Agent');
    });
  });

  // ---------------------------------------------------------------------------
  // getAgent()
  // ---------------------------------------------------------------------------

  describe('getAgent()', () => {
    it('should return the registered agent', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow());

      const agent = await service.getAgent('agent-test-001');

      expect(agent).toBeDefined();
      expect(agent.id).toBe('agent-test-001');
    });

    it('should throw NotFoundException for an unknown agent id', async () => {
      mockDb.getAgent.mockResolvedValue(null);

      await expect(service.getAgent('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // getAllAgents()
  // ---------------------------------------------------------------------------

  describe('getAllAgents()', () => {
    it('should return all registered agents', async () => {
      mockDb.getAllAgents.mockResolvedValue([
        makeRow({ agent_id: 'a1', url: 'http://a1.io' }),
        makeRow({ agent_id: 'a2', url: 'http://a2.io' }),
      ]);

      const agents = await service.getAllAgents();
      expect(agents.length).toBe(2);
    });

    it('should return empty array when no agents are registered', async () => {
      mockDb.getAllAgents.mockResolvedValue([]);

      expect(await service.getAllAgents()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // updateHeartbeat()
  // ---------------------------------------------------------------------------

  describe('updateHeartbeat()', () => {
    it('should update lastSeen and set status to online', async () => {
      const updatedRow = makeRow({
        status: 'online',
        last_heartbeat: new Date().toISOString(),
      });

      mockDb.getAgent
        .mockResolvedValueOnce(makeRow()) // existence check
        .mockResolvedValueOnce(updatedRow); // re-fetch after update
      mockDb.updateHeartbeat.mockResolvedValue(undefined);

      const updated = await service.updateHeartbeat('agent-test-001');

      expect(updated.status).toBe('online');
      expect(updated.lastSeen).toBeDefined();
    });

    it('should throw NotFoundException for unknown agent id', async () => {
      mockDb.getAgent.mockResolvedValue(null);

      await expect(service.updateHeartbeat('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // incrementInteractions()
  // ---------------------------------------------------------------------------

  describe('incrementInteractions()', () => {
    it('should increment the interactions counter on success', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 1, trust_score: 50 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', true);

      expect(mockDb.updateInteractions).toHaveBeenCalledWith(
        'agent-test-001',
        2,    // count
        55,   // score +5
        'neutral',
      );
    });

    it('should decrease trust score on failure', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 1, trust_score: 50 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', false);

      expect(mockDb.updateInteractions).toHaveBeenCalledWith(
        'agent-test-001',
        2,
        40,   // score -10
        'neutral',
      );
    });

    it('should not let trust score exceed 100', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 0, trust_score: 99 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', true);

      const [, , score] = mockDb.updateInteractions.mock.calls[0];
      expect(score).toBe(100);
    });

    it('should not let trust score go below 0', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 1, trust_score: 5 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', false);

      const [, , score] = mockDb.updateInteractions.mock.calls[0];
      expect(score).toBe(0);
    });

    it('should set trustLevel to "trusted" when score >= 70', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 1, trust_score: 65 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', true); // 70

      const [, , , level] = mockDb.updateInteractions.mock.calls[0];
      expect(level).toBe('trusted');
    });

    it('should set trustLevel to "neutral" when score is between 30 and 69', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 1, trust_score: 25 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', true); // 30

      const [, , , level] = mockDb.updateInteractions.mock.calls[0];
      expect(level).toBe('neutral');
    });

    it('should set trustLevel to "untrusted" when score < 30 and interactions > 0', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ interactions_count: 2, trust_score: 10 }));
      mockDb.updateInteractions.mockResolvedValue(undefined);

      await service.incrementInteractions('agent-test-001', false); // 0

      const [, , , level] = mockDb.updateInteractions.mock.calls[0];
      expect(level).toBe('untrusted');
    });

    it('should do nothing for an unknown agent id', async () => {
      mockDb.getAgent.mockResolvedValue(null);

      // Must not throw
      await expect(service.incrementInteractions('ghost', true)).resolves.toBeUndefined();
      expect(mockDb.updateInteractions).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deregisterAgent()
  // ---------------------------------------------------------------------------

  describe('deregisterAgent()', () => {
    it('should remove the agent from the registry', async () => {
      mockDb.getAgent
        .mockResolvedValueOnce(makeRow()) // existence check
        .mockResolvedValueOnce(null);     // post-delete check returns null
      mockDb.deleteAgent.mockResolvedValue(undefined);

      await service.deregisterAgent('agent-test-001');

      expect(mockDb.deleteAgent).toHaveBeenCalledWith('agent-test-001');
    });

    it('should remove the agent origin from trusted origins', async () => {
      mockDb.getAgent.mockResolvedValue(makeRow({ url: 'http://to-remove.io' }));
      mockDb.deleteAgent.mockResolvedValue(undefined);
      const removeSpy = jest.spyOn(originValidator, 'removeTrustedOrigin');

      await service.deregisterAgent('agent-test-001');

      expect(removeSpy).toHaveBeenCalledWith('http://to-remove.io');
    });

    it('should throw NotFoundException when deregistering a non-existent agent', async () => {
      mockDb.getAgent.mockResolvedValue(null);

      await expect(service.deregisterAgent('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // discoverAgent()
  // ---------------------------------------------------------------------------

  describe('discoverAgent()', () => {
    it('should fetch the agent card and register the agent', async () => {
      const agentCard = {
        id: 'discovered-agent',
        name: 'Discovered Agent',
        description: 'Found via .well-known',
        url: 'http://discovered.io',
        version: '2.0.0',
        capabilities: ['compose'],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => agentCard,
      }) as jest.Mock;

      mockDb.upsertAgent.mockResolvedValue(
        makeRow({
          agent_id: 'discovered-agent',
          name: 'Discovered Agent',
          url: 'http://discovered.io',
          version: '2.0.0',
          capabilities: ['compose'],
          status: 'online',
        }),
      );

      const info = await service.discoverAgent('http://discovered.io');

      expect(info.id).toBe('discovered-agent');
      expect(info.name).toBe('Discovered Agent');
      expect(info.version).toBe('2.0.0');
      expect(info.status).toBe('online');
      expect(info.capabilities).toEqual(['compose']);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://discovered.io/.well-known/agent.json',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        }),
      );
    });

    it('should throw when the agent card endpoint returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as jest.Mock;

      await expect(service.discoverAgent('http://not-found.io')).rejects.toThrow(
        'Failed to fetch agent card from http://not-found.io/.well-known/agent.json: HTTP 404',
      );
    });

    it('should strip trailing slash from the URL before fetching', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'slash-agent',
          name: 'Slash',
          url: 'http://slash.io',
          capabilities: [],
        }),
      }) as jest.Mock;

      mockDb.upsertAgent.mockResolvedValue(makeRow({ agent_id: 'slash-agent', url: 'http://slash.io' }));

      await service.discoverAgent('http://slash.io/');

      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        'http://slash.io/.well-known/agent.json',
      );
    });

    it('should handle capability entries as either strings or objects with id', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'cap-agent',
          name: 'Cap Agent',
          url: 'http://cap.io',
          capabilities: ['string-cap', { id: 'object-cap' }],
        }),
      }) as jest.Mock;

      mockDb.upsertAgent.mockResolvedValue(
        makeRow({
          agent_id: 'cap-agent',
          url: 'http://cap.io',
          capabilities: ['string-cap', 'object-cap'],
        }),
      );

      const info = await service.discoverAgent('http://cap.io');
      expect(info.capabilities).toEqual(['string-cap', 'object-cap']);
    });
  });
});
