import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@agent-communication/shared-protocols', () => ({
  DataLoaderService: jest.fn().mockImplementation(() => ({
    ensureFile: jest.fn(),
    appendRecord: jest.fn(),
  })),
  postMessageToProtocolApi: jest.fn(),
  ProtocolFactoryService: class {},
  providersToConfig: jest.fn().mockReturnValue({}),
  AgentHttpClient: jest.fn(),
  AGENT_ENDPOINTS: {},
  assertCrossAgentBoundary: jest.fn(),
  PipelineTracer: class {},
}));

describe('SunStream scenario regression list', () => {
  it('lists expected scenario IDs including suite additions', async () => {
    const { ScenarioService } = await import('../scenario.service');
    const factoryService = {
      mergeConfig: jest.fn().mockImplementation((overrides: Record<string, unknown> | undefined) => ({
        discovery: 'well-known',
        transport: 'http-rest',
        negotiation: 'capability-card',
        identity: 'local-keys',
        payment: 'mock',
        wallet: 'local-keypair',
        trust: 'allowlist',
        encryption: 'none',
        resilience: 'retry',
        observability: 'file-log',
        orchestration: 'pipeline',
        audit: 'hash-chain',
        ...(overrides ?? {}),
      })),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService({} as any, {} as any, {} as any, factoryService as any);
    const ids = service.listScenarios().map((scenario) => scenario.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 11, 12, 13, 14, 15]);
  });
});
