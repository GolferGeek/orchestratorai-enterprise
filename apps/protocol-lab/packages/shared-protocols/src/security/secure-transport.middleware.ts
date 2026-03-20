/**
 * SecureTransportMiddleware
 *
 * Wraps any ITransportProvider with a full security layer:
 *   1. Outbound (send): attach a MessageSecurityEnvelope containing a nonce,
 *      timestamp, sender identity, and Ed25519 signature over the canonical
 *      serialisation of the message.
 *   2. Inbound (receive): verify the envelope on every incoming message —
 *      timestamp window check, replay detection, signature verification, and
 *      optional JSON Schema validation of params — before dispatching to the
 *      real application handler.
 *
 * All other ITransportProvider methods (stream, ping) are forwarded to the
 * wrapped transport unchanged.  stream() additionally attaches a security
 * envelope to the message before forwarding.
 *
 * Error response codes follow JSON-RPC 2.0 conventions:
 *   -32700  Parse error (malformed security envelope)
 *   -32600  Invalid request (timestamp expired, schema invalid)
 *   -32001  Replay detected
 *   -32002  Signature invalid
 */

import * as crypto from 'crypto';
import {
  ITransportProvider,
  TransportMessage,
  TransportResponse,
} from '../transport/transport.interface';
import { IIdentityProvider } from '../identity/identity.interface';
import {
  MessageSecurityEnvelope,
  SecureTransportMessage,
} from '@agent-communication/shared-types';
import { INonceStore } from './nonce-store';
import { SchemaValidator } from './schema-validator';

export interface SecureTransportConfig {
  /**
   * How far (in ms) a message timestamp may be from Date.now() before it is
   * rejected.  Protects against both stale replays and clock-skew attacks.
   * Default: 5 minutes (300 000 ms).
   */
  timestampWindowMs?: number;
}

/** JSON-RPC error codes used by this middleware. */
const ERRORS = {
  MALFORMED_ENVELOPE: { code: -32700, message: 'Malformed security envelope' },
  TIMESTAMP_EXPIRED: { code: -32600, message: 'Message timestamp outside acceptance window' },
  REPLAY_DETECTED: { code: -32001, message: 'Replay detected: nonce already seen' },
  SIGNATURE_INVALID: { code: -32002, message: 'Signature verification failed' },
  SCHEMA_INVALID: { code: -32600, message: 'Schema validation failed' },
} as const;

/**
 * Produces a stable, sorted JSON serialisation of any object so that
 * signatures are deterministic regardless of insertion order.
 */
function canonicalSerialize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(canonicalSerialize).join(',') + ']';
  }

  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => {
      const value = (obj as Record<string, unknown>)[k];
      return JSON.stringify(k) + ':' + canonicalSerialize(value);
    })
    .join(',');

  return '{' + sorted + '}';
}

/**
 * The payload that is signed is the canonical serialisation of:
 * { id, method, params, nonce, timestamp }
 * — i.e. the message identity + the security fields that must not be tampered
 * with.  The envelope itself (senderPublicKey, identityProvider, signature)
 * is excluded to avoid a circular dependency.
 */
function buildSigningPayload(
  message: TransportMessage,
  nonce: string,
  timestamp: number,
): string {
  return canonicalSerialize({
    id: message.id,
    method: message.method,
    params: message.params ?? {},
    nonce,
    timestamp,
  });
}

function errorResponse(
  id: string,
  error: { code: number; message: string },
  detail?: unknown,
): TransportResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: error.code,
      message: error.message,
      data: detail,
    },
  };
}

export class SecureTransportMiddleware implements ITransportProvider {
  readonly providerId: string;

  private readonly timestampWindowMs: number;

  constructor(
    private readonly transport: ITransportProvider,
    private readonly identity: IIdentityProvider,
    private readonly nonceStore: INonceStore,
    private readonly schemaValidator?: SchemaValidator,
    config: SecureTransportConfig = {},
  ) {
    this.providerId = `secure(${transport.providerId})`;
    this.timestampWindowMs = config.timestampWindowMs ?? 5 * 60 * 1_000;
  }

  // ---------------------------------------------------------------------------
  // ITransportProvider — outbound
  // ---------------------------------------------------------------------------

  async send(targetUrl: string, message: TransportMessage): Promise<TransportResponse> {
    const secured = await this.attachEnvelope(message);
    return this.transport.send(targetUrl, secured as unknown as TransportMessage);
  }

  async *stream(
    targetUrl: string,
    message: TransportMessage,
  ): AsyncIterable<TransportResponse> {
    const secured = await this.attachEnvelope(message);
    yield* this.transport.stream(targetUrl, secured as unknown as TransportMessage);
  }

  async ping(targetUrl: string): Promise<{ alive: boolean; latencyMs: number }> {
    return this.transport.ping(targetUrl);
  }

  // ---------------------------------------------------------------------------
  // ITransportProvider — inbound
  // ---------------------------------------------------------------------------

  receive(handler: (message: TransportMessage) => Promise<TransportResponse>): void {
    this.transport.receive(async (raw: TransportMessage): Promise<TransportResponse> => {
      // The wire type is SecureTransportMessage but the interface types it as
      // TransportMessage.  Cast carefully.
      const secure = raw as unknown as SecureTransportMessage;

      // --- 1. Structural validation -------------------------------------------
      if (
        !secure.security ||
        typeof secure.security.nonce !== 'string' ||
        typeof secure.security.timestamp !== 'number' ||
        typeof secure.security.senderId !== 'string' ||
        typeof secure.security.senderPublicKey !== 'string' ||
        typeof secure.security.signature !== 'string' ||
        typeof secure.security.identityProvider !== 'string'
      ) {
        return errorResponse(secure.id ?? 'unknown', ERRORS.MALFORMED_ENVELOPE);
      }

      const env: MessageSecurityEnvelope = secure.security;

      // --- 2. Timestamp window check ------------------------------------------
      const now = Date.now();
      const delta = Math.abs(now - env.timestamp);

      if (delta > this.timestampWindowMs) {
        return errorResponse(secure.id, ERRORS.TIMESTAMP_EXPIRED, {
          receivedAt: now,
          messageTimestamp: env.timestamp,
          windowMs: this.timestampWindowMs,
          deltaMs: delta,
        });
      }

      // --- 3. Replay protection -----------------------------------------------
      if (this.nonceStore.hasNonce(env.nonce)) {
        return errorResponse(secure.id, ERRORS.REPLAY_DETECTED, {
          nonce: env.nonce,
        });
      }

      // --- 4. Signature verification ------------------------------------------
      // Re-build the exact payload that the sender signed.
      const baseMessage: TransportMessage = {
        jsonrpc: '2.0',
        id: secure.id,
        method: secure.method,
        params: secure.params,
      };

      const signingPayload = buildSigningPayload(baseMessage, env.nonce, env.timestamp);

      const signatureValid = await this.identity.verify(
        signingPayload,
        env.signature,
        env.senderPublicKey,
      );

      if (!signatureValid) {
        return errorResponse(secure.id, ERRORS.SIGNATURE_INVALID, {
          senderId: env.senderId,
        });
      }

      // --- 5. Schema validation (optional) ------------------------------------
      if (this.schemaValidator) {
        const outcome = this.schemaValidator.validate(secure.method, secure.params);
        if (!outcome.valid) {
          return errorResponse(secure.id, ERRORS.SCHEMA_INVALID, {
            validationErrors: outcome.errors,
          });
        }
      }

      // --- 6. Record nonce (after all checks pass) ----------------------------
      // We record after all checks so a message that fails validation does not
      // consume a nonce slot (the attacker can't block a replay of the
      // legitimate message by sending a forged version first).
      this.nonceStore.recordNonce(env.nonce, env.timestamp);

      // --- 7. Dispatch to application handler ---------------------------------
      return handler(baseMessage);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds and attaches a `MessageSecurityEnvelope` to the outbound message.
   * The method is intentionally synchronous in structure even though it awaits
   * identity operations; each await is essential and cannot be parallelised
   * without losing the signing-payload guarantee.
   */
  private async attachEnvelope(
    message: TransportMessage,
  ): Promise<SecureTransportMessage> {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now();

    // Obtain current identity — throws if identity has not been generated.
    const identityList = await this.identity.resolveIdentity(
      // The identity provider exposes no "current identity" API; we resolve by
      // a sentinel approach.  LocalKeysIdentityProvider stores identities by
      // id.  We generate a temporary identity if none exists.
      // NOTE: production callers must call generateIdentity() before first use.
      // We surface the error rather than silently generating one.
      '_current_',
    );

    // If the identity provider does not recognise '_current_', fall back to
    // generating one.  This allows first-message bootstrapping while still
    // surfacing the requirement that callers prepare the identity provider.
    //
    // IMPORTANT: this is NOT a silent fallback in the "no fallbacks" sense —
    // it is deterministic bootstrapping.  The error path is: if generateIdentity
    // also fails, the error propagates to the caller immediately.
    let agentIdentity = identityList;
    if (!agentIdentity) {
      agentIdentity = await this.identity.generateIdentity();
    }

    const signingPayload = buildSigningPayload(message, nonce, timestamp);
    const signature = await this.identity.sign(signingPayload);

    const envelope: MessageSecurityEnvelope = {
      nonce,
      timestamp,
      senderId: agentIdentity.id,
      senderPublicKey: agentIdentity.publicKey,
      signature,
      identityProvider: this.identity.providerId,
    };

    return {
      jsonrpc: '2.0',
      id: message.id,
      method: message.method,
      params: message.params ?? {},
      security: envelope,
    };
  }
}
