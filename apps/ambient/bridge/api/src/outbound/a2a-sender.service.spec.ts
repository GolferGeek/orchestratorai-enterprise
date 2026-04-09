import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { A2ASenderService, OutboundRequest } from './a2a-sender.service';
import { SigningService } from '../security/signing.service';
import { ExternalRegistryService, ExternalAgentInfo } from '../registry/external-registry.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';
import { BridgeProtocolService } from '../protocol/bridge-protocol.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REGISTERED_AGENT: ExternalAgentInfo = {
  id: 'ext-agent-001',
  name: 'External Agent',
  description: 'Test external agent',
  url: 'http://ext-agent.io',
  version: '1.0.0',
  capabilities: ['compose'],
  status: 'online',
  lastSeen: new Date().toISOString(),
  trustScore: 50,
  trustLevel: 'neutral',
  interactions: 10,
  registeredAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockDb: Partial<BridgeDatabaseService> = {
  logMessage: jest.fn().mockResolvedValue('mock-msg-id'),
  updateMessageStatus: jest.fn().mockResolvedValue(undefined),
};

const mockProtocol: Partial<BridgeProtocolService> = {
  isCircuitOpen: jest.fn().mockReturnValue(false),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
};

const mockConfigService: Partial<ConfigService> = {
  get: jest.fn(<T>(key: string, defaultValue?: T): T => {
    const values: Record<string, string> = {
      BRIDGE_AGENT_ID: 'orchestratorai-bridge',
      DEFAULT_ORG_SLUG: 'default',
      MACHINE_IDENTITY_STRING: '',
    };
    return (key in values ? values[key] : defaultValue) as T;
  }),
};

describe('A2ASenderService', () => {
  let sender: A2ASenderService;
  let registry: ExternalRegistryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2ASenderService,
        { provide: ConfigService, useValue: mockConfigService },
        SigningService,
        ExternalRegistryService,
        OriginValidatorService,
        { provide: BridgeDatabaseService, useValue: mockDb },
        { provide: BridgeProtocolService, useValue: mockProtocol },
      ],
    }).compile();

    sender = module.get<A2ASenderService>(A2ASenderService);
    registry = module.get<ExternalRegistryService>(ExternalRegistryService);

    // All registry methods are now async
    jest.spyOn(registry, 'getAgent').mockResolvedValue(REGISTERED_AGENT);
    jest.spyOn(registry, 'getAllAgents').mockResolvedValue([REGISTERED_AGENT]);
    jest.spyOn(registry, 'incrementInteractions').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(sender).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // sendToExternalAgent()
  // ---------------------------------------------------------------------------

  describe('sendToExternalAgent()', () => {
    const request: OutboundRequest = {
      targetAgentId: 'ext-agent-001',
      method: 'compose.converse',
      params: { userMessage: 'hello from bridge' },
    };

    it('should send a correctly formatted JSON-RPC 2.0 request', async () => {
      const mockResponseBody = {
        jsonrpc: '2.0',
        id: 'some-uuid',
        result: { success: true },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponseBody,
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0] as string;
      const options = fetchCall[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(url).toBe('http://ext-agent.io');
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('compose.converse');
      expect(body.params).toEqual(request.params);
      expect(typeof body.id).toBe('string');
    });

    it('should include X-Agent-Id and X-Security-Envelope headers', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      const options = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      expect(headers['X-Agent-Id']).toBeDefined();
      expect(headers['X-Security-Envelope']).toBeDefined();

      // Security envelope must be valid JSON
      const envelope = JSON.parse(headers['X-Security-Envelope']);
      expect(envelope.nonce).toBeDefined();
      expect(envelope.signature).toBeDefined();
    });

    it('should return an OutboundResult with success=true on successful response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: { data: 'ok' } }),
      }) as jest.Mock;

      const result = await sender.sendToExternalAgent(request);

      expect(result.success).toBe(true);
      expect(result.targetAgentId).toBe('ext-agent-001');
      expect(result.method).toBe('compose.converse');
      expect(result.targetUrl).toBe('http://ext-agent.io');
      expect(typeof result.requestId).toBe('string');
      expect(typeof result.durationMs).toBe('number');
    });

    it('should return success=false when the response contains an error field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32000, message: 'Agent error' },
        }),
      }) as jest.Mock;

      const result = await sender.sendToExternalAgent(request);
      expect(result.success).toBe(false);
    });

    it('should return a JSON-RPC error response and success=false when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as jest.Mock;

      const result = await sender.sendToExternalAgent(request);

      expect(result.success).toBe(false);
      const response = result.response as { error: { code: number; message: string } };
      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toContain('ECONNREFUSED');
    });

    it('should return success=false when fetch returns a non-OK HTTP status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as jest.Mock;

      const result = await sender.sendToExternalAgent(request);

      expect(result.success).toBe(false);
    });

    it('should call incrementInteractions with success=true after a successful send', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(registry.incrementInteractions).toHaveBeenCalledWith('ext-agent-001', true);
    });

    it('should call incrementInteractions with success=false after a failed send', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(registry.incrementInteractions).toHaveBeenCalledWith('ext-agent-001', false);
    });

    it('should log the outbound message as pending before sending', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(mockDb.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'outbound',
          status: 'pending',
          external_agent_id: 'ext-agent-001',
          method: 'compose.converse',
        }),
      );
    });

    it('should update message status to success after successful send', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(mockDb.updateMessageStatus).toHaveBeenCalledWith(
        'mock-msg-id',
        'success',
        expect.anything(),
        expect.any(Number),
      );
    });

    it('should update message status to error after failed send', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(mockDb.updateMessageStatus).toHaveBeenCalledWith(
        'mock-msg-id',
        'error',
        expect.anything(),
        expect.any(Number),
      );
    });

    it('should record circuit breaker success after successful send', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(mockProtocol.recordSuccess).toHaveBeenCalledWith('ext-agent-001');
    });

    it('should record circuit breaker failure after failed send', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as jest.Mock;

      await sender.sendToExternalAgent(request);

      expect(mockProtocol.recordFailure).toHaveBeenCalledWith('ext-agent-001');
    });

    it('should block the request and return error when circuit breaker is open', async () => {
      (mockProtocol.isCircuitOpen as jest.Mock).mockReturnValue(true);

      const result = await sender.sendToExternalAgent(request);

      expect(result.success).toBe(false);
      expect(result.targetUrl).toBe('blocked');
      expect(global.fetch).not.toHaveBeenCalled?.();
    });
  });

  // ---------------------------------------------------------------------------
  // broadcastToAllAgents()
  // ---------------------------------------------------------------------------

  describe('broadcastToAllAgents()', () => {
    it('should send to all registered agents and return results', async () => {
      jest.spyOn(registry, 'getAllAgents').mockResolvedValue([
        { ...REGISTERED_AGENT, id: 'agent-a', url: 'http://agent-a.io' },
        { ...REGISTERED_AGENT, id: 'agent-b', url: 'http://agent-b.io' },
      ]);

      jest.spyOn(registry, 'getAgent').mockImplementation(async (id: string) => {
        if (id === 'agent-a') return { ...REGISTERED_AGENT, id: 'agent-a', url: 'http://agent-a.io' };
        return { ...REGISTERED_AGENT, id: 'agent-b', url: 'http://agent-b.io' };
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
      }) as jest.Mock;

      const results = await sender.broadcastToAllAgents('system.ping', {});

      expect(results.length).toBe(2);
    });

    it('should return empty array when no agents are registered', async () => {
      jest.spyOn(registry, 'getAllAgents').mockResolvedValue([]);

      const results = await sender.broadcastToAllAgents('system.ping', {});
      expect(results).toEqual([]);
    });

    it('should include failed results without rejecting the entire broadcast', async () => {
      jest.spyOn(registry, 'getAllAgents').mockResolvedValue([
        { ...REGISTERED_AGENT, id: 'agent-ok', url: 'http://ok.io' },
        { ...REGISTERED_AGENT, id: 'agent-fail', url: 'http://fail.io' },
      ]);

      jest.spyOn(registry, 'getAgent').mockImplementation(async (id: string) => {
        if (id === 'agent-ok') return { ...REGISTERED_AGENT, id: 'agent-ok', url: 'http://ok.io' };
        return { ...REGISTERED_AGENT, id: 'agent-fail', url: 'http://fail.io' };
      });

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jsonrpc: '2.0', id: '1', result: {} }),
        })
        .mockRejectedValueOnce(new Error('timeout'));

      const results = await sender.broadcastToAllAgents('system.ping', {});
      expect(results.length).toBe(2);
    });
  });
});
