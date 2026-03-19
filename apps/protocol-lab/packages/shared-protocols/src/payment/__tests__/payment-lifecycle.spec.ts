import {
  transitionPaymentState,
  createPaymentRecord,
  advancePaymentRecord,
  PaymentState,
} from '../payment-lifecycle';

describe('transitionPaymentState — valid transitions', () => {
  it('initiated → pending is valid', () => {
    const next = transitionPaymentState('initiated', 'pending');
    expect(next).toBe('pending');
  });

  it('pending → verified is valid', () => {
    const next = transitionPaymentState('pending', 'verified');
    expect(next).toBe('verified');
  });

  it('pending → failed is valid', () => {
    const next = transitionPaymentState('pending', 'failed');
    expect(next).toBe('failed');
  });
});

describe('transitionPaymentState — invalid transitions', () => {
  it('initiated → verified is invalid (skips pending)', () => {
    expect(() => transitionPaymentState('initiated', 'verified')).toThrow(
      /Invalid payment state transition: initiated → verified/,
    );
  });

  it('verified → pending is invalid (terminal state)', () => {
    expect(() => transitionPaymentState('verified', 'pending')).toThrow(
      /Invalid payment state transition: verified → pending/,
    );
  });

  it('failed → verified is invalid (terminal state)', () => {
    expect(() => transitionPaymentState('failed', 'verified')).toThrow(
      /Invalid payment state transition: failed → verified/,
    );
  });
});

describe('createPaymentRecord', () => {
  it('creates a record in the initiated state', () => {
    const record = createPaymentRecord({
      id: 'pay-001',
      provider: 'lightning-l402',
      amount: 100,
      currency: 'BTC-SAT',
      correlationId: 'po-001',
    });

    expect(record.id).toBe('pay-001');
    expect(record.state).toBe('initiated');
    expect(record.provider).toBe('lightning-l402');
    expect(record.amount).toBe(100);
    expect(record.currency).toBe('BTC-SAT');
    expect(record.correlationId).toBe('po-001');
    expect(record.initiatedAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
  });

  it('optionally includes a providerRef', () => {
    const record = createPaymentRecord({
      id: 'pay-002',
      provider: 'stripe-fiat',
      amount: 1500,
      currency: 'USD',
      correlationId: 'quality-hold-001',
      providerRef: 'pi_test123',
    });

    expect(record.providerRef).toBe('pi_test123');
  });
});

describe('advancePaymentRecord', () => {
  it('returns a new record with updated state and updatedAt', () => {
    const original = createPaymentRecord({
      id: 'pay-003',
      provider: 'stripe-fiat',
      amount: 50,
      currency: 'USD',
      correlationId: 'order-abc',
    });

    const advanced = advancePaymentRecord(original, 'pending');
    expect(advanced.state).toBe('pending');
    expect(advanced.id).toBe(original.id);
    // updatedAt should be >= initiatedAt
    expect(new Date(advanced.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(original.initiatedAt).getTime(),
    );
  });

  it('does not mutate the original record', () => {
    const original = createPaymentRecord({
      id: 'pay-004',
      provider: 'x402-usdc',
      amount: 0.5,
      currency: 'USDC',
      correlationId: 'spec-query-001',
    });

    advancePaymentRecord(original, 'pending');
    expect(original.state).toBe('initiated');
  });

  it('sets providerRef when provided in update', () => {
    const record = createPaymentRecord({
      id: 'pay-005',
      provider: 'lightning-l402',
      amount: 200,
      currency: 'BTC-SAT',
      correlationId: 'po-005',
    });

    const pending = advancePaymentRecord(record, 'pending', { providerRef: 'lnbc_test_invoice' });
    expect(pending.providerRef).toBe('lnbc_test_invoice');
  });

  it('sets error when advancing to failed', () => {
    const record = createPaymentRecord({
      id: 'pay-006',
      provider: 'stripe-fiat',
      amount: 99,
      currency: 'USD',
      correlationId: 'order-fail',
    });

    const pending = advancePaymentRecord(record, 'pending');
    const failed = advancePaymentRecord(pending, 'failed', { error: 'Card declined' });
    expect(failed.state).toBe('failed');
    expect(failed.error).toBe('Card declined');
  });

  it('throws when attempting an invalid transition', () => {
    const record = createPaymentRecord({
      id: 'pay-007',
      provider: 'mock',
      amount: 0,
      currency: 'MOCK',
      correlationId: 'test',
    });

    // initiated → verified is not valid (must go through pending)
    expect(() => advancePaymentRecord(record, 'verified')).toThrow(
      /Invalid payment state transition/,
    );
  });
});

describe('full payment lifecycle', () => {
  it('can complete a full initiated → pending → verified lifecycle', () => {
    let record = createPaymentRecord({
      id: 'full-lifecycle-001',
      provider: 'stripe-fiat',
      amount: 1500,
      currency: 'USD',
      correlationId: 'quality-hold-scenario-8',
    });
    expect(record.state).toBe('initiated');

    record = advancePaymentRecord(record, 'pending', { providerRef: 'pi_test_intent_id' });
    expect(record.state).toBe('pending');
    expect(record.providerRef).toBe('pi_test_intent_id');

    record = advancePaymentRecord(record, 'verified');
    expect(record.state).toBe('verified');
  });

  it('can complete a full initiated → pending → failed lifecycle', () => {
    let record = createPaymentRecord({
      id: 'full-lifecycle-002',
      provider: 'lightning-l402',
      amount: 187200,
      currency: 'BTC-SAT',
      correlationId: 'po-scenario-6',
    });

    record = advancePaymentRecord(record, 'pending', { providerRef: 'lnbc_test' });
    expect(record.state).toBe('pending');

    record = advancePaymentRecord(record, 'failed', { error: 'Invoice expired' });
    expect(record.state).toBe('failed');
    expect(record.error).toBe('Invoice expired');
  });
});

describe('terminal state enforcement', () => {
  it('verified is a terminal state — no further transitions allowed', () => {
    expect(() => transitionPaymentState('verified', 'failed')).toThrow(/terminal state/);
    expect(() => transitionPaymentState('verified', 'initiated')).toThrow(/terminal state/);
    expect(() => transitionPaymentState('verified', 'pending')).toThrow(/terminal state/);
  });

  it('failed is a terminal state — no further transitions allowed', () => {
    expect(() => transitionPaymentState('failed', 'pending')).toThrow(/terminal state/);
    expect(() => transitionPaymentState('failed', 'initiated')).toThrow(/terminal state/);
    expect(() => transitionPaymentState('failed', 'verified')).toThrow(/terminal state/);
  });
});

describe('transitionPaymentState — additional invalid transitions', () => {
  it('initiated → failed is invalid (must go through pending)', () => {
    expect(() => transitionPaymentState('initiated', 'failed')).toThrow(
      /Invalid payment state transition: initiated → failed/,
    );
  });

  it('initiated → initiated is invalid (no self-transitions)', () => {
    expect(() => transitionPaymentState('initiated', 'initiated')).toThrow(
      /Invalid payment state transition: initiated → initiated/,
    );
  });
});
