/**
 * Nonce store for replay-attack protection.
 *
 * A nonce is a UUID that accompanies every outbound message. The receiving
 * side records each nonce it has seen and rejects any message whose nonce
 * it has already seen, preventing replay attacks.
 *
 * Design constraints:
 * - Node.js is single-threaded, so Map operations are already atomic with
 *   respect to the event loop. No mutex is needed for pure in-memory state.
 * - Nonces are time-stamped on arrival so they can be pruned once they fall
 *   outside the acceptance window, keeping memory bounded.
 * - Auto-prune fires synchronously on `recordNonce` when the store exceeds
 *   the configured threshold so the caller never needs to schedule pruning
 *   externally, though callers MAY call `prune()` themselves on a schedule.
 */

export interface INonceStore {
  /**
   * Returns true if the nonce has already been recorded (i.e. this is a
   * replay).
   */
  hasNonce(nonce: string): boolean;

  /**
   * Records a nonce alongside the millisecond timestamp at which it was
   * received.  Throws if the nonce is already present — callers must check
   * `hasNonce` first or handle the error as a replay.
   */
  recordNonce(nonce: string, timestampMs: number): void;

  /**
   * Removes all entries whose recorded timestamp is strictly less than
   * `olderThanMs`.  Returns the number of entries removed.
   */
  prune(olderThanMs: number): number;

  /** Returns the current number of nonces held in the store. */
  size(): number;
}

export interface NonceStoreOptions {
  /**
   * When `size()` reaches this value after a `recordNonce` call, an
   * automatic prune is triggered.  The prune uses `Date.now() - pruneWindowMs`
   * as the cut-off.  Defaults to 10 000.
   */
  maxSize?: number;

  /**
   * The age (in milliseconds) beyond which nonces are pruned during the
   * automatic prune sweep.  Should be set to match (or slightly exceed) the
   * timestamp acceptance window used by `SecureTransportMiddleware`.
   * Defaults to 5 minutes (300 000 ms).
   */
  pruneWindowMs?: number;
}

export class InMemoryNonceStore implements INonceStore {
  /** Maps nonce -> Unix epoch ms at which it was recorded. */
  private readonly store: Map<string, number> = new Map();

  private readonly maxSize: number;
  private readonly pruneWindowMs: number;

  constructor(options: NonceStoreOptions = {}) {
    this.maxSize = options.maxSize ?? 10_000;
    this.pruneWindowMs = options.pruneWindowMs ?? 5 * 60 * 1_000; // 5 min
  }

  hasNonce(nonce: string): boolean {
    return this.store.has(nonce);
  }

  recordNonce(nonce: string, timestampMs: number): void {
    if (this.store.has(nonce)) {
      throw new Error(`Nonce already recorded: ${nonce}`);
    }

    this.store.set(nonce, timestampMs);

    // Auto-prune synchronously before the event loop can yield; this keeps
    // memory bounded without requiring external scheduling.
    if (this.store.size >= this.maxSize) {
      this.prune(Date.now() - this.pruneWindowMs);
    }
  }

  prune(olderThanMs: number): number {
    let removed = 0;
    for (const [nonce, ts] of this.store) {
      if (ts < olderThanMs) {
        this.store.delete(nonce);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.store.size;
  }
}
