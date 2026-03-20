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
    DataLoaderService: jest.fn().mockImplementation(() => ({ ensureFile: jest.fn(), appendRecord: jest.fn(), loadFile: jest.fn().mockReturnValue({ records: [] }) })),
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

describe('Buildwell Scenario 13 — AGNTCY', () => {
  it('lists and runs scenario 13 with AGNTCY stages', async () => {
    const { ScenarioService } = await import('../scenario.service');
    const factoryService = {
      mergeConfig: jest.fn().mockImplementation((overrides: Record<string, unknown> | undefined) => ({
        discovery: 'agntcy-oasf',
        transport: 'http-rest',
        negotiation: 'capability-card',
        identity: 'agntcy-crypto-identity',
        payment: 'mock',
        wallet: 'local-keypair',
        trust: 'reputation',
        encryption: 'agntcy-slim',
        resilience: 'retry',
        observability: 'opentelemetry',
        orchestration: 'pipeline',
        audit: 'hash-chain',
        ...(overrides ?? {}),
      })),
      resolveWith: jest.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService({} as any, {} as any, {} as any, factoryService as any);
    expect(service.listScenarios().some((scenario) => scenario.id === 13)).toBe(true);

    const executed = await service.runScenario(13);
    const stages = executed.result.stages as string[];
    expect(stages).toEqual(['oasf-discovery', 'crypto-identity', 'slim-encryption']);
  });
});
