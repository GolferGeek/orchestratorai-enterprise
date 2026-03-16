/**
 * Boundary Wrapper Tests — ascentek-app
 *
 * Verifies that:
 * - Scenario 10 (New OEM Onboarding) uses HTTP calls instead of in-process AscentekService calls
 * - Scenario 8 Step 1 uses HTTP for LubeTech quality inspection
 * - Strict boundary mode enforcement is wired correctly
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockAssertCrossAgentBoundary = jest.fn();
const mockAgentHttpClientCall = jest.fn();

jest.mock('@agent-communication/shared-protocols', () => {
  type PaymentState = 'initiated' | 'pending' | 'verified' | 'failed';
  interface PaymentRecord {
    id: string; provider: string; state: PaymentState; providerRef?: string;
    amount: number; currency: string; correlationId: string;
    initiatedAt: string; updatedAt: string; error?: string;
  }

  const VALID_TRANSITIONS: Record<PaymentState, Set<PaymentState>> = {
    initiated: new Set(['pending'] as PaymentState[]),
    pending: new Set(['verified', 'failed'] as PaymentState[]),
    verified: new Set<PaymentState>(),
    failed: new Set<PaymentState>(),
  };

  function createPaymentRecord(params: {
    id: string; provider: string; amount: number; currency: string;
    correlationId: string; providerRef?: string;
  }): PaymentRecord {
    const now = new Date().toISOString();
    return { ...params, state: 'initiated', initiatedAt: now, updatedAt: now };
  }

  function advancePaymentRecord(
    record: PaymentRecord,
    next: PaymentState,
    update?: { providerRef?: string; error?: string },
  ): PaymentRecord {
    const allowed = VALID_TRANSITIONS[record.state];
    if (!allowed.has(next)) {
      throw new Error(`Invalid payment state transition: ${record.state} -> ${next}`);
    }
    return {
      ...record,
      state: next,
      updatedAt: new Date().toISOString(),
      ...(update?.providerRef !== undefined ? { providerRef: update.providerRef } : {}),
      ...(update?.error !== undefined ? { error: update.error } : {}),
    };
  }

  class PipelineTracer {
    private steps: unknown[] = [];
    private startTime = Date.now();
    private source: string;
    private target: string;
    private method: string;

    constructor(opts: { source: string; target: string; method: string }) {
      this.source = opts.source;
      this.target = opts.target;
      this.method = opts.method;
    }

    traceSync<T extends Record<string, unknown>>(
      label: string, layer: string, provider: string, fn: () => T, metadata?: unknown,
    ): T {
      const result = fn();
      this.steps.push({ label, layer, provider, data: result, metadata, step: this.steps.length + 1, durationMs: 0, timestamp: new Date().toISOString() });
      return result;
    }

    async trace<T extends Record<string, unknown>>(
      label: string, layer: string, provider: string, fn: () => Promise<T>, metadata?: unknown,
    ): Promise<T> {
      const result = await fn();
      this.steps.push({ label, layer, provider, data: result, metadata, step: this.steps.length + 1, durationMs: 0, timestamp: new Date().toISOString() });
      return result;
    }

    complete(messageId: string) {
      return {
        traceId: 'test-trace-id',
        messageId,
        source: this.source,
        target: this.target,
        method: this.method,
        steps: this.steps,
        totalDurationMs: Date.now() - this.startTime,
        startedAt: new Date(this.startTime).toISOString(),
        completedAt: new Date().toISOString(),
        providersUsed: [],
      };
    }
  }

  return {
    PipelineTracer,
    DataLoaderService: jest.fn().mockImplementation(() => ({
      loadFile: jest.fn().mockReturnValue({ records: [] }),
      appendRecord: jest.fn().mockReturnValue({}),
      ensureFile: jest.fn(),
      destroy: jest.fn(),
    })),
    postMessageToProtocolApi: jest.fn(),
    StripeFiatPaymentProvider: jest.fn().mockImplementation(() => ({
      requestPayment: jest.fn().mockResolvedValue({
        invoiceId: 'mock-invoice',
        transactionHash: 'pi_test_intent',
        amount: 1500,
        currency: 'USD',
        status: 'pending',
      }),
    })),
    PaymentPersistenceService: jest.fn().mockImplementation(() => ({
      persistGate: jest.fn(),
      persistReceipt: jest.fn(),
      loadReceipts: jest.fn().mockReturnValue([]),
      loadGates: jest.fn().mockReturnValue([]),
    })),
    checkProviderPreflight: jest.fn().mockResolvedValue({ provider: 'stripe', available: true }),
    createPaymentRecord,
    advancePaymentRecord,
    assertCrossAgentBoundary: mockAssertCrossAgentBoundary,
    enableStrictBoundaryMode: jest.fn(),
    disableStrictBoundaryMode: jest.fn(),
    isStrictBoundaryMode: jest.fn().mockReturnValue(false),
    AgentHttpClient: jest.fn().mockImplementation(() => ({
      call: mockAgentHttpClientCall,
    })),
    AGENT_ENDPOINTS: {
      'sunstream': { baseUrl: 'http://localhost:4007', agent: 'sunstream' },
      'ascentek': { baseUrl: 'http://localhost:4008', agent: 'ascentek' },
    },
    providersToConfig: jest.fn().mockReturnValue({}),
  };
});

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { ScenarioService } from '../scenarios/scenario.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLubeTechInspectionResponse() {
  return {
    batchNumber: 'BN-2026-0221',
    productCode: 'ATK-0W20-SYN',
    facility: 'Golden Valley Blending',
    overallStatus: 'conditional',
    disposition: 'hold',
    failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
    message: 'Quality inspection found 1 failed test(s)',
  };
}

function makeFormulationCatalog() {
  return [
    { id: 'form-001', productCode: 'ATK-0W20-SYN', category: 'synthetic', costPerGallon: 14.5, leadTimeDays: 5 },
  ];
}

function makeMinimalAscentekMocks() {
  return {
    getFormulationCatalog: jest.fn().mockReturnValue(makeFormulationCatalog()),
    lookupFormulation: jest.fn().mockReturnValue({ formulations: makeFormulationCatalog(), qualifyingSpecifications: [] }),
    validateSpec: jest.fn().mockReturnValue({ valid: true, specCode: 'dexos1 Gen 3', meetsSpec: true, reason: 'ok', productId: 'form-001', specFound: true, productFound: true, specification: null, formulation: null }),
    getPricingTiers: jest.fn().mockReturnValue([{ id: 'tier-001', productId: 'form-001', productCode: 'ATK-0W20-SYN', tierName: 'Standard', minVolumeGallons: 100, maxVolumeGallons: 5000, pricePerGallon: 14.5, discountPct: 0, contractRequired: false, paymentTermsDays: 30 }]),
    startOnboarding: jest.fn().mockReturnValue({ companyName: 'Rivian', partnerCode: 'RIVIAN-NEW', steps: [{ id: 's1', stepNumber: 1, title: 'Docs', description: 'Submit docs', requiredDocuments: [], responsibleParty: 'oem', estimatedDays: 5, dependsOn: [] }], totalEstimatedDays: 5, initiatedAt: new Date().toISOString() }),
    getPartnerRegistry: jest.fn().mockReturnValue([]),
  };
}

function makeMinimalLubeTechMock() {
  return {
    inspectQuality: jest.fn().mockReturnValue(makeLubeTechInspectionResponse()),
    getProductionSchedule: jest.fn().mockReturnValue([]),
    getInventoryLevels: jest.fn().mockReturnValue([]),
  };
}

function makeMinimalOemMock() {
  return {
    getPurchaseOrders: jest.fn().mockReturnValue([{ id: 'po-1', status: 'submitted', poNumber: 'PO-001', totalAmount: 1000 }]),
    getSpecRequirements: jest.fn().mockReturnValue([{ id: 'spec-1', requiredSpecCode: 'dexos1 Gen 3' }]),
    getQualityComplaints: jest.fn().mockReturnValue([{ id: 'qc-1', complaintNumber: 'QC-001', productCode: 'PROD', batchNumber: 'BN-001', issueDate: new Date().toISOString(), severity: 'minor', status: 'investigating' }]),
    submitPurchaseOrder: jest.fn().mockResolvedValue({ result: {}, pipelineTrace: {}, messageId: 'msg-1' }),
    querySpecAvailability: jest.fn().mockResolvedValue({ result: {}, pipelineTrace: {}, messageId: 'msg-2' }),
    placeBid: jest.fn().mockResolvedValue({ result: {}, pipelineTrace: {}, messageId: 'msg-3' }),
    getOrderHistory: jest.fn().mockReturnValue([]),
    getApprovedSuppliers: jest.fn().mockReturnValue([]),
  };
}

function makeFactoryService() {
  const paymentProvider = {
    createPaymentGate: jest.fn().mockResolvedValue({
      gateId: 'gate-123',
      amount: 1500,
      currency: 'USD',
      payTo: 'stripe-account',
      memo: 'Quality hold compensation',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    requestPayment: jest.fn().mockResolvedValue({
      invoiceId: 'inv-123',
      transactionHash: 'pi_test_intent',
      amount: 1500,
      currency: 'USD',
      status: 'pending',
    }),
    verifyPayment: jest.fn().mockResolvedValue({
      invoiceId: 'inv-123',
      transactionHash: 'pi_test_intent',
      amount: 1500,
      currency: 'USD',
      status: 'paid',
    }),
  };

  return {
    mergeConfig: jest.fn().mockImplementation((overrides?: Record<string, unknown>) => ({
      discovery: 'well-known',
      transport: 'a2a-jsonrpc',
      negotiation: 'capability-card',
      identity: 'oauth-jwt',
      payment: 'stripe-fiat',
      wallet: 'local-keypair',
      trust: 'allowlist',
      encryption: 'envelope',
      resilience: 'retry',
      observability: 'file-log',
      orchestration: 'pipeline',
      audit: 'hash-chain',
      ...(overrides ?? {}),
    })),
    resolveWith: jest.fn().mockImplementation((layer: string, configOrProviderId: unknown) => {
      const providerId = typeof configOrProviderId === 'string'
        ? configOrProviderId
        : (configOrProviderId as { payment?: string })?.payment;
      if (layer === 'payment' && providerId === 'stripe-fiat') {
        return paymentProvider;
      }
      return undefined;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ascentek-app boundary wrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_boundary_test';

    // Wire default HTTP client call responses
    mockAgentHttpClientCall.mockImplementation((path: string) => {
      if (path.includes('/lube-tech/quality/inspect')) {
        return Promise.resolve(makeLubeTechInspectionResponse());
      }
      if (path.includes('/ascentek/formulations/lookup')) {
        return Promise.resolve({ formulations: makeFormulationCatalog(), qualifyingSpecifications: [] });
      }
      if (path.includes('/ascentek/formulations')) {
        return Promise.resolve(makeFormulationCatalog());
      }
      if (path.includes('/ascentek/specs/validate')) {
        return Promise.resolve({ valid: true, specCode: 'dexos1 Gen 3', meetsSpec: true, reason: 'ok' });
      }
      if (path.includes('/ascentek/pricing')) {
        return Promise.resolve([{ tierName: 'Standard', minVolumeGallons: 100, pricePerGallon: 14.5 }]);
      }
      if (path.includes('/ascentek/onboarding/start')) {
        return Promise.resolve({
          companyName: 'Rivian Automotive LLC',
          partnerCode: 'RIVIAN-NEW',
          steps: [{ id: 's1', stepNumber: 1, title: 'Submit documents', estimatedDays: 5 }],
          totalEstimatedDays: 5,
          initiatedAt: new Date().toISOString(),
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('Scenario 10 uses HTTP calls (not direct AscentekService methods)', async () => {
    const mockAscentek = makeMinimalAscentekMocks();
    const mockLubeTech = makeMinimalLubeTechMock();
    const mockOem = makeMinimalOemMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(mockAscentek as any, mockLubeTech as any, mockOem as any, makeFactoryService() as any);
    await service.runScenario(10);

    // In-process ascentek service methods must NOT have been called for scenario 10 data
    expect(mockAscentek.getFormulationCatalog).not.toHaveBeenCalled();
    expect(mockAscentek.lookupFormulation).not.toHaveBeenCalled();
    expect(mockAscentek.validateSpec).not.toHaveBeenCalled();
    expect(mockAscentek.getPricingTiers).not.toHaveBeenCalled();
    expect(mockAscentek.startOnboarding).not.toHaveBeenCalled();

    // AgentHttpClient.call must have been used for all data lookups
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith('/ascentek/formulations');
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith('/ascentek/formulations/lookup', 'POST', { specCode: 'dexos1 Gen 3' });
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith('/ascentek/specs/validate', 'POST', { specCode: 'dexos1 Gen 3', productId: 'form-001' });
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith('/ascentek/pricing?productId=form-001');
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith('/ascentek/onboarding/start', 'POST', {
      companyName: 'Rivian Automotive LLC',
      partnerCode: 'RIVIAN-NEW',
    });
  });

  it('Scenario 8 step 1 uses HTTP for LubeTech quality inspection', async () => {
    const mockAscentek = makeMinimalAscentekMocks();
    const mockLubeTech = makeMinimalLubeTechMock();
    const mockOem = makeMinimalOemMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(mockAscentek as any, mockLubeTech as any, mockOem as any, makeFactoryService() as any);
    await service.runScenario(8);

    // In-process LubeTechService.inspectQuality must NOT have been called
    expect(mockLubeTech.inspectQuality).not.toHaveBeenCalled();

    // AgentHttpClient must have been called for the lube-tech quality endpoint
    expect(mockAgentHttpClientCall).toHaveBeenCalledWith(
      '/lube-tech/quality/inspect',
      'POST',
      { batchNumber: 'BN-2026-0221' },
    );
  });

  it('Strict boundary mode enforcement: assertCrossAgentBoundary is called', async () => {
    const mockAscentek = makeMinimalAscentekMocks();
    const mockLubeTech = makeMinimalLubeTechMock();
    const mockOem = makeMinimalOemMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(mockAscentek as any, mockLubeTech as any, mockOem as any, makeFactoryService() as any);

    // Run scenario 8 — assertCrossAgentBoundary should be called at entry
    await service.runScenario(8);
    expect(mockAssertCrossAgentBoundary).toHaveBeenCalledWith('ascentek-scenario', 'lube-tech');

    // Run scenario 10 — assertCrossAgentBoundary should be called at entry
    jest.clearAllMocks();
    mockAgentHttpClientCall.mockImplementation((path: string) => {
      if (path.includes('/ascentek/formulations/lookup')) return Promise.resolve({ formulations: [], qualifyingSpecifications: [] });
      if (path.includes('/ascentek/formulations')) return Promise.resolve([]);
      if (path.includes('/ascentek/specs/validate')) return Promise.resolve({ valid: true, specCode: 'dexos1 Gen 3', meetsSpec: true, reason: 'ok' });
      if (path.includes('/ascentek/pricing')) return Promise.resolve([]);
      if (path.includes('/ascentek/onboarding/start')) return Promise.resolve({ companyName: 'Rivian', partnerCode: 'RIVIAN-NEW', steps: [], totalEstimatedDays: 0, initiatedAt: new Date().toISOString() });
      return Promise.resolve({});
    });

    await service.runScenario(10);
    expect(mockAssertCrossAgentBoundary).toHaveBeenCalledWith('oem-partner', 'ascentek');
  });
});
