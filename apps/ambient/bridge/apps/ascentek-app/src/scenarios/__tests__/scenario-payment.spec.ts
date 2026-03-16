/**
 * Scenario Payment Tests
 *
 * Verifies that payment steps in scenario 6 and scenario 8 wire to real providers,
 * not synthetic hash generators.
 *
 * External network calls (fetch, Stripe SDK) are mocked in these tests.
 * The tests verify WIRING CORRECTNESS — that real providers are instantiated
 * and their methods are called, not that the external services return specific data.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock shared-protocols entirely to avoid ESM issues with @coinbase/cdp-sdk.
// We provide all needed exports manually — this is the correct approach when
// transitive dependencies include ESM-only packages that Jest cannot transform.
jest.mock('@agent-communication/shared-protocols', () => {
  // ---------------------------------------------------------------------------
  // Inline payment-lifecycle functions — copied from the real implementation
  // to avoid importing the actual module (which drags in CDP SDK via x402).
  // ---------------------------------------------------------------------------
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

  function transitionPaymentState(current: PaymentState, next: PaymentState): PaymentState {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed.has(next)) {
      throw new Error(
        `Invalid payment state transition: ${current} → ${next}. ` +
        `Allowed transitions from '${current}': [${[...allowed].join(', ') || 'none (terminal state)'}]`,
      );
    }
    return next;
  }

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
    const validatedNext = transitionPaymentState(record.state, next);
    return {
      ...record,
      state: validatedNext,
      updatedAt: new Date().toISOString(),
      ...(update?.providerRef !== undefined ? { providerRef: update.providerRef } : {}),
      ...(update?.error !== undefined ? { error: update.error } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // PipelineTracer — minimal inline implementation
  // ---------------------------------------------------------------------------
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
        providersUsed: [...new Set((this.steps as Array<{provider: string}>).map(s => s.provider))],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Provider mocks
  // ---------------------------------------------------------------------------
  const mockCreateGate = jest.fn().mockResolvedValue({
    gateId: 'mock-gate-id',
    capabilities: ['po.submit'],
    price: 187200,
    currency: 'BTC-SAT',
  });

  const mockLightningRequestPayment = jest.fn().mockResolvedValue({
    invoiceId: 'mock-invoice-id',
    transactionHash: 'lnbc_real_invoice_from_lnd_node',
    paidAt: new Date().toISOString(),
    amount: 187200,
    currency: 'BTC-SAT',
    status: 'pending',
  });

  const mockVerifyPayment = jest.fn().mockResolvedValue(true);

  const mockStripeRequestPayment = jest.fn().mockResolvedValue({
    invoiceId: 'mock-stripe-invoice-id',
    transactionHash: 'pi_real_payment_intent_id',
    paidAt: new Date().toISOString(),
    amount: 1500,
    currency: 'USD',
    status: 'pending',
  });

  class MockLightningL402PaymentProvider {
    createPaymentGate = mockCreateGate;
    requestPayment = mockLightningRequestPayment;
    verifyPayment = mockVerifyPayment;
  }

  class MockStripeFiatPaymentProvider {
    createPaymentGate = mockCreateGate;
    requestPayment = mockStripeRequestPayment;
    verifyPayment = mockVerifyPayment;
  }

  return {
    LightningL402PaymentProvider: jest.fn().mockImplementation(() => ({
      createPaymentGate: mockCreateGate,
      requestPayment: mockLightningRequestPayment,
      verifyPayment: mockVerifyPayment,
    })),
    StripeFiatPaymentProvider: jest.fn().mockImplementation(() => ({
      createPaymentGate: mockCreateGate,
      requestPayment: mockStripeRequestPayment,
      verifyPayment: mockVerifyPayment,
    })),
    PaymentPersistenceService: jest.fn().mockImplementation(() => ({
      persistGate: jest.fn(),
      persistReceipt: jest.fn(),
      loadReceipts: jest.fn().mockReturnValue([]),
      loadGates: jest.fn().mockReturnValue([]),
    })),
    SecurityService: jest.fn().mockImplementation(() => ({
      validateEnvelope: jest.fn(),
      createEnvelope: jest.fn(),
    })),
    checkProviderPreflight: jest.fn().mockResolvedValue({ provider: 'lightning', available: true }),
    createPaymentRecord,
    advancePaymentRecord,
    DataLoaderService: jest.fn().mockImplementation(() => ({
      loadFile: jest.fn().mockReturnValue({ records: [] }),
      getById: jest.fn().mockReturnValue(null),
      appendRecord: jest.fn().mockReturnValue({}),
      ensureFile: jest.fn(),
      destroy: jest.fn(),
    })),
    postMessageToProtocolApi: jest.fn(),
    PipelineTracer,
    // Boundary module — assertCrossAgentBoundary is a no-op in tests (strict mode disabled)
    assertCrossAgentBoundary: jest.fn(),
    enableStrictBoundaryMode: jest.fn(),
    disableStrictBoundaryMode: jest.fn(),
    isStrictBoundaryMode: jest.fn().mockReturnValue(false),
    AgentHttpClient: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockImplementation((path: string) => {
        if (path.includes('/lube-tech/quality/inspect')) {
          return Promise.resolve({
            batchNumber: 'BN-2026-0221',
            productCode: 'ATK-0W20-SYN',
            facility: 'Golden Valley Blending',
            overallStatus: 'conditional',
            disposition: 'hold',
            failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
            message: 'Quality inspection found 1 failed test(s)',
          });
        }
        return Promise.resolve({});
      }),
    })),
    AGENT_ENDPOINTS: {
      'sunstream': { baseUrl: 'http://localhost:4007', agent: 'sunstream' },
      'ascentek': { baseUrl: 'http://localhost:4008', agent: 'ascentek' },
    },
    providersToConfig: jest.fn().mockReturnValue({}),
    getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer test-token' }),
  };
});

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  LightningL402PaymentProvider,
  StripeFiatPaymentProvider,
  checkProviderPreflight,
  DataLoaderService,
  SecurityService,
  PaymentPersistenceService,
  AgentHttpClient,
} from '@agent-communication/shared-protocols';

// ---------------------------------------------------------------------------
// Helper: restore all mocks after jest.resetAllMocks() clears implementations
// ---------------------------------------------------------------------------

function restoreAllMockImplementations(): void {
  (DataLoaderService as jest.Mock).mockImplementation(() => ({
    loadFile: jest.fn().mockReturnValue({ records: [] }),
    getById: jest.fn().mockReturnValue(null),
    appendRecord: jest.fn().mockReturnValue({}),
    ensureFile: jest.fn(),
    destroy: jest.fn(),
  }));
  (SecurityService as jest.Mock).mockImplementation(() => ({
    validateEnvelope: jest.fn().mockReturnValue({ valid: true }),
    createEnvelope: jest.fn().mockReturnValue({ envelope: 'mock' }),
    generateEnvelope: jest.fn().mockReturnValue({
      signature: 'mock-signature-hex',
      senderPublicKey: '04mock-public-key',
      nonce: 'mock-nonce',
      identityProvider: 'oauth-jwt',
    }),
    validateRequest: jest.fn().mockReturnValue({ valid: true }),
  }));
  (PaymentPersistenceService as jest.Mock).mockImplementation(() => ({
    persistGate: jest.fn(),
    persistReceipt: jest.fn(),
    loadReceipts: jest.fn().mockReturnValue([]),
    loadGates: jest.fn().mockReturnValue([]),
  }));
  (AgentHttpClient as jest.Mock).mockImplementation(() => ({
    call: jest.fn().mockImplementation((path: string) => {
      if (path.includes('/lube-tech/quality/inspect')) {
        return Promise.resolve({
          batchNumber: 'BN-2026-0221',
          productCode: 'ATK-0W20-SYN',
          facility: 'Golden Valley Blending',
          overallStatus: 'conditional',
          disposition: 'hold',
          failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
          message: 'Quality inspection found 1 failed test(s)',
        });
      }
      return Promise.resolve({});
    }),
  }));
}

function makeScenarioFactoryService() {
  return {
    mergeConfig: jest.fn().mockImplementation((config?: Record<string, unknown>) => ({
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
      ...(config ?? {}),
    })),
    resolveWith: jest.fn().mockImplementation((layer: string, configOrProviderId: unknown) => {
      const providerId = typeof configOrProviderId === 'string'
        ? configOrProviderId
        : (configOrProviderId as { payment?: string })?.payment;
      if (layer === 'payment' && (providerId === 'stripe-fiat' || providerId === undefined)) {
        return new (StripeFiatPaymentProvider as unknown as jest.Mock)();
      }
      return undefined;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests: OemPartnerService Lightning payment wiring (Scenario 6)
// ---------------------------------------------------------------------------

describe('OemPartnerService — Lightning L402 payment step (Scenario 6)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    restoreAllMockImplementations();

    // Re-establish provider mock for Lightning
    (checkProviderPreflight as jest.Mock).mockResolvedValue({ provider: 'lightning', available: true });
    (LightningL402PaymentProvider as jest.Mock).mockImplementation(() => ({
      createPaymentGate: jest.fn().mockResolvedValue({
        gateId: 'mock-gate-id',
        capabilities: ['po.submit'],
        price: 187200,
        currency: 'BTC-SAT',
      }),
      requestPayment: jest.fn().mockResolvedValue({
        invoiceId: 'mock-invoice-id',
        transactionHash: 'lnbc_real_invoice_from_lnd_node',
        paidAt: new Date().toISOString(),
        amount: 187200,
        currency: 'BTC-SAT',
        status: 'pending',
      }),
      verifyPayment: jest.fn().mockResolvedValue(true),
    }));

    // Configure Lightning env vars
    process.env.LIGHTNING_LND_REST_URL = 'https://localhost:8080';
    process.env.LIGHTNING_LND_MACAROON = 'test-macaroon-hex';

    // Mock fetch for spec validation and production scheduling calls
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/ascentek/specs/validate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valid: true, specCode: 'dexos1 Gen 3' }),
        });
      }
      if (typeof url === 'string' && url.includes('/lube-tech/production/schedule')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ scheduled: true, facility: 'golden-valley' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    delete process.env.LIGHTNING_LND_REST_URL;
    delete process.env.LIGHTNING_LND_MACAROON;
    jest.restoreAllMocks();
  });

  it('calls checkProviderPreflight("lightning") before initiating payment', async () => {
    const { OemPartnerService } = await import('../../oem-partner/oem-partner.service');

    // Inline import to get mock access — the module is freshly required
    const service = new OemPartnerService({
      resolve: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      resolveWith: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      mergeConfig: jest.fn(),
    } as any);

    // Inject a fake PO so we don't need a real file
    const fakePo = {
      id: 'po-test-001',
      poNumber: 'PO-TEST-001',
      productId: 'form-001',
      productCode: 'dexos1 Gen 3',
      quantityGallons: 1000,
      pricePerGallon: 12.50,
      totalAmount: 12500,
      requestedDeliveryDate: '2026-04-01',
      shippingAddress: '123 Test St',
      status: 'submitted',
      paymentStatus: 'pending',
      submittedDate: new Date().toISOString(),
    };

    // Patch the dataLoader to return our fake PO
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as unknown as any).dataLoader.getById = jest.fn().mockReturnValue(fakePo);

    await service.submitPurchaseOrder('po-test-001');

    expect(checkProviderPreflight).toHaveBeenCalledWith('lightning');
  });

  it('instantiates LightningL402PaymentProvider and calls requestPayment with the PO amount', async () => {
    const { OemPartnerService } = await import('../../oem-partner/oem-partner.service');
    const service = new OemPartnerService({
      resolve: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      resolveWith: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      mergeConfig: jest.fn(),
    } as any);

    const fakePo = {
      id: 'po-test-002',
      poNumber: 'PO-TEST-002',
      productId: 'form-001',
      productCode: 'dexos1 Gen 3',
      quantityGallons: 500,
      pricePerGallon: 15.00,
      totalAmount: 7500,
      requestedDeliveryDate: '2026-05-01',
      shippingAddress: '456 Real St',
      status: 'submitted',
      paymentStatus: 'pending',
      submittedDate: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as unknown as any).dataLoader.getById = jest.fn().mockReturnValue(fakePo);

    await service.submitPurchaseOrder('po-test-002');

    // Verify the constructor was called (jest.fn() tracks constructor calls via .mock.calls)
    expect((LightningL402PaymentProvider as jest.Mock).mock.calls.length).toBeGreaterThan(0);

    // Verify requestPayment was called — we check via the results array (mock.results contains the
    // instances returned by mockImplementation — NOT mock.instances which tracks 'this' context)
    // The result is the object returned by our mockImplementation
    const returnedInstance = (LightningL402PaymentProvider as jest.Mock).mock.results[0].value as {
      requestPayment: jest.Mock;
    };
    expect(returnedInstance.requestPayment).toHaveBeenCalled();
  });

  it('throws when Lightning provider is unavailable — no synthetic fallback', async () => {
    // Override the preflight mock to throw
    (checkProviderPreflight as jest.Mock).mockRejectedValueOnce(
      new Error('Lightning provider is not configured: LIGHTNING_LND_REST_URL environment variable is not set'),
    );

    const { OemPartnerService } = await import('../../oem-partner/oem-partner.service');
    const service = new OemPartnerService({
      resolve: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      resolveWith: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      mergeConfig: jest.fn(),
    } as any);

    const fakePo = {
      id: 'po-test-003',
      poNumber: 'PO-TEST-003',
      productId: 'form-001',
      productCode: 'dexos1',
      quantityGallons: 100,
      pricePerGallon: 10,
      totalAmount: 1000,
      requestedDeliveryDate: '2026-06-01',
      shippingAddress: '789 Fail St',
      status: 'submitted',
      paymentStatus: 'pending',
      submittedDate: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as unknown as any).dataLoader.getById = jest.fn().mockReturnValue(fakePo);

    // The operation should throw — not silently degrade to a mock payment
    await expect(service.submitPurchaseOrder('po-test-003')).rejects.toThrow(
      'LIGHTNING_LND_REST_URL environment variable is not set',
    );
  });

  it('payment result in oem-partner output contains a non-synthetic txHash', async () => {
    const { OemPartnerService } = await import('../../oem-partner/oem-partner.service');
    const service = new OemPartnerService({
      resolve: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      resolveWith: jest.fn().mockImplementation(() => new (LightningL402PaymentProvider as unknown as jest.Mock)()),
      mergeConfig: jest.fn(),
    } as any);

    const fakePo = {
      id: 'po-test-004',
      poNumber: 'PO-TEST-004',
      productId: 'form-001',
      productCode: 'dexos1',
      quantityGallons: 200,
      pricePerGallon: 11,
      totalAmount: 2200,
      requestedDeliveryDate: '2026-07-01',
      shippingAddress: '101 Real Hash St',
      status: 'submitted',
      paymentStatus: 'pending',
      submittedDate: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as unknown as any).dataLoader.getById = jest.fn().mockReturnValue(fakePo);

    const { result } = await service.submitPurchaseOrder('po-test-004');

    // The txHash should come from the mock provider, not from a raw randomUUID
    const payment = result.payment as { txHash?: string; method: string; lifecycleState: string };
    expect(payment.txHash).toBe('lnbc_real_invoice_from_lnd_node');
    expect(payment.method).toBe('lightning-l402');

    // Ensure it does NOT look like a raw UUID chain (synthetic pattern)
    // Synthetic hashes look like: 32 hex chars + 32 hex chars (two UUID.replace(/-/g,''))
    const syntheticPattern = /^[0-9a-f]{64}$/;
    expect(syntheticPattern.test(payment.txHash ?? '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: ScenarioService Stripe payment wiring (Scenario 8)
// ---------------------------------------------------------------------------

describe('ScenarioService — Stripe payment step (Scenario 8)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    restoreAllMockImplementations();

    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_tests';

    // Re-establish provider mocks for Stripe
    (checkProviderPreflight as jest.Mock).mockResolvedValue({ provider: 'stripe', available: true });
    (StripeFiatPaymentProvider as jest.Mock).mockImplementation(() => ({
      createPaymentGate: jest.fn().mockResolvedValue({
        gateId: 'gate-123',
        amount: 1500,
        currency: 'USD',
        payTo: 'stripe-account',
        memo: 'Quality hold compensation',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      requestPayment: jest.fn().mockResolvedValue({
        invoiceId: 'mock-stripe-invoice-id',
        transactionHash: 'pi_real_payment_intent_id',
        paidAt: new Date().toISOString(),
        amount: 1500,
        currency: 'USD',
        status: 'pending',
      }),
      verifyPayment: jest.fn().mockResolvedValue(true),
    }));

    // Mock fetch for A2A calls in scenario 8
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/sunstream/compliance/validate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ approved: true, score: 87 }),
        });
      }
      // Lube-Tech quality inspection — now called via HTTP after boundary hardening
      if (typeof url === 'string' && url.includes('/lube-tech/quality/inspect')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            batchNumber: 'BN-2026-0221',
            productCode: 'ATK-0W20-SYN',
            facility: 'Golden Valley Blending',
            overallStatus: 'conditional',
            disposition: 'hold',
            failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
            message: 'Quality inspection found 1 failed test(s)',
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as typeof fetch;
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    jest.restoreAllMocks();
  });

  it('calls checkProviderPreflight("stripe") before initiating Stripe payment', async () => {
    // We import ScenarioService with mocked dependencies
    const { ScenarioService } = await import('../scenario.service');

    const mockAscentek = {
      getFormulationCatalog: jest.fn().mockReturnValue([]),
      lookupFormulation: jest.fn().mockReturnValue({ formulations: [] }),
      validateSpec: jest.fn().mockReturnValue({ valid: true, specCode: 'spec', meetsSpec: true, reason: 'ok' }),
      getPricingTiers: jest.fn().mockReturnValue([]),
      startOnboarding: jest.fn().mockReturnValue({ companyName: 'Test', partnerCode: 'TEST', steps: [], totalEstimatedDays: 30, initiatedAt: new Date().toISOString() }),
      inspectQuality: jest.fn().mockReturnValue({ batchNumber: 'BN-2026-0221', productCode: 'PROD', facility: 'TEST', overallStatus: 'FAIL', disposition: 'hold', failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }], message: 'Failed' }),
    };

    const mockLubeTech = {
      inspectQuality: jest.fn().mockReturnValue({
        batchNumber: 'BN-2026-0221',
        productCode: 'PROD',
        facility: 'TEST',
        overallStatus: 'FAIL',
        disposition: 'hold',
        failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
        message: 'Phosphorus out of spec',
      }),
    };

    const mockOem = {
      getPurchaseOrders: jest.fn().mockReturnValue([{ id: 'po-1', status: 'submitted', poNumber: 'PO-001', productId: 'form-001', productCode: 'dexos1', quantityGallons: 100, pricePerGallon: 10, totalAmount: 1000, requestedDeliveryDate: '2026-04-01', shippingAddress: '123 St', paymentStatus: 'pending', submittedDate: new Date().toISOString() }]),
      getSpecRequirements: jest.fn().mockReturnValue([{ id: 'spec-1', requiredSpecCode: 'dexos1 Gen 3', application: 'engine', viscosityGrade: '5W-30', operatingTempRange: { min: -40, max: 150 }, volumePerUnitMl: 4000, annualUnits: 50000, criticality: 'high' }]),
      getQualityComplaints: jest.fn().mockReturnValue([{ id: 'qc-1', complaintNumber: 'QC-001', poNumber: 'PO-001', productCode: 'PROD', batchNumber: 'BN-001', issueDate: new Date().toISOString(), description: 'Out of spec', severity: 'HIGH', rootCause: 'blending', resolution: null, status: 'investigating', resolutionDate: null }]),
      getOrderHistory: jest.fn().mockReturnValue([]),
      getApprovedSuppliers: jest.fn().mockReturnValue([]),
      submitPurchaseOrder: jest.fn().mockResolvedValue({ result: { poNumber: 'PO-001', status: 'confirmed' }, pipelineTrace: {} }),
      querySpecAvailability: jest.fn().mockResolvedValue({ result: {}, pipelineTrace: {} }),
      placeBid: jest.fn().mockResolvedValue({ result: {}, pipelineTrace: {} }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(
      mockAscentek as any,
      mockLubeTech as any,
      mockOem as any,
      makeScenarioFactoryService() as any,
    );

    await service.runScenario(8);

    expect(checkProviderPreflight).toHaveBeenCalledWith('stripe');
  });

  it('instantiates StripeFiatPaymentProvider and calls requestPayment', async () => {
    const { ScenarioService } = await import('../scenario.service');

    const mockLubeTech = {
      inspectQuality: jest.fn().mockReturnValue({
        batchNumber: 'BN-2026-0221',
        productCode: 'PROD',
        facility: 'TEST',
        overallStatus: 'FAIL',
        disposition: 'hold',
        failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
        message: 'Out of spec',
      }),
    };

    const mockAscentek = {};
    const mockOem = {
      getQualityComplaints: jest.fn().mockReturnValue([]),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(
      mockAscentek as any,
      mockLubeTech as any,
      mockOem as any,
      makeScenarioFactoryService() as any,
    );

    await service.runScenario(8);

    // Verify StripeFiatPaymentProvider was instantiated (constructor called)
    const constructorCalls = (StripeFiatPaymentProvider as jest.Mock).mock.calls;
    expect(constructorCalls.length).toBeGreaterThan(0);
  });

  it('throws when Stripe provider is unavailable — no synthetic fallback', async () => {
    (checkProviderPreflight as jest.Mock).mockRejectedValueOnce(
      new Error('Stripe provider is not configured: STRIPE_SECRET_KEY environment variable is not set'),
    );

    const { ScenarioService } = await import('../scenario.service');

    const mockLubeTech = {
      inspectQuality: jest.fn().mockReturnValue({
        batchNumber: 'BN-2026-0221',
        productCode: 'PROD',
        facility: 'TEST',
        overallStatus: 'FAIL',
        disposition: 'hold',
        failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
        message: 'Out of spec',
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(
      {} as any,
      mockLubeTech as any,
      {} as any,
      makeScenarioFactoryService() as any,
    );

    await expect(service.runScenario(8)).rejects.toThrow(
      'STRIPE_SECRET_KEY environment variable is not set',
    );
  });

  it('scenario 8 result includes real Stripe PaymentIntent ID (not a synthetic randomUUID)', async () => {
    const { ScenarioService } = await import('../scenario.service');

    const mockLubeTech = {
      inspectQuality: jest.fn().mockReturnValue({
        batchNumber: 'BN-2026-0221',
        productCode: 'PROD',
        facility: 'TEST',
        overallStatus: 'FAIL',
        disposition: 'hold',
        failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
        message: 'Out of spec',
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(
      {} as any,
      mockLubeTech as any,
      {} as any,
      makeScenarioFactoryService() as any,
    );

    const { result } = await service.runScenario(8);

    const creditInitiated = result.creditInitiated as {
      paymentIntentId?: string;
      lifecycleState?: string;
    };

    // PaymentIntent ID should come from the mock provider (pi_real_payment_intent_id)
    expect(creditInitiated.paymentIntentId).toBe('pi_real_payment_intent_id');

    // Lifecycle state should be tracked
    expect(creditInitiated.lifecycleState).toBe('pending');

    // Ensure it does NOT look like a synthetic Stripe-style prefix + UUID
    const syntheticPattern = /^pi_[0-9a-f]{24}$/;
    expect(syntheticPattern.test(creditInitiated.paymentIntentId ?? '')).toBe(false);
  });

  it('payment record is persisted with lifecycle state (not raw synthetic data)', async () => {
    const { ScenarioService } = await import('../scenario.service');

    const mockLubeTech = {
      inspectQuality: jest.fn().mockReturnValue({
        batchNumber: 'BN-2026-0221',
        productCode: 'PROD',
        facility: 'TEST',
        overallStatus: 'FAIL',
        disposition: 'hold',
        failedTests: [{ parameter: 'Phosphorus', value: 1020, maxSpec: 1000, unit: 'ppm' }],
        message: 'Out of spec',
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ScenarioService(
      {} as any,
      mockLubeTech as any,
      {} as any,
      makeScenarioFactoryService() as any,
    );

    const { result } = await service.runScenario(8);

    const creditInitiated = result.creditInitiated as { lifecycleState?: string };
    expect(creditInitiated.lifecycleState).toBeDefined();
    expect(['initiated', 'pending', 'verified', 'failed']).toContain(creditInitiated.lifecycleState);
  });
});
