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

describe('Ascentek Scenario 12 — A2A full suite', () => {
  it('lists and runs scenario 12 with completed lifecycle', async () => {
    const { ScenarioService } = await import('../scenario.service');
    const factoryService = {
      mergeConfig: jest.fn().mockImplementation((overrides: Record<string, unknown> | undefined) => ({
        discovery: 'a2a-agent-card',
        transport: 'a2a-jsonrpc',
        negotiation: 'a2a-skill-negotiation',
        identity: 'oauth-jwt',
        payment: 'mock',
        wallet: 'local-keypair',
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
    expect(listed.some((scenario) => scenario.id === 12)).toBe(true);

    const executed = await service.runScenario(12);
    const lifecycle = executed.result.lifecycle as string[];
    expect(lifecycle).toEqual(['submitted', 'working', 'completed']);
  });
});
