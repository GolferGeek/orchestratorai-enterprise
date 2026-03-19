import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@agent-communication/shared-protocols', () => {
  class PipelineTracer {
    private steps: Array<Record<string, unknown>> = [];
    constructor(
      private readonly opts: { source: string; target: string; method: string },
    ) {}
    traceSync<T extends Record<string, unknown>>(
      label: string,
      layer: string,
      provider: string,
      fn: () => T,
    ): T {
      const data = fn();
      this.steps.push({ stepNumber: this.steps.length + 1, label, layer, provider, data });
      return data;
    }
    complete(messageId: string) {
      return {
        messageId,
        source: this.opts.source,
        target: this.opts.target,
        method: this.opts.method,
        steps: this.steps,
      };
    }
  }

  return {
    PipelineTracer,
    DataLoaderService: jest.fn().mockImplementation(() => ({
      ensureFile: jest.fn(),
      appendRecord: jest.fn(),
    })),
    postMessageToProtocolApi: jest.fn(),
    checkProviderPreflight: jest.fn(),
    createPaymentRecord: jest.fn(),
    advancePaymentRecord: jest.fn(),
    AgentHttpClient: jest.fn(),
    AGENT_ENDPOINTS: {},
    assertCrossAgentBoundary: jest.fn(),
    getAuthHeaders: jest.fn().mockReturnValue({}),
    ProtocolFactoryService: class {},
    providersToConfig: jest.fn().mockReturnValue({}),
  };
});

describe('Ascentek Scenario 15 — mixed suite A2A + Coinbase x402', () => {
  it('lists and runs scenario 15 with paid lifecycle completion', async () => {
    const { ScenarioService } = await import('../scenario.service');
    const factoryService = {
      mergeConfig: jest.fn().mockImplementation((overrides: Record<string, unknown> | undefined) => ({
        discovery: 'a2a-agent-card',
        transport: 'a2a-jsonrpc',
        negotiation: 'a2a-skill-negotiation',
        identity: 'oauth-jwt',
        payment: 'x402-usdc',
        wallet: 'coinbase-cdp',
        trust: 'a2a-jws-trust',
        encryption: 'tls-mutual',
        resilience: 'circuit-breaker',
        observability: 'opentelemetry',
        orchestration: 'a2a-task-lifecycle',
        audit: 'hash-chain',
        ...(overrides ?? {}),
      })),
      resolveWith: jest.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService({} as any, {} as any, {} as any, factoryService as any);
    const listed = service.listScenarios();
    expect(listed.some((scenario) => scenario.id === 15)).toBe(true);

    const executed = await service.runScenario(15);
    const stages = executed.result.stages as string[];
    const lifecycle = executed.result.lifecycle as string[];
    expect(stages).toEqual(['a2a-agent-card', 'a2a-skill-negotiation', 'x402-usdc', 'a2a-task-lifecycle']);
    expect(lifecycle).toEqual(['submitted', 'working', 'completed']);
  });
});
