/**
 * BridgeDispatchService unit tests
 *
 * Tests inbound routing (forward to internal product), outbound routing
 * (forward to external agent), observability events, and direction detection.
 */

import { BridgeDispatchService } from './bridge-dispatch.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { InvokeOutput } from '@orchestrator-ai/transport-types';

const mockOutput: InvokeOutput = { content: 'bridged result', outputType: 'text' };

const mockRouteTarget = {
  product: 'compose',
  baseUrl: 'http://localhost:6300',
};

const mockExternalAgent = {
  id: 'ext-agent-1',
  name: 'Partner Agent',
  url: 'https://partner.example.com',
  status: 'active',
};

function buildObservability() {
  return { emitInvocationEvent: jest.fn().mockResolvedValue(undefined) };
}

function buildA2ARouter() {
  return { resolveRoute: jest.fn().mockReturnValue(mockRouteTarget) };
}

function buildExternalRegistry() {
  return {
    getAgent: jest.fn().mockResolvedValue(mockExternalAgent),
    incrementInteractions: jest.fn().mockResolvedValue(undefined),
  };
}

function buildBridgeDb() {
  return {
    logMessage: jest.fn().mockResolvedValue('msg-uuid-1'),
    updateMessageStatus: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BridgeDispatchService', () => {
  let service: BridgeDispatchService;
  let observability: ReturnType<typeof buildObservability>;
  let router: ReturnType<typeof buildA2ARouter>;
  let registry: ReturnType<typeof buildExternalRegistry>;
  let db: ReturnType<typeof buildBridgeDb>;

  beforeEach(() => {
    observability = buildObservability();
    router = buildA2ARouter();
    registry = buildExternalRegistry();
    db = buildBridgeDb();

    service = new BridgeDispatchService(
      observability as never,
      router as never,
      registry as never,
      db as never,
    );

    // Mock global fetch for HTTP calls
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { output: mockOutput } }),
      text: async () => '',
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('invoke — inbound direction', () => {
    it('logs message, resolves route, and forwards to internal product', async () => {
      const context = createMockExecutionContext({ agentSlug: 'compose-agent' });
      const data = { content: 'external payload' };
      const metadata = { direction: 'inbound', externalAgentId: 'ext-agent-1' };

      const output = await service.invoke(context, data, metadata);

      expect(db.logMessage).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'inbound', external_agent_id: 'ext-agent-1' }),
      );
      expect(router.resolveRoute).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:6300/invoke',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(output).toEqual(mockOutput);
    });

    it('emits invocation.started and invocation.completed events', async () => {
      const context = createMockExecutionContext();
      await service.invoke(context, { content: 'test' }, { direction: 'inbound' });

      const events = observability.emitInvocationEvent.mock.calls;
      expect(events[0]?.[1]?.type).toBe('invocation.started');
      expect(events[1]?.[1]?.type).toBe('invocation.completed');
      expect(events[1]?.[1]?.sourceApp).toBe('bridge');
    });
  });

  describe('invoke — outbound direction', () => {
    it('looks up external agent from registry and forwards request', async () => {
      const context = createMockExecutionContext({ agentSlug: 'my-agent' });
      const data = { content: 'send to partner' };
      const metadata = { direction: 'outbound', targetAgentId: 'ext-agent-1' };

      const output = await service.invoke(context, data, metadata);

      expect(registry.getAgent).toHaveBeenCalledWith('ext-agent-1');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://partner.example.com/invoke',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(output).toEqual(mockOutput);
    });

    it('throws when outbound metadata is missing targetAgentId', async () => {
      const context = createMockExecutionContext();
      const metadata = { direction: 'outbound' }; // no targetAgentId

      await expect(service.invoke(context, { content: 'test' }, metadata)).rejects.toThrow(
        'targetAgentId',
      );
    });
  });
});
