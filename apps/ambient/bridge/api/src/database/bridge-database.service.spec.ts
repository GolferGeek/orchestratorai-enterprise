import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';
import { BridgeDatabaseService } from './bridge-database.service';
import { ExternalAgentRow, A2AMessageRow } from './bridge-database.types';

/** Build a fully-chainable query builder mock. */
function buildQb(terminalResult: unknown = { data: null, error: null }): any {
  const qb: Record<string, jest.Mock> = {} as any;
  const chainMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'order',
    'limit',
    'is',
    'in',
  ];
  chainMethods.forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb['single'] = jest.fn().mockResolvedValue(terminalResult);
  qb['maybeSingle'] = jest.fn().mockResolvedValue(terminalResult);
  // Make the builder itself awaitable for non-.single() terminal calls
  qb['then'] = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminalResult).then(resolve),
    );
  return qb;
}

const makeAgent = (overrides: Partial<ExternalAgentRow> = {}): ExternalAgentRow => ({
  id: 'agent-uuid-001',
  org_slug: 'test-org',
  agent_id: 'external-agent-1',
  name: 'Test Agent',
  url: 'https://example.com/agent',
  trust_score: 50,
  trust_level: 'neutral',
  interactions_count: 0,
  status: 'online',
  allowed_origin: true,
  ...overrides,
});

describe('BridgeDatabaseService', () => {
  let service: BridgeDatabaseService;
  let mockDb: { from: jest.Mock };

  function buildMockDb(qb: any = buildQb()) {
    return { from: jest.fn().mockReturnValue(qb) };
  }

  beforeEach(async () => {
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeDatabaseService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<BridgeDatabaseService>(BridgeDatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getAllAgents
  // ---------------------------------------------------------------------------

  describe('getAllAgents()', () => {
    it('returns all agents when no orgSlug filter provided', async () => {
      const agents = [makeAgent()];
      const qb = buildQb({ data: agents, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.getAllAgents();

      expect(mockDb.from).toHaveBeenCalledWith('ambient', 'external_agents');
      expect(result).toEqual(agents);
    });

    it('applies eq filter when orgSlug is provided', async () => {
      const agents = [makeAgent({ org_slug: 'acme' })];
      const qb = buildQb({ data: agents, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.getAllAgents('acme');

      expect(qb.eq).toHaveBeenCalledWith('org_slug', 'acme');
      expect(result).toEqual(agents);
    });

    it('throws when the database returns an error', async () => {
      const qb = buildQb({ data: null, error: { message: 'connection lost' } });
      mockDb.from.mockReturnValue(qb);

      await expect(service.getAllAgents()).rejects.toThrow(
        'Failed to fetch external agents: connection lost',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getAgent
  // ---------------------------------------------------------------------------

  describe('getAgent()', () => {
    it('returns the agent row when found', async () => {
      const agent = makeAgent();
      const qb = buildQb({ data: agent, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.getAgent('external-agent-1');

      expect(mockDb.from).toHaveBeenCalledWith('ambient', 'external_agents');
      expect(qb.eq).toHaveBeenCalledWith('agent_id', 'external-agent-1');
      expect(result).toEqual(agent);
    });

    it('returns null when agent is not found', async () => {
      const qb = buildQb({ data: null, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.getAgent('ghost-agent');

      expect(result).toBeNull();
    });

    it('throws when the database returns an error', async () => {
      const qb = buildQb({
        data: null,
        error: { message: 'query failed' },
      });
      mockDb.from.mockReturnValue(qb);

      await expect(service.getAgent('bad-id')).rejects.toThrow(
        'Failed to fetch external agent bad-id: query failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // upsertAgent (registerAgent)
  // ---------------------------------------------------------------------------

  describe('upsertAgent()', () => {
    it('upserts an agent and returns the persisted row', async () => {
      const agent = makeAgent();
      const qb = buildQb({ data: agent, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.upsertAgent({
        org_slug: 'test-org',
        agent_id: 'external-agent-1',
        url: 'https://example.com/agent',
        trust_score: 50,
        trust_level: 'neutral',
        interactions_count: 0,
        status: 'online',
        allowed_origin: true,
      });

      expect(mockDb.from).toHaveBeenCalledWith('ambient', 'external_agents');
      expect(qb.upsert).toHaveBeenCalled();
      expect(result).toEqual(agent);
    });

    it('throws when the upsert fails', async () => {
      const qb = buildQb({ data: null, error: { message: 'constraint violation' } });
      mockDb.from.mockReturnValue(qb);

      await expect(
        service.upsertAgent({ org_slug: 'org', agent_id: 'id', url: 'http://x', trust_score: 0, trust_level: 'unknown', interactions_count: 0, status: 'offline', allowed_origin: false }),
      ).rejects.toThrow('Failed to upsert external agent: constraint violation');
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage
  // ---------------------------------------------------------------------------

  describe('logMessage()', () => {
    it('inserts an A2A message and returns the generated id', async () => {
      const qb = buildQb({ data: { id: 'msg-uuid-001' }, error: null });
      mockDb.from.mockReturnValue(qb);

      const message: A2AMessageRow = {
        org_slug: 'test-org',
        direction: 'outbound',
        status: 'pending',
        method: 'agent.converse',
      };

      const id = await service.logMessage(message);

      expect(mockDb.from).toHaveBeenCalledWith('ambient', 'a2a_messages');
      expect(qb.insert).toHaveBeenCalledWith(message);
      expect(id).toBe('msg-uuid-001');
    });

    it('throws when the insert returns an error', async () => {
      const qb = buildQb({ data: null, error: { message: 'insert failed' } });
      mockDb.from.mockReturnValue(qb);

      await expect(
        service.logMessage({ org_slug: 'org', direction: 'inbound', status: 'pending' }),
      ).rejects.toThrow('Failed to log A2A message: insert failed');
    });
  });

  // ---------------------------------------------------------------------------
  // updateMessageStatus
  // ---------------------------------------------------------------------------

  describe('updateMessageStatus()', () => {
    it('updates status without optional fields when only status provided', async () => {
      const qb = buildQb({ data: null, error: null });
      mockDb.from.mockReturnValue(qb);

      await service.updateMessageStatus('msg-001', 'success');

      expect(qb.update).toHaveBeenCalledWith({ status: 'success' });
      expect(qb.eq).toHaveBeenCalledWith('id', 'msg-001');
    });

    it('includes response_payload and duration_ms when provided', async () => {
      const qb = buildQb({ data: null, error: null });
      mockDb.from.mockReturnValue(qb);

      await service.updateMessageStatus('msg-001', 'success', { result: 'ok' }, 123);

      expect(qb.update).toHaveBeenCalledWith({
        status: 'success',
        response_payload: { result: 'ok' },
        duration_ms: 123,
      });
    });

    it('throws when update fails', async () => {
      const qb = buildQb({ data: null, error: { message: 'update error' } });
      mockDb.from.mockReturnValue(qb);

      await expect(service.updateMessageStatus('msg-001', 'error')).rejects.toThrow(
        'Failed to update message status for msg-001: update error',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Uses DATABASE_SERVICE injection token — not a raw Supabase client
  // ---------------------------------------------------------------------------

  it('uses DATABASE_SERVICE injection token, not a raw createClient call', () => {
    // Verify the injected db is the mock and that service delegates to it.
    // If the service called createClient() directly, mockDb.from would never
    // be invoked and these calls would fail.
    service.getAllAgents();
    expect(mockDb.from).toHaveBeenCalled();
  });
});
