import { Injectable } from '@nestjs/common';
import { createLocalJWKSet, decodeJwt, importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { OutboundUrlValidatorService } from '../secure-conversations/security/outbound-url-validator.service';
import { readBoundedJsonResponse } from '../secure-conversations/security/bounded-json-response';
import { A2AClientService } from './a2a-client.service';
import { Caller, CallersRepository } from './callers.repository';

/** Algorithms a caller may sign with. Never 'none', never HMAC. */
export const CALLER_ALGORITHMS = ['ES256', 'EdDSA', 'RS256'];
const MAXIMUM_TOKEN_LIFETIME_SECONDS = 300;
const MAXIMUM_JWKS_BYTES = 65_536;
const JWKS_TTL_MS = 10 * 60_000;

export type GatehouseAuthFailure = 'unauthenticated' | 'forbidden' | 'rate-limited' | 'invalid-registration';

/** Why a caller was turned away; the message is safe to send back. */
export class GatehouseAuthError extends Error {
  constructor(readonly failure: GatehouseAuthFailure, message: string) {
    super(message);
  }
}

export interface CallerJwks {
  keys: JWK[];
}

/**
 * Who is calling. Every request carries a short-lived JWT signed with the
 * caller's private key: iss = its registered agent card URL, aud = the
 * endpoint it is calling, a unique jti, and a lifetime of at most five
 * minutes. We verify it against the caller's registered public keys, refuse a
 * reused jti, and hold the caller to its rate limit.
 */
@Injectable()
export class CallerAuthService {
  private readonly remoteKeys = new Map<string, { jwks: CallerJwks; fetchedAt: number }>();
  private lastPruned = 0;

  constructor(
    private readonly callers: CallersRepository,
    private readonly outboundUrls: OutboundUrlValidatorService,
    private readonly a2a: A2AClientService,
  ) {}

  async verify(token: string, audience: string): Promise<Caller> {
    const issuer = unverifiedIssuer(token);
    const caller = await this.callers.byCardUrl(issuer);
    if (!caller) throw new GatehouseAuthError('unauthenticated', 'Unknown caller: register its agent card first');
    if (caller.status !== 'active') throw new GatehouseAuthError('forbidden', 'This caller is suspended');

    const jwks = caller.jwks ?? (await this.remoteJwks(caller.jwksUrl!));
    const payload = await verifyWith(token, jwks, issuer, audience);

    const since = new Date(Date.now() - 60_000);
    if ((await this.callers.requestsSince(caller.id, since)) >= caller.rateLimitPerMinute) {
      throw new GatehouseAuthError('rate-limited', `More than ${caller.rateLimitPerMinute} requests a minute`);
    }
    if (!(await this.callers.claimToken(caller.id, payload.jti!, new Date(payload.exp! * 1000)))) {
      throw new GatehouseAuthError('unauthenticated', 'This token was already used');
    }
    await this.callers.touch(caller.id);
    if (Date.now() - this.lastPruned > 10 * 60_000) {
      this.lastPruned = Date.now();
      await this.callers.pruneExpiredTokens(new Date());
    }
    return caller;
  }

  /**
   * A caller registers itself: its card and its JWK set are on the same https
   * origin, and the request is signed by one of those keys. Together that
   * proves it controls the origin its card names.
   */
  async registerSelf(token: string, audience: string, cardUrl: string, jwksUrl: string): Promise<Caller> {
    const card = requireHttps(cardUrl, 'cardUrl');
    const keys = requireHttps(jwksUrl, 'jwksUrl');
    if (card.origin !== keys.origin) {
      throw new GatehouseAuthError('invalid-registration', 'The card and the JWK set must be on the same origin');
    }
    if (unverifiedIssuer(token) !== cardUrl) {
      throw new GatehouseAuthError('invalid-registration', 'The registration token must be issued by the card URL');
    }
    const agentCard = await this.a2a.card(cardUrl);
    this.remoteKeys.delete(jwksUrl);
    await verifyWith(token, await this.remoteJwks(jwksUrl), cardUrl, audience);
    return this.callers.upsert({ name: agentCard.name, cardUrl, jwksUrl, jwks: null, registeredBy: 'self' });
  }

  /** An admin registers a caller with a pasted public JWK set. */
  async registerByAdmin(name: string, cardUrl: string, jwks: unknown, userId: string): Promise<Caller> {
    requireHttps(cardUrl, 'cardUrl');
    if (!name.trim()) throw new GatehouseAuthError('invalid-registration', 'name is required');
    return this.callers.upsert({ name, cardUrl, jwksUrl: null, jwks: await publicJwks(jwks), registeredBy: `admin:${userId}` });
  }

  private async remoteJwks(jwksUrl: string): Promise<CallerJwks> {
    const cached = this.remoteKeys.get(jwksUrl);
    if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;
    const url = await this.outboundUrls.assertSafe(jwksUrl);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (response.status !== 200) {
      throw new GatehouseAuthError('unauthenticated', `The caller's JWK set returned HTTP ${response.status}`);
    }
    const jwks = await publicJwks(await readBoundedJsonResponse(response, MAXIMUM_JWKS_BYTES, 'The JWK set'));
    this.remoteKeys.set(jwksUrl, { jwks, fetchedAt: Date.now() });
    return jwks;
  }
}

function unverifiedIssuer(token: string): string {
  let payload: JWTPayload;
  try {
    payload = decodeJwt(token);
  } catch {
    throw new GatehouseAuthError('unauthenticated', 'The bearer token is not a JWT');
  }
  if (typeof payload.iss !== 'string' || !payload.iss.startsWith('https://')) {
    throw new GatehouseAuthError('unauthenticated', 'The token must be issued by the caller\'s https agent card URL');
  }
  return payload.iss;
}

async function verifyWith(token: string, jwks: CallerJwks, issuer: string, audience: string): Promise<JWTPayload> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer,
      audience,
      algorithms: CALLER_ALGORITHMS,
      requiredClaims: ['exp', 'iat', 'jti'],
      maxTokenAge: `${MAXIMUM_TOKEN_LIFETIME_SECONDS}s`,
    }));
  } catch (error) {
    throw new GatehouseAuthError('unauthenticated', `The token did not verify: ${(error as Error).message}`);
  }
  if (payload.exp! - payload.iat! > MAXIMUM_TOKEN_LIFETIME_SECONDS) {
    throw new GatehouseAuthError('unauthenticated', `A token may live at most ${MAXIMUM_TOKEN_LIFETIME_SECONDS} seconds`);
  }
  if (typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 200) {
    throw new GatehouseAuthError('unauthenticated', 'The token needs a jti of 8 to 200 characters');
  }
  return payload;
}

/** A JWK set of public signing keys only: a private key is refused, not stripped. */
export async function publicJwks(raw: unknown): Promise<CallerJwks> {
  const keys = (raw as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 10) {
    throw new GatehouseAuthError('invalid-registration', 'A JWK set needs 1 to 10 keys');
  }
  for (const key of keys as JWK[]) {
    if (typeof key !== 'object' || key === null) throw new GatehouseAuthError('invalid-registration', 'Each key must be a JWK');
    if ('d' in key || 'p' in key || 'k' in key) {
      throw new GatehouseAuthError('invalid-registration', 'Send public keys only; a private or symmetric key is refused');
    }
    if (typeof key.alg !== 'string' || !CALLER_ALGORITHMS.includes(key.alg)) {
      throw new GatehouseAuthError('invalid-registration', `Each key needs alg ${CALLER_ALGORITHMS.join(', ')}`);
    }
    try {
      await importJWK(key, key.alg);
    } catch (error) {
      throw new GatehouseAuthError('invalid-registration', `A key does not import: ${(error as Error).message}`);
    }
  }
  return { keys: keys as JWK[] };
}

function requireHttps(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatehouseAuthError('invalid-registration', `${field} is not a URL`);
  }
  if (url.protocol !== 'https:') throw new GatehouseAuthError('invalid-registration', `${field} must be https`);
  return url;
}
