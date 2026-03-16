/**
 * Callback Lifecycle State Machine
 *
 * Defines the valid states and transitions for callback records.
 * Invalid transitions throw explicitly — silent state corruption is not allowed.
 *
 * Valid transitions:
 *   initiated         → callback-sent       (request submitted, callback URL notified)
 *   callback-sent     → callback-received   (callback arrived with correlation ID)
 *   callback-received → verified            (artifact confirmed, success gate passed)
 *   any               → failed              (error at any stage)
 *
 * Invalid (and will throw):
 *   initiated → verified (must travel through callback-sent and callback-received)
 *   verified  → any      (terminal state — no further transitions)
 */

import { randomUUID } from 'crypto';

export type CallbackState =
  | 'initiated'
  | 'callback-sent'
  | 'callback-received'
  | 'verified'
  | 'failed';

export interface CallbackRecord {
  /** Unique record identifier */
  id: string;
  /** Correlation ID generated on initiation, must match on callback receipt */
  correlationId: string;
  /** Current lifecycle state */
  state: CallbackState;
  /** Destination URL that will receive the callback */
  callbackUrl?: string;
  /** ISO 8601 timestamp when the record was created */
  initiatedAt: string;
  /** ISO 8601 timestamp of the most recent state update */
  updatedAt: string;
  /** The callback response data — populated on callback-received */
  artifact?: unknown;
  /** Error message if state is 'failed' */
  error?: string;
}

/**
 * Valid state transitions map.
 * Key = current state, Value = set of valid next states.
 */
const VALID_TRANSITIONS: Record<CallbackState, ReadonlySet<CallbackState>> = {
  initiated: new Set<CallbackState>(['callback-sent', 'failed']),
  'callback-sent': new Set<CallbackState>(['callback-received', 'failed']),
  'callback-received': new Set<CallbackState>(['verified', 'failed']),
  verified: new Set<CallbackState>(),
  failed: new Set<CallbackState>(),
};

/**
 * Validate and return the new state after a transition.
 *
 * Throws if the transition is not permitted.
 * This enforces forward-only lifecycle progression — no going back to
 * earlier states, no skipping states, no re-activating terminal states.
 *
 * @param current - The current callback state
 * @param next    - The proposed next state
 * @returns       - The next state (same as `next` if valid)
 * @throws        - Error if the transition is invalid
 */
export function transitionCallbackState(
  current: CallbackState,
  next: CallbackState,
): CallbackState {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.has(next)) {
    throw new Error(
      `Invalid callback state transition: ${current} → ${next}. ` +
        `Allowed transitions from '${current}': [${[...allowed].join(', ') || 'none (terminal state)'}]`,
    );
  }
  return next;
}

/**
 * Create a new CallbackRecord in the 'initiated' state.
 * Generates a unique correlation ID and record ID.
 *
 * @param correlationId - The correlation ID for matching callback responses
 * @param callbackUrl   - Optional URL to which the callback will be sent
 */
export function createCallbackRecord(
  correlationId: string,
  callbackUrl?: string,
): CallbackRecord {
  const now = new Date().toISOString();
  return {
    id: `cb-${randomUUID()}`,
    correlationId,
    state: 'initiated',
    callbackUrl,
    initiatedAt: now,
    updatedAt: now,
  };
}

/**
 * Advance a CallbackRecord to the next state.
 * Returns a new record object — original is not mutated.
 *
 * @param record    - The current CallbackRecord
 * @param nextState - The target state
 * @param artifact  - Optional callback artifact (required before reaching 'verified')
 * @throws if the transition is invalid
 */
export function advanceCallbackRecord(
  record: CallbackRecord,
  nextState: CallbackState,
  artifact?: unknown,
): CallbackRecord {
  const validatedNext = transitionCallbackState(record.state, nextState);
  return {
    ...record,
    state: validatedNext,
    updatedAt: new Date().toISOString(),
    ...(artifact !== undefined ? { artifact } : {}),
  };
}
