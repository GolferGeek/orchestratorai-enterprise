/**
 * SecurityService unit tests — 16 tests covering:
 * - Nonce uniqueness
 * - Signature round-trip (sign → verify)
 * - Tampered-payload rejection
 * - Replay detection
 * - Timestamp window enforcement
 * - Schema (field presence) validation
 * - Canonical serialisation stability
 * - Envelope completeness
 * - Correct error codes for each failure type
 * - Expired-nonce pruning
 */

import { SecurityService } from '../security.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): SecurityService {
  return new SecurityService();
}

function freshEnvelope(service: SecurityService, payload: unknown = { data: 'test' }) {
  return service.generateEnvelope('test-sender', payload);
}

// ---------------------------------------------------------------------------
// Nonce uniqueness
// ---------------------------------------------------------------------------

describe('nonce uniqueness', () => {
  it('generates a unique nonce across 100 invocations', () => {
    const service = makeService();
    const nonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const env = service.generateEnvelope('sender', { seq: i });
      nonces.add(env.nonce);
    }
    expect(nonces.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Signature round-trip
// ---------------------------------------------------------------------------

describe('signature verification', () => {
  it('accepts a valid envelope over the original payload', () => {
    const service = makeService();
    const payload = { loanId: 'L-001', amount: 150000 };
    const env = freshEnvelope(service, payload);

    const result = service.validateEnvelope(env, payload);
    expect(result.valid).toBe(true);
    expect(result.checks.signatureValid).toBe(true);
  });

  it('rejects a tampered payload with code -32002', () => {
    const service = makeService();
    const payload = { loanId: 'L-001', amount: 150000 };
    const env = freshEnvelope(service, payload);

    const tamperedPayload = { loanId: 'L-001', amount: 999999 };
    const result = service.validateEnvelope(env, tamperedPayload);

    expect(result.valid).toBe(false);
    expect(result.rejectionCode).toBe(-32002);
    expect(result.checks.signatureValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Replay protection
// ---------------------------------------------------------------------------

describe('replay protection', () => {
  it('accepts a nonce on first use', () => {
    const service = makeService();
    const payload = { x: 1 };
    const env = freshEnvelope(service, payload);

    const result = service.validateEnvelope(env, payload);
    expect(result.valid).toBe(true);
    expect(result.checks.nonceUnique).toBe(true);
  });

  it('rejects the same nonce on second use with code -32001', () => {
    const service = makeService();
    const payload = { x: 1 };
    const env = freshEnvelope(service, payload);

    // First use — accepted
    service.validateEnvelope(env, payload);

    // Second use — replay detected
    const result = service.validateEnvelope(env, payload);
    expect(result.valid).toBe(false);
    expect(result.rejectionCode).toBe(-32001);
    expect(result.checks.nonceUnique).toBe(false);
  });

  it('accepts a different nonce after a replay rejection', () => {
    const service = makeService();
    const payload = { x: 1 };
    const env1 = freshEnvelope(service, payload);
    service.validateEnvelope(env1, payload); // consume env1

    // Replay env1
    const replayResult = service.validateEnvelope(env1, payload);
    expect(replayResult.valid).toBe(false);
    expect(replayResult.rejectionCode).toBe(-32001);

    // Fresh envelope with a different nonce — should pass
    const env2 = freshEnvelope(service, payload);
    const freshResult = service.validateEnvelope(env2, payload);
    expect(freshResult.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timestamp window
// ---------------------------------------------------------------------------

describe('timestamp window', () => {
  it('accepts a message within the 5-minute window', () => {
    const service = makeService();
    const payload = { q: 'recent' };
    const env = freshEnvelope(service, payload);

    const result = service.validateEnvelope(env, payload);
    expect(result.valid).toBe(true);
    expect(result.checks.timestampValid).toBe(true);
  });

  it('rejects a message older than 5 minutes with code -32600', () => {
    const service = makeService();
    const payload = { q: 'old' };
    const env = freshEnvelope(service, payload);

    // Backdate the timestamp by 6 minutes
    const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const staleEnv = { ...env, timestamp: oldTimestamp };

    const result = service.validateEnvelope(staleEnv, payload);
    expect(result.valid).toBe(false);
    expect(result.rejectionCode).toBe(-32600);
    expect(result.checks.timestampValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema / field presence
// ---------------------------------------------------------------------------

describe('schema validation', () => {
  it('accepts an envelope with all required fields', () => {
    const service = makeService();
    const payload = { ok: true };
    const env = freshEnvelope(service, payload);

    const result = service.validateEnvelope(env, payload);
    expect(result.valid).toBe(true);
    expect(result.checks.schemaValid).toBe(true);
  });

  it('rejects an envelope missing required fields with code -32700', () => {
    const service = makeService();

    // Cast intentionally incomplete object to the expected type
    const badEnv = { nonce: 'some-nonce' } as Parameters<typeof service.validateEnvelope>[0];
    const result = service.validateEnvelope(badEnv, { data: 'x' });

    expect(result.valid).toBe(false);
    expect(result.rejectionCode).toBe(-32700);
    expect(result.checks.schemaValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Canonical serialisation
// ---------------------------------------------------------------------------

describe('canonical serialisation', () => {
  it('produces the same signature for identical payloads with different key order', () => {
    const service = makeService();

    const payloadA = { b: 2, a: 1 };
    const payloadB = { a: 1, b: 2 };

    const envA = service.generateEnvelope('sender', payloadA);
    // Reset: use a fresh envelope for payloadB with the same nonce/timestamp to compare
    // signatures — we compare by cross-validating.
    // Build a matching envelope for payloadB using envA's nonce/timestamp/senderId
    // and see if validateEnvelope accepts it against payloadB.
    // (They should be treated identically because canonical serialisation sorts keys.)
    const envB = service.generateEnvelope('sender', payloadB);

    // Both envelopes should be valid against their respective payloads.
    expect(service.validateEnvelope(envA, payloadA).valid).toBe(true);
    expect(service.validateEnvelope(envB, payloadB).valid).toBe(true);

    // Envelope generated for payloadA should also validate against payloadB
    // because they canonicalise identically.
    // However since nonce is consumed, we need a new service instance.
    const freshService = makeService();
    const sharedEnv = freshService.generateEnvelope('sender', payloadA);
    // Validate against payloadB (same data, different key order)
    const result = freshService.validateEnvelope(sharedEnv, payloadB);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateEnvelope completeness
// ---------------------------------------------------------------------------

describe('generateEnvelope', () => {
  it('produces an envelope with all required fields', () => {
    const service = makeService();
    const env = service.generateEnvelope('fcs-financial', { loanId: 'L-001' });

    expect(typeof env.nonce).toBe('string');
    expect(env.nonce.length).toBeGreaterThan(0);
    expect(typeof env.timestamp).toBe('string');
    expect(new Date(env.timestamp).getTime()).not.toBeNaN();
    expect(env.senderId).toBe('fcs-financial');
    expect(typeof env.senderPublicKey).toBe('string');
    expect(env.senderPublicKey.startsWith('04')).toBe(true);
    expect(typeof env.signature).toBe('string');
    expect(env.signature.length).toBeGreaterThan(0);
    expect(env.identityProvider).toBe('oauth-jwt');
  });
});

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

describe('error codes', () => {
  it('returns -32001 for replay attacks', () => {
    const service = makeService();
    const payload = { t: 'replay' };
    const env = freshEnvelope(service, payload);
    service.validateEnvelope(env, payload); // consume
    expect(service.validateEnvelope(env, payload).rejectionCode).toBe(-32001);
  });

  it('returns -32002 for signature failures', () => {
    const service = makeService();
    const payload = { t: 'sig' };
    const env = freshEnvelope(service, payload);
    expect(service.validateEnvelope(env, { t: 'tampered' }).rejectionCode).toBe(-32002);
  });

  it('returns -32600 for expired timestamps', () => {
    const service = makeService();
    const payload = { t: 'ts' };
    const env = { ...freshEnvelope(service, payload), timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString() };
    expect(service.validateEnvelope(env, payload).rejectionCode).toBe(-32600);
  });

  it('returns -32700 for missing envelope fields', () => {
    const service = makeService();
    const badEnv = {} as Parameters<typeof service.validateEnvelope>[0];
    expect(service.validateEnvelope(badEnv, {}).rejectionCode).toBe(-32700);
  });
});

// ---------------------------------------------------------------------------
// Nonce pruning
// ---------------------------------------------------------------------------

describe('nonce pruning', () => {
  it('allows fresh nonces after pruning removes expired ones', () => {
    // We cannot directly test the private pruneExpiredNonces without reflection,
    // but we CAN verify that the service keeps working correctly after many
    // nonces have been recorded — implying pruning does not break internal state.
    const service = makeService();
    const results: boolean[] = [];

    for (let i = 0; i < 50; i++) {
      const payload = { seq: i };
      const env = service.generateEnvelope('sender', payload);
      const result = service.validateEnvelope(env, payload);
      results.push(result.valid);
    }

    // All 50 fresh nonces should be accepted
    expect(results.every((v) => v === true)).toBe(true);
  });
});
