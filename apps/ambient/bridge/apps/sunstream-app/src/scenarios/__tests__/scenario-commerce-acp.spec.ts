import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@agent-communication/shared-protocols', () => {
  class PipelineTracer {
    private steps: Array<Record<string, unknown>> = [];
    constructor(
      private readonly opts: { source: string; target: string; method: string },
    ) {}
    traceSync<T extends Record<string, unknown>>(label: string, layer: string, provider: string, fn: () => T): T {
      const data = fn();
      this.steps.push({ stepNumber: this.steps.length + 1, label, layer, provider, data });
      return data;
    }
    complete(messageId: string) {
      return { messageId, source: this.opts.source, target: this.opts.target, method: this.opts.method, steps: this.steps };
    }
  }

  return {
    PipelineTracer,
    DataLoaderService: jest.fn().mockImplementation(() => ({ ensureFile: jest.fn(), appendRecord: jest.fn() })),
    postMessageToProtocolApi: jest.fn(),
    AgentHttpClient: jest.fn(),
    AGENT_ENDPOINTS: {},
    assertCrossAgentBoundary: jest.fn(),
    ProtocolFactoryService: class {},
    providersToConfig: jest.fn().mockReturnValue({}),
  };
});

describe('SunStream Scenario 14 — Commerce ACP', () => {
  it('lists and runs scenario 14 with completed checkout lifecycle', async () => {
    const { ScenarioService } = await import('../scenario.service');
    const factoryService = {
      mergeConfig: jest.fn().mockImplementation((overrides: Record<string, unknown> | undefined) => ({
        discovery: 'well-known',
        transport: 'http-rest',
        negotiation: 'commerce-cart-negotiation',
        identity: 'oauth-jwt',
        payment: 'commerce-checkout',
        wallet: 'local-keypair',
        trust: 'allowlist',
        encryption: 'tls-mutual',
        resilience: 'retry',
        observability: 'opentelemetry',
        orchestration: 'commerce-checkout-fsm',
        audit: 'hash-chain',
        ...(overrides ?? {}),
      })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService({} as any, {} as any, {} as any, factoryService as any);
    const listed = service.listScenarios();
    expect(listed.some((scenario) => scenario.id === 14)).toBe(true);

    const executed = await service.runScenario(14);
    const lifecycle = executed.result.lifecycle as string[];
    expect(lifecycle).toEqual(['cart-created', 'cart-updated', 'payment-pending', 'completed']);
  });
});
