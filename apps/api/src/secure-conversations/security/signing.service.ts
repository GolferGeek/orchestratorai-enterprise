import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

/**
 * SigningService — Request signing and verification for external A2A communication.
 *
 * Bridge applies production security hardening on all external-facing endpoints.
 * This service handles:
 * - HMAC-SHA256 request signing for outbound requests
 * - Signature verification for inbound requests
 * - Replay protection via nonce tracking
 * - Timestamp window validation (5-minute window)
 *
 * JSON-RPC error codes on failure:
 *   -32700  Malformed envelope (missing required fields)
 *   -32600  Timestamp outside acceptance window
 *   -32001  Replay attack detected (nonce already seen)
 *   -32002  Signature verification failed
 */
export interface SecurityEnvelope {
  nonce: string;
  timestamp: string;
  senderId: string;
  senderPublicKey: string;
  signature: string;
  identityProvider: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: {
    schemaValid: boolean;
    timestampValid: boolean;
    nonceUnique: boolean;
    signatureValid: boolean;
  };
  rejectionCode?: number;
  rejectionReason?: string;
}

const SIGNING_KEY = process.env.BRIDGE_SIGNING_KEY ?? 'bridge-hmac-signing-key-v1';
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly nonceStore: Map<string, number> = new Map();

  /**
   * Generate a signed security envelope for an outbound request.
   * Always call this before sending A2A requests to external agents.
   */
  generateEnvelope(senderId: string, payload: unknown): SecurityEnvelope {
    this.pruneExpiredNonces();

    const nonce = randomUUID();
    const timestamp = new Date().toISOString();
    const signingTarget = { payload, nonce, timestamp, senderId };
    const signature = computeSignature(signingTarget);

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
   * Validate an incoming security envelope from an external agent.
   * Checks schema, timestamp window, nonce uniqueness, and signature.
   */
  validateEnvelope(envelope: SecurityEnvelope, payload: unknown): ValidationResult {
    // 1. Schema check
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
        checks: { schemaValid: false, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32700,
        rejectionReason: 'Malformed security envelope: missing required fields',
      };
    }

    // 2. Timestamp window
    const messageTime = new Date(envelope.timestamp).getTime();
    if (Number.isNaN(messageTime)) {
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32600,
        rejectionReason: 'Invalid timestamp format',
      };
    }

    const delta = Math.abs(Date.now() - messageTime);
    if (delta > WINDOW_MS) {
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32600,
        rejectionReason: `Timestamp outside 5-minute window: delta=${delta}ms`,
      };
    }

    // 3. Replay protection
    if (this.nonceStore.has(envelope.nonce)) {
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: true, nonceUnique: false, signatureValid: false },
        rejectionCode: -32001,
        rejectionReason: `Replay detected: nonce already seen (${envelope.nonce})`,
      };
    }

    // 4. Signature verification
    const signingTarget = {
      payload,
      nonce: envelope.nonce,
      timestamp: envelope.timestamp,
      senderId: envelope.senderId,
    };
    const expectedSignature = computeSignature(signingTarget);

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const actualBuf = Buffer.from(envelope.signature, 'hex');

    let signatureValid = false;
    if (expectedBuf.length === actualBuf.length) {
      signatureValid = timingSafeEqual(expectedBuf, actualBuf);
    }

    if (!signatureValid) {
      this.logger.warn(`Signature mismatch from agent ${envelope.senderId}`);
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: true, nonceUnique: true, signatureValid: false },
        rejectionCode: -32002,
        rejectionReason: 'Signature verification failed',
      };
    }

    // 5. All checks passed — record nonce
    this.pruneExpiredNonces();
    this.nonceStore.set(envelope.nonce, Date.now());

    return {
      valid: true,
      checks: { schemaValid: true, timestampValid: true, nonceUnique: true, signatureValid: true },
    };
  }

  private pruneExpiredNonces(): void {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [nonce, ts] of this.nonceStore) {
      if (ts < cutoff) {
        this.nonceStore.delete(nonce);
      }
    }
  }
}
