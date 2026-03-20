/**
 * AgriservService security tests — 3 tests verifying that:
 * 1. submitLoanForCompliance uses SecurityService (not randomUUID) for signing
 * 2. requestHelpdeskSupport uses SecurityService (not randomUUID) for signing
 * 3. The security envelope is attached to the transport payload body
 *
 * The @agent-communication/shared-protocols import is mocked so that ESM-only
 * dependencies (Coinbase CDP SDK, jose) do not break the Jest CommonJS runner.
 * We inject the real SecurityService, PipelineTracer, and DataLoaderService
 * directly from their source files via the mock factory.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SecurityService } = require('@agent-communication/shared-protocols/dist/security/security.service') as typeof import('@agent-communication/shared-protocols');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PipelineTracer } = require('@agent-communication/shared-protocols/dist/tracing/pipeline-tracer') as typeof import('@agent-communication/shared-protocols');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DataLoaderService } = require('@agent-communication/shared-protocols/dist/data/data-loader.service') as typeof import('@agent-communication/shared-protocols');

jest.mock('@agent-communication/shared-protocols', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecurityService: require('@agent-communication/shared-protocols/dist/security/security.service').SecurityService,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  PipelineTracer: require('@agent-communication/shared-protocols/dist/tracing/pipeline-tracer').PipelineTracer,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DataLoaderService: require('@agent-communication/shared-protocols/dist/data/data-loader.service').DataLoaderService,
  getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer test-token' }),
}));

// Import AFTER the mock is registered
import { AgriservService } from '../agriserv.service';

// Suppress unused import warnings from the require() calls above — they are
// used only to resolve types, not at runtime.
void SecurityService;
void PipelineTracer;
void DataLoaderService;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_LOAN = {
  id: 'loan-001',
  borrowerName: 'Test Corp',
  amount: 250000,
  purpose: 'Equipment',
  collateralId: 'COL-001',
  term: 60,
  rateType: 'fixed',
  status: 'pending',
};

/** Intercepts all fetch() calls made during the test. */
function mockFetch(responseBody: Record<string, unknown> = { status: 'ok' }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];

  const fetchMock = jest.fn(async (url: string, opts: RequestInit) => {
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    calls.push({ url, body });
    return { json: async () => responseBody } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return calls;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgriservService security', () => {
  let service: AgriservService;

  beforeEach(() => {
    service = new AgriservService();
    // Stub data loader so tests do not require real JSON files on disk
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).dataLoader.getById = jest.fn().mockReturnValue(SAMPLE_LOAN);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submitLoanForCompliance: signing step uses SecurityService (not randomUUID)', async () => {
    const calls = mockFetch({ decision: 'approved', riskScore: 42 });

    await service.submitLoanForCompliance('loan-001');

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const transportCall = calls.find((c) => c.url.includes('compliance/validate'));
    expect(transportCall).toBeDefined();

    const security = transportCall!.body['security'] as Record<string, unknown>;
    expect(security).toBeDefined();

    // Real HMAC-SHA256 signature is 64 hex chars.
    // randomUUID().replace(/-/g, '') produces exactly 32 chars — so 64 proves SecurityService.
    expect(typeof security['signature']).toBe('string');
    expect((security['signature'] as string).length).toBe(64);

    // Nonce must be a proper UUID v4 (SecurityService uses randomUUID())
    expect(security['nonce']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(security['identityProvider']).toBe('oauth-jwt');
    expect(security['senderId']).toBe('agriserv');
  });

  it('requestHelpdeskSupport: signing step uses SecurityService (not randomUUID)', async () => {
    const calls = mockFetch({ ticketId: 'TKT-001', status: 'open' });

    await service.requestHelpdeskSupport(
      'system-access',
      ['cannot-login', 'mfa-failure'],
      'User unable to authenticate via SSO',
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const transportCall = calls.find((c) => c.url.includes('helpdesk/ticket'));
    expect(transportCall).toBeDefined();

    const security = transportCall!.body['security'] as Record<string, unknown>;
    expect(security).toBeDefined();

    // 64-char hex = real HMAC-SHA256
    expect(typeof security['signature']).toBe('string');
    expect((security['signature'] as string).length).toBe(64);

    // UUID v4 nonce
    expect(security['nonce']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(security['identityProvider']).toBe('oauth-jwt');
    expect(security['senderId']).toBe('agriserv');
  });

  it('security envelope is attached to the transport payload body', async () => {
    const calls = mockFetch({ decision: 'approved' });

    await service.submitLoanForCompliance('loan-001');

    const transportCall = calls.find((c) => c.url.includes('compliance/validate'));
    expect(transportCall).toBeDefined();

    const body = transportCall!.body;

    // Business payload fields are present in the transport body
    expect(body).toHaveProperty('loanId');
    expect(body).toHaveProperty('borrowerName');
    expect(body).toHaveProperty('amount');

    // Security envelope is present alongside the business payload
    expect(body).toHaveProperty('security');
    const security = body['security'] as Record<string, unknown>;
    expect(security).toHaveProperty('nonce');
    expect(security).toHaveProperty('timestamp');
    expect(security).toHaveProperty('senderId');
    expect(security).toHaveProperty('senderPublicKey');
    expect(security).toHaveProperty('signature');
    expect(security).toHaveProperty('identityProvider');
  });
});
