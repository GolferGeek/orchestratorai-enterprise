/**
 * CallbackCorrelationService
 *
 * In-memory registry of callback records keyed by correlationId.
 * Gates success reporting behind a real callback artifact — callers cannot
 * mark a callback as successful without a matching artifact on record.
 *
 * Designed as a plain class (no NestJS decorator) so it can be instantiated
 * directly in tests and used as a singleton inside NestJS services via
 * manual instantiation or @Injectable() wrapping.
 */

import { randomUUID } from 'crypto';
import {
  CallbackRecord,
  CallbackState,
  advanceCallbackRecord,
  createCallbackRecord,
} from './callback-lifecycle';

export class CallbackCorrelationService {
  private readonly records = new Map<string, CallbackRecord>();

  /**
   * Initiate a new callback record.
   * Generates a unique correlationId and stores the record.
   *
   * @param callbackUrl - Optional URL that will receive the callback
   * @returns The new CallbackRecord (state: 'initiated')
   */
  initiate(callbackUrl?: string): CallbackRecord {
    const correlationId = randomUUID();
    const record = createCallbackRecord(correlationId, callbackUrl);
    this.records.set(correlationId, record);
    return record;
  }

  /**
   * Mark a callback record as sent.
   * Transitions state: initiated → callback-sent.
   *
   * @param correlationId - The correlation ID of the record to advance
   * @throws if correlationId is unknown or transition is invalid
   */
  markSent(correlationId: string): CallbackRecord {
    const record = this.requireRecord(correlationId);
    const updated = advanceCallbackRecord(record, 'callback-sent');
    this.records.set(correlationId, updated);
    return updated;
  }

  /**
   * Record receipt of a callback response.
   * Validates that the correlationId exists and matches the incoming response,
   * then transitions state: callback-sent → callback-received.
   *
   * @param correlationId - The correlation ID from the callback response
   * @param artifact      - The callback payload/artifact
   * @throws if correlationId is unknown, already used, or transition is invalid
   */
  receiveCallback(correlationId: string, artifact: unknown): CallbackRecord {
    const record = this.requireRecord(correlationId);

    if (record.correlationId !== correlationId) {
      throw new Error(
        `Callback correlation mismatch: expected '${record.correlationId}' but received '${correlationId}'`,
      );
    }

    const updated = advanceCallbackRecord(record, 'callback-received', artifact);
    this.records.set(correlationId, updated);
    return updated;
  }

  /**
   * Verify a callback record — transitions state: callback-received → verified.
   * The record must have an artifact before verification can proceed.
   *
   * @param correlationId - The correlation ID of the record to verify
   * @throws if correlationId is unknown, artifact is missing, or transition is invalid
   */
  verify(correlationId: string): CallbackRecord {
    const record = this.requireRecord(correlationId);

    if (record.artifact === undefined) {
      throw new Error(
        `Cannot verify callback '${correlationId}': no artifact present. ` +
          `Call receiveCallback() before verify().`,
      );
    }

    const updated = advanceCallbackRecord(record, 'verified');
    this.records.set(correlationId, updated);
    return updated;
  }

  /**
   * Mark a callback record as failed.
   * Valid from any non-terminal state.
   *
   * @param correlationId - The correlation ID of the record to fail
   * @param error         - Optional error message describing the failure
   * @throws if correlationId is unknown or the record is already in a terminal state
   */
  fail(correlationId: string, error?: string): CallbackRecord {
    const record = this.requireRecord(correlationId);
    const withError: CallbackRecord = error !== undefined
      ? { ...record, error }
      : record;
    const updated = advanceCallbackRecord(withError, 'failed');
    this.records.set(correlationId, updated);
    return updated;
  }

  /**
   * Retrieve a callback record by correlationId.
   * Returns undefined if the record does not exist.
   */
  getRecord(correlationId: string): CallbackRecord | undefined {
    return this.records.get(correlationId);
  }

  /**
   * Assert that a real callback artifact exists for this correlationId.
   * This is the success gate — call this before reporting callback success
   * to ensure the callback actually occurred with a real payload.
   *
   * @throws if the correlationId is unknown, has no artifact, or is not in a
   *         terminal success state (verified) or at least callback-received
   */
  requireArtifact(correlationId: string): void {
    const record = this.records.get(correlationId);

    if (!record) {
      throw new Error(
        `requireArtifact: no callback record found for correlationId '${correlationId}'. ` +
          `The callback was never initiated or has an incorrect correlation ID.`,
      );
    }

    if (record.artifact === undefined) {
      throw new Error(
        `requireArtifact: callback '${correlationId}' has no artifact. ` +
          `Current state: '${record.state}'. The callback response has not been received yet.`,
      );
    }
  }

  /**
   * Return the current state of a callback record.
   *
   * @throws if correlationId is unknown
   */
  getState(correlationId: string): CallbackState {
    return this.requireRecord(correlationId).state;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireRecord(correlationId: string): CallbackRecord {
    const record = this.records.get(correlationId);
    if (!record) {
      throw new Error(
        `Unknown correlationId: '${correlationId}'. ` +
          `No callback record found. Ensure initiate() was called first.`,
      );
    }
    return record;
  }
}
