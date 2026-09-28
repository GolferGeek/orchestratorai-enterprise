import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { importJWK, SignJWT, type JWK } from 'jose';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';

export const GATEHOUSE_ALGORITHM = 'ES256';
const TOKEN_LIFETIME_SECONDS = 120;

/**
 * The Gatehouse's own key pair. The private key is a JWK (ES256, with a kid)
 * in the config provider under GATEHOUSE_SIGNING_KEY, never in the database.
 * The public half is published as a JWK set, and every outbound call a
 * partner should trust (a reply to a registered caller) carries a JWT signed
 * with it.
 */
@Injectable()
export class GatehouseKeysService implements OnModuleInit {
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;

  constructor(@Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider) {}

  async onModuleInit(): Promise<void> {
    const jwk = parseSigningKey(this.config.getRequired('GATEHOUSE_SIGNING_KEY'));
    this.privateKey = (await importJWK(jwk, GATEHOUSE_ALGORITHM)) as CryptoKey;
    this.publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid: jwk.kid, alg: GATEHOUSE_ALGORITHM, use: 'sig' };
  }

  /** What GET /gatehouse/jwks.json serves. */
  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  /**
   * A short-lived token for one outbound call: iss is the sending agent's
   * card URL, aud the receiver's endpoint, and jku points to our JWK set.
   */
  async sign(issuer: string, audience: string, jwksUrl: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: GATEHOUSE_ALGORITHM, kid: this.publicJwk.kid!, jku: jwksUrl, typ: 'JWT' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
      .setJti(randomUUID())
      .sign(this.privateKey);
  }
}

/** A private EC P-256 JWK with a kid; anything else is a configuration error. */
export function parseSigningKey(raw: string): JWK {
  let jwk: unknown;
  try {
    jwk = JSON.parse(raw);
  } catch {
    throw new Error('GATEHOUSE_SIGNING_KEY must be a JSON JWK');
  }
  const key = jwk as JWK;
  if (typeof jwk !== 'object' || jwk === null || key.kty !== 'EC' || key.crv !== 'P-256' || !key.d || !key.x || !key.y) {
    throw new Error('GATEHOUSE_SIGNING_KEY must be a private EC P-256 JWK (ES256)');
  }
  if (typeof key.kid !== 'string' || !key.kid) throw new Error('GATEHOUSE_SIGNING_KEY needs a kid');
  return key;
}
