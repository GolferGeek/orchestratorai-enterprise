/**
 * Payment Lifecycle State Machine
 *
 * Defines the valid states and transitions for payment records.
 * Invalid transitions throw explicitly — silent state corruption is not allowed.
 *
 * Valid transitions:
 *   initiated → pending    (payment requested, awaiting provider confirmation)
 *   pending   → verified   (provider confirmed payment success)
 *   pending   → failed     (provider reported failure)
 *
 * All other transitions are invalid and will throw.
 */

export type PaymentState = 'initiated' | 'pending' | 'verified' | 'failed';

export interface PaymentRecord {
  /** Unique identifier for this payment record */
  id: string;
  /** Provider ID: 'lightning-l402' | 'stripe-fiat' | 'x402-usdc' | 'mock' */
  provider: string;
  /** Current lifecycle state */
  state: PaymentState;
  /** Provider-specific reference: txHash, BOLT11 invoice, Stripe PaymentIntent ID, etc. */
  providerRef?: string;
  /** Payment amount in the specified currency */
  amount: number;
  /** ISO 4217 currency code or crypto ticker: 'USD', 'BTC-SAT', 'USDC' */
  currency: string;
  /** Correlation ID linking this payment to a business operation (e.g., PO ID, scenario ID) */
  correlationId: string;
  /** ISO 8601 timestamp when the payment was initiated */
  initiatedAt: string;
  /** ISO 8601 timestamp of the most recent state update */
  updatedAt: string;
  /** Error message if state is 'failed' */
  error?: string;
}

/**
 * Valid state transitions map.
 * Key = current state, Value = set of valid next states.
 */
const VALID_TRANSITIONS: Record<PaymentState, ReadonlySet<PaymentState>> = {
  initiated: new Set<PaymentState>(['pending']),
  pending: new Set<PaymentState>(['verified', 'failed']),
  verified: new Set<PaymentState>(),
  failed: new Set<PaymentState>(),
};

/**
 * Validate and return the new state after a transition.
 *
 * Throws if the transition is not permitted.
 * This enforces forward-only lifecycle progression — no going back to
 * earlier states, no skipping states, no re-activating terminal states.
 *
 * @param current - The current payment state
 * @param next    - The proposed next state
 * @returns       - The next state (same as `next` if valid)
 * @throws        - Error if the transition is invalid
 */
export function transitionPaymentState(
  current: PaymentState,
  next: PaymentState,
): PaymentState {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.has(next)) {
    throw new Error(
      `Invalid payment state transition: ${current} → ${next}. ` +
      `Allowed transitions from '${current}': [${[...allowed].join(', ') || 'none (terminal state)'}]`,
    );
  }
  return next;
}

/**
 * Create a new PaymentRecord in the 'initiated' state.
 * This is the only way to produce a PaymentRecord — the state machine
 * starts here and moves forward via transitionPaymentState.
 */
export function createPaymentRecord(params: {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  correlationId: string;
  providerRef?: string;
}): PaymentRecord {
  const now = new Date().toISOString();
  return {
    id: params.id,
    provider: params.provider,
    state: 'initiated',
    providerRef: params.providerRef,
    amount: params.amount,
    currency: params.currency,
    correlationId: params.correlationId,
    initiatedAt: now,
    updatedAt: now,
  };
}

/**
 * Advance a PaymentRecord to the next state.
 * Returns a new record object — original is not mutated.
 *
 * @throws if the transition is invalid
 */
export function advancePaymentRecord(
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
