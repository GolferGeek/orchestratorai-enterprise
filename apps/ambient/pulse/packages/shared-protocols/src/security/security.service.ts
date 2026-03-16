/**
 * SecurityService
 *
 * Provides real cryptographic security operations for inter-agent communication:
 * - Generating signed security envelopes (nonce + timestamp + HMAC-SHA256 signature)
 * - Validating incoming envelopes (replay protection, timestamp window, signature check)
 *
 * JSON-RPC error codes returned on validation failure:
 *   -32700  Parse error (missing required envelope fields)
 *   -32600  Invalid request (timestamp expired / outside 5-minute window)
 *   -32001  Replay detected (nonce already seen)
 *   -32002  Signature verification failed
 *
 * Signature algorithm: HMAC-SHA256 over the canonical JSON serialisation of the payload.
 * Canonical serialisation sorts object keys recursively so that identical data with
 * different key-insertion order produces identical signatures.
 */

import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

export interface SecurityEnvelopeData {
  nonce: string;
  timestamp: string;       // ISO-8601 string
  senderId: string;
  senderPublicKey: string; // hex-encoded HMAC key fingerprint (first 64 chars of key hex)
  signature: string;       // hex-encoded HMAC-SHA256
  identityProvider: string;
}

export interface SecurityValidationResult {
  valid: boolean;
  checks: {
    nonceUnique: boolean;
    timestampValid: boolean;
    signatureValid: boolean;
    schemaValid: boolean;
  };
  rejectionCode?: number;
  rejectionReason?: string;
}

/** A shared HMAC key for signing/verifying in this in-process security model. */
const SIGNING_KEY = 'agent-communication-shared-hmac-key-v1';

/**
 * Produces a stable, sorted JSON serialisation of any value so that
 * signatures are deterministic regardless of object-key insertion order.
 */
function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalSerialize).join(',') + ']';
  }

  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => {
      const v = (value as Record<string, unknown>)[k];
      return JSON.stringify(k) + ':' + canonicalSerialize(v);
    })
    .join(',');

  return '{' + sorted + '}';
}

function computeSignature(payload: unknown): string {
  const canonical = canonicalSerialize(payload);
  return createHmac('sha256', SIGNING_KEY).update(canonical).digest('hex');
}

export class SecurityService {
  /** Maps nonce → Unix epoch ms at which it was recorded. */
  private readonly nonceStore: Map<string, number> = new Map();
  private readonly WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generates a real security envelope for the given payload.
   * The envelope contains a fresh nonce, current timestamp, HMAC-SHA256 signature,
   * and identity metadata.
   */
  generateEnvelope(senderId: string, payload: unknown): SecurityEnvelopeData {
    this.pruneExpiredNonces();

    const nonce = randomUUID();
    const timestamp = new Date().toISOString();

    // Include nonce and timestamp in the signed payload so the signature
    // covers the full envelope context, preventing partial replay.
    const signingTarget = { payload, nonce, timestamp, senderId };
    const signature = computeSignature(signingTarget);

    // Derive a stable public-key fingerprint from the signing key + senderId.
    // In a real system this would be an actual public key; here we use an HMAC
    // fingerprint to keep the implementation self-contained.
    const keyFingerprint = createHmac('sha256', senderId)
      .update(SIGNING_KEY)
      .digest('hex');

    return {
      nonce,
      timestamp,
      senderId,
      senderPublicKey: `04${keyFingerprint}`,
      signature,
      identityProvider: 'oauth-jwt',
    };
  }

  /**
   * Validates an incoming security envelope against its payload.
   *
   * Checks (in order):
   *   1. Required fields present (-32700 on failure)
   *   2. Timestamp within 5-minute window (-32600 on failure)
   *   3. Nonce not previously seen (-32001 on replay)
   *   4. Signature matches payload (-32002 on mismatch)
   *
   * On success, records the nonce to prevent future replays.
   */
  validateEnvelope(envelope: SecurityEnvelopeData, payload: unknown): SecurityValidationResult {
    // --- 1. Schema / required-fields check ------------------------------------
    if (
      !envelope ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.timestamp !== 'string' ||
      typeof envelope.senderId !== 'string' ||
      typeof envelope.senderPublicKey !== 'string' ||
      typeof envelope.signature !== 'string' ||
      typeof envelope.identityProvider !== 'string'
    ) {
      return {
        valid: false,
        checks: { nonceUnique: false, timestampValid: false, signatureValid: false, schemaValid: false },
        rejectionCode: -32700,
        rejectionReason: 'Malformed security envelope: missing required fields',
      };
    }

    // --- 2. Timestamp window check -------------------------------------------
    const messageTime = new Date(envelope.timestamp).getTime();
    if (Number.isNaN(messageTime)) {
      return {
        valid: false,
        checks: { nonceUnique: false, timestampValid: false, signatureValid: false, schemaValid: true },
        rejectionCode: -32600,
        rejectionReason: 'Invalid timestamp format',
      };
    }

    const delta = Math.abs(Date.now() - messageTime);
    if (delta > this.WINDOW_MS) {
      return {
        valid: false,
        checks: { nonceUnique: false, timestampValid: false, signatureValid: false, schemaValid: true },
        rejectionCode: -32600,
        rejectionReason: `Message timestamp outside acceptance window: delta=${delta}ms, window=${this.WINDOW_MS}ms`,
      };
    }

    // --- 3. Replay protection ------------------------------------------------
    if (this.nonceStore.has(envelope.nonce)) {
      return {
        valid: false,
        checks: { nonceUnique: false, timestampValid: true, signatureValid: false, schemaValid: true },
        rejectionCode: -32001,
        rejectionReason: `Replay detected: nonce already seen (${envelope.nonce})`,
      };
    }

    // --- 4. Signature verification -------------------------------------------
    const signingTarget = {
      payload,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
      senderId: envelope.senderId,
    };
    const expectedSignature = computeSignature(signingTarget);

    // Use timingSafeEqual to prevent timing attacks.
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const actualBuf = Buffer.from(envelope.signature, 'hex');

    let signatureValid = false;
    if (expectedBuf.length === actualBuf.length) {
      signatureValid = timingSafeEqual(expectedBuf, actualBuf);
    }

    if (!signatureValid) {
      return {
        valid: false,
        checks: { nonceUnique: true, timestampValid: true, signatureValid: false, schemaValid: true },
        rejectionCode: -32002,
        rejectionReason: 'Signature verification failed',
      };
    }

    // --- 5. All checks passed — record nonce ---------------------------------
    this.pruneExpiredNonces();
    this.nonceStore.set(envelope.nonce, Date.now());

    return {
      valid: true,
      checks: { nonceUnique: true, timestampValid: true, signatureValid: true, schemaValid: true },
    };
  }

  /** Removes nonces older than the acceptance window to keep memory bounded. */
  private pruneExpiredNonces(): void {
    const cutoff = Date.now() - this.WINDOW_MS;
    for (const [nonce, ts] of this.nonceStore) {
      if (ts < cutoff) {
        this.nonceStore.delete(nonce);
      }
    }
  }
}
