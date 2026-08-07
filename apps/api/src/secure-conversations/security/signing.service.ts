import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

/**
 * SigningService — Request signing and verification for external A2A communication.
 *
 * Secure Conversations applies production security hardening on all external-facing endpoints.
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

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly nonceStore: Map<string, number> = new Map();
  private readonly signingKey: string;

  constructor(config: ConfigService) {
    this.signingKey = config
      .get<string>('SECURE_CONVERSATIONS_SIGNING_KEY', '')
      .trim();
  }

  /**
   * Generate a signed security envelope for an outbound request.
   * Always call this before sending A2A requests to external agents.
   */
  generateEnvelope(senderId: string, payload: unknown): SecurityEnvelope {
    const signingKey = this.requireSigningKey();
    this.pruneExpiredNonces();

    const nonce = randomUUID();
    const timestamp = new Date().toISOString();
    const signingTarget = { payload, nonce, timestamp, senderId };
    const signature = this.computeSignature(signingTarget, signingKey);

    const keyFingerprint = createHmac('sha256', senderId)
      .update(signingKey)
      .digest('hex');

    return {
      nonce,
      timestamp,
      senderId,
      senderPublicKey: `04${keyFingerprint}`,
      signature,
      identityProvider: 'shared-hmac-sha256',
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

    if (
      !envelope.nonce.trim() ||
      envelope.nonce.length > 128 ||
      !envelope.senderId.trim() ||
      envelope.senderId.length > 128 ||
      !/^[a-f0-9]{64}$/i.test(envelope.signature)
    ) {
      return {
        valid: false,
        checks: { schemaValid: false, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32700,
        rejectionReason: 'Malformed security envelope: invalid field format',
      };
    }

    if (!this.signingKey) {
      this.logger.error(
        'SECURE_CONVERSATIONS_SIGNING_KEY is not configured; rejecting signed request',
      );
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32050,
        rejectionReason: 'Security verification is unavailable',
      };
    }
    if (Buffer.byteLength(this.signingKey, 'utf8') < 32) {
      this.logger.error(
        'SECURE_CONVERSATIONS_SIGNING_KEY must contain at least 32 bytes',
      );
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32050,
        rejectionReason: 'Security verification is unavailable',
      };
    }

    const expectedKeyFingerprint = `04${createHmac('sha256', envelope.senderId)
      .update(this.signingKey)
      .digest('hex')}`;
    if (
      envelope.identityProvider !== 'shared-hmac-sha256' ||
      !this.safeEqualText(
        envelope.senderPublicKey,
        expectedKeyFingerprint,
      )
    ) {
      return {
        valid: false,
        checks: { schemaValid: true, timestampValid: false, nonceUnique: false, signatureValid: false },
        rejectionCode: -32002,
        rejectionReason: 'Sender key identity verification failed',
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
    const expectedSignature = this.computeSignature(
      signingTarget,
      this.signingKey,
    );

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

  private requireSigningKey(): string {
    if (!this.signingKey) {
      throw new Error(
        'SECURE_CONVERSATIONS_SIGNING_KEY is required for signed A2A requests',
      );
    }
    if (Buffer.byteLength(this.signingKey, 'utf8') < 32) {
      throw new Error(
        'SECURE_CONVERSATIONS_SIGNING_KEY must contain at least 32 bytes',
      );
    }
    return this.signingKey;
  }

  private computeSignature(payload: unknown, signingKey: string): string {
    const canonical = canonicalSerialize(payload);
    return createHmac('sha256', signingKey).update(canonical).digest('hex');
  }

  private safeEqualText(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
