/**
 * Callback Lifecycle Unit Tests — 13 tests covering:
 *
 * Correlation ID:
 *   1. Generated on callback initiation, format valid (UUID)
 *   2. Callback response with matching correlation ID succeeds
 *   3. Mismatched correlation ID rejected
 *
 * Lifecycle transitions:
 *   4. initiated → callback-sent valid
 *   5. callback-sent → callback-received valid
 *   6. callback-received → verified valid
 *   7. initiated → verified rejected (must go through callback)
 *   8. verified → any rejected (terminal state)
 *   9. any → failed valid
 *
 * Success gate:
 *  10. requireArtifact throws without callback artifact
 *  11. requireArtifact passes with valid artifact + correlation ID
 *
 * Broken endpoint:
 *  12. Unreachable callback URL results in failed state propagation
 *
 * Persistence:
 *  13. Callback record has timestamps
 */

import { randomUUID } from 'crypto';
import {
  transitionCallbackState,
  createCallbackRecord,
  advanceCallbackRecord,
} from '../callback-lifecycle';
import { CallbackCorrelationService } from '../callback-correlation.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): CallbackCorrelationService {
  return new CallbackCorrelationService();
}

// ---------------------------------------------------------------------------
// 1. Correlation ID: generated on initiation, format valid
// ---------------------------------------------------------------------------

describe('Correlation ID: generated on initiation', () => {
  it('assigns a valid UUID as correlationId when createCallbackRecord is called', () => {
    const correlationId = randomUUID();
    const record = createCallbackRecord(correlationId, 'https://example.com/callback');

    expect(record.correlationId).toBe(correlationId);
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(record.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('CallbackCorrelationService.initiate() generates a unique UUID correlationId', () => {
    const service = makeService();
    const record = service.initiate('https://example.com/callback');

    expect(record.correlationId).toBeTruthy();
    expect(record.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(record.state).toBe('initiated');
  });
});

// ---------------------------------------------------------------------------
// 2. Callback response with matching correlation ID succeeds
// ---------------------------------------------------------------------------

describe('Correlation ID: matching response succeeds', () => {
  it('receiveCallback accepts the artifact when correlationId matches', () => {
    const service = makeService();
    const record = service.initiate('https://example.com/callback');
    service.markSent(record.correlationId);

    const artifact = { content: 'workflow-result', completedAt: new Date().toISOString() };
    const updated = service.receiveCallback(record.correlationId, artifact);

    expect(updated.state).toBe('callback-received');
    expect(updated.artifact).toEqual(artifact);
    expect(updated.correlationId).toBe(record.correlationId);
  });
});

// ---------------------------------------------------------------------------
// 3. Mismatched correlation ID rejected
// ---------------------------------------------------------------------------

describe('Correlation ID: mismatched ID rejected', () => {
  it('receiveCallback throws when an unknown correlationId is provided', () => {
    const service = makeService();

    // Initiate one record but try to receive callback with a different ID
    service.initiate('https://example.com/callback');
    const wrongId = randomUUID();

    expect(() => service.receiveCallback(wrongId, { data: 'spoofed' })).toThrow(
      /Unknown correlationId/,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Lifecycle: initiated → callback-sent valid
// ---------------------------------------------------------------------------

describe('Lifecycle: initiated → callback-sent', () => {
  it('transitionCallbackState allows initiated → callback-sent', () => {
    const result = transitionCallbackState('initiated', 'callback-sent');
    expect(result).toBe('callback-sent');
  });

  it('CallbackCorrelationService.markSent() transitions to callback-sent', () => {
    const service = makeService();
    const record = service.initiate();
    const updated = service.markSent(record.correlationId);

    expect(updated.state).toBe('callback-sent');
    expect(updated.correlationId).toBe(record.correlationId);
  });
});

// ---------------------------------------------------------------------------
// 5. Lifecycle: callback-sent → callback-received valid
// ---------------------------------------------------------------------------

describe('Lifecycle: callback-sent → callback-received', () => {
  it('transitionCallbackState allows callback-sent → callback-received', () => {
    const result = transitionCallbackState('callback-sent', 'callback-received');
    expect(result).toBe('callback-received');
  });

  it('advanceCallbackRecord stores artifact on callback-received', () => {
    const correlationId = randomUUID();
    let record = createCallbackRecord(correlationId);
    record = advanceCallbackRecord(record, 'callback-sent');

    const artifact = { result: 'processed', items: 42 };
    record = advanceCallbackRecord(record, 'callback-received', artifact);

    expect(record.state).toBe('callback-received');
    expect(record.artifact).toEqual(artifact);
  });
});

// ---------------------------------------------------------------------------
// 6. Lifecycle: callback-received → verified valid
// ---------------------------------------------------------------------------

describe('Lifecycle: callback-received → verified', () => {
  it('transitionCallbackState allows callback-received → verified', () => {
    const result = transitionCallbackState('callback-received', 'verified');
    expect(result).toBe('verified');
  });

  it('CallbackCorrelationService.verify() completes the lifecycle', () => {
    const service = makeService();
    const record = service.initiate();
    service.markSent(record.correlationId);
    service.receiveCallback(record.correlationId, { done: true });

    const verified = service.verify(record.correlationId);
    expect(verified.state).toBe('verified');
    expect(verified.artifact).toEqual({ done: true });
  });
});

// ---------------------------------------------------------------------------
// 7. Lifecycle: initiated → verified rejected (must go through callback)
// ---------------------------------------------------------------------------

describe('Lifecycle: initiated → verified rejected', () => {
  it('transitionCallbackState throws for initiated → verified (skips required states)', () => {
    expect(() => transitionCallbackState('initiated', 'verified')).toThrow(
      /Invalid callback state transition: initiated → verified/,
    );
  });

  it('advanceCallbackRecord throws for initiated → verified', () => {
    const correlationId = randomUUID();
    const record = createCallbackRecord(correlationId);

    expect(() => advanceCallbackRecord(record, 'verified')).toThrow(
      /Invalid callback state transition/,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Lifecycle: verified → any rejected (terminal state)
// ---------------------------------------------------------------------------

describe('Lifecycle: verified is a terminal state', () => {
  it('transitionCallbackState throws for verified → callback-sent', () => {
    expect(() => transitionCallbackState('verified', 'callback-sent')).toThrow(
      /terminal state/,
    );
  });

  it('transitionCallbackState throws for verified → initiated', () => {
    expect(() => transitionCallbackState('verified', 'initiated')).toThrow(
      /terminal state/,
    );
  });

  it('transitionCallbackState throws for verified → failed', () => {
    expect(() => transitionCallbackState('verified', 'failed')).toThrow(
      /terminal state/,
    );
  });
});

// ---------------------------------------------------------------------------
// 9. any → failed valid
// ---------------------------------------------------------------------------

describe('Lifecycle: any non-terminal state → failed is valid', () => {
  it('initiated → failed is valid', () => {
    const result = transitionCallbackState('initiated', 'failed');
    expect(result).toBe('failed');
  });

  it('callback-sent → failed is valid', () => {
    const result = transitionCallbackState('callback-sent', 'failed');
    expect(result).toBe('failed');
  });

  it('callback-received → failed is valid', () => {
    const result = transitionCallbackState('callback-received', 'failed');
    expect(result).toBe('failed');
  });

  it('failed → any is invalid (terminal state)', () => {
    expect(() => transitionCallbackState('failed', 'initiated')).toThrow(
      /terminal state/,
    );
    expect(() => transitionCallbackState('failed', 'verified')).toThrow(
      /terminal state/,
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Success gate: requireArtifact throws without callback artifact
// ---------------------------------------------------------------------------

describe('Success gate: requireArtifact throws without artifact', () => {
  it('throws when no record exists for the correlationId', () => {
    const service = makeService();
    const fakeId = randomUUID();

    expect(() => service.requireArtifact(fakeId)).toThrow(
      /no callback record found/,
    );
  });

  it('throws when record exists but callback has not been received yet', () => {
    const service = makeService();
    const record = service.initiate();

    // Still in 'initiated' — no artifact
    expect(() => service.requireArtifact(record.correlationId)).toThrow(
      /has no artifact/,
    );
  });

  it('throws after markSent but before receiveCallback', () => {
    const service = makeService();
    const record = service.initiate();
    service.markSent(record.correlationId);

    expect(() => service.requireArtifact(record.correlationId)).toThrow(
      /has no artifact/,
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Success gate: requireArtifact passes with valid artifact + correlation ID
// ---------------------------------------------------------------------------

describe('Success gate: requireArtifact passes with valid artifact', () => {
  it('does not throw after receiveCallback delivers an artifact', () => {
    const service = makeService();
    const record = service.initiate();
    service.markSent(record.correlationId);
    service.receiveCallback(record.correlationId, { payload: 'workflow output' });

    // Should NOT throw
    expect(() => service.requireArtifact(record.correlationId)).not.toThrow();
  });

  it('does not throw after the record has been fully verified', () => {
    const service = makeService();
    const record = service.initiate();
    service.markSent(record.correlationId);
    service.receiveCallback(record.correlationId, { payload: 'done' });
    service.verify(record.correlationId);

    expect(() => service.requireArtifact(record.correlationId)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 12. Broken endpoint: unreachable callback URL results in error state
// ---------------------------------------------------------------------------

describe('Broken endpoint: unreachable callback URL results in failed state', () => {
  it('fail() transitions any record to failed and records the error', () => {
    const service = makeService();
    const record = service.initiate('https://unreachable.example.com/callback');
    service.markSent(record.correlationId);

    // Simulate a network error when the callback endpoint is unreachable
    const failed = service.fail(
      record.correlationId,
      'connect ECONNREFUSED 127.0.0.1:9999',
    );

    expect(failed.state).toBe('failed');
    expect(failed.error).toBe('connect ECONNREFUSED 127.0.0.1:9999');
  });

  it('requireArtifact still throws after a failure (no artifact was delivered)', () => {
    const service = makeService();
    const record = service.initiate('https://unreachable.example.com/callback');
    service.markSent(record.correlationId);
    service.fail(record.correlationId, 'fetch failed');

    expect(() => service.requireArtifact(record.correlationId)).toThrow(
      /has no artifact/,
    );
  });

  it('fail() from initiated state is valid (endpoint never reached)', () => {
    const service = makeService();
    const record = service.initiate('https://unreachable.example.com/callback');

    const failed = service.fail(record.correlationId, 'ENOTFOUND unreachable.example.com');
    expect(failed.state).toBe('failed');
    expect(failed.error).toBe('ENOTFOUND unreachable.example.com');
  });
});

// ---------------------------------------------------------------------------
// 13. Persistence: callback record has timestamps
// ---------------------------------------------------------------------------

describe('Persistence: callback record has timestamps', () => {
  it('createCallbackRecord sets both initiatedAt and updatedAt', () => {
    const beforeMs = Date.now();
    const correlationId = randomUUID();
    const record = createCallbackRecord(correlationId, 'https://example.com/cb');
    const afterMs = Date.now();

    expect(record.initiatedAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();

    const initiatedMs = new Date(record.initiatedAt).getTime();
    const updatedMs = new Date(record.updatedAt).getTime();

    expect(initiatedMs).toBeGreaterThanOrEqual(beforeMs);
    expect(initiatedMs).toBeLessThanOrEqual(afterMs);
    expect(updatedMs).toBeGreaterThanOrEqual(beforeMs);
    expect(updatedMs).toBeLessThanOrEqual(afterMs);
  });

  it('advanceCallbackRecord updates updatedAt and does not mutate the original', () => {
    const correlationId = randomUUID();
    const original = createCallbackRecord(correlationId);

    const advanced = advanceCallbackRecord(original, 'callback-sent');

    // Original not mutated
    expect(original.state).toBe('initiated');

    // updatedAt is a valid ISO timestamp
    expect(new Date(advanced.updatedAt).getTime()).not.toBeNaN();
    // updatedAt is >= initiatedAt
    expect(new Date(advanced.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(original.initiatedAt).getTime(),
    );
  });

  it('CallbackCorrelationService record preserves correlationId across all state transitions', () => {
    const service = makeService();
    const record = service.initiate('https://example.com/callback');
    const { correlationId } = record;

    const sent = service.markSent(correlationId);
    expect(sent.correlationId).toBe(correlationId);

    const received = service.receiveCallback(correlationId, { result: 'ok' });
    expect(received.correlationId).toBe(correlationId);

    const verified = service.verify(correlationId);
    expect(verified.correlationId).toBe(correlationId);
  });
});
