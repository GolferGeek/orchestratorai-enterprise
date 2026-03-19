import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@agent-communication/shared-protocols', () => ({
  DataLoaderService: jest.fn().mockImplementation(() => ({
    ensureFile: jest.fn(),
    appendRecord: jest.fn(),
  })),
  postMessageToProtocolApi: jest.fn(),
  checkProviderPreflight: jest.fn(),
  createPaymentRecord: jest.fn(),
  advancePaymentRecord: jest.fn(),
  getAuthHeaders: jest.fn().mockReturnValue({}),
  ProtocolFactoryService: class {},
  providersToConfig: jest.fn().mockReturnValue({}),
  AgentHttpClient: jest.fn(),
  AGENT_ENDPOINTS: {},
  assertCrossAgentBoundary: jest.fn(),
  PipelineTracer: class {},
}));

describe('Ascentek scenario regression list', () => {
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
      resolveWith: jest.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService({} as any, {} as any, {} as any, factoryService as any);
    const ids = service.listScenarios().map((scenario) => scenario.id);
    expect(ids).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
