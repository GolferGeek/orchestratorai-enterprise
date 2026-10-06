/**
 * Caller identity against the real gatehouse tables: registration (by an admin
 * and by the caller itself), token verification, replay, rate limit and
 * suspension. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Every caller it
 * creates is under https://spec-*<run>.example and removed after.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { exportJWK, generateKeyPair, jwtVerify, createLocalJWKSet, SignJWT, type JWK } from 'jose';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import type { A2AClientService } from './a2a-client.service';
import { CallerAuthService, GatehouseAuthError } from './caller-auth.service';
import { CallersRepository } from './callers.repository';
import { GatehouseKeysService } from './gatehouse-keys.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;
const AUDIENCE = 'https://enterprise.example/api/a2a/spec-agent';

async function keyPair(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  return { privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: 'ES256' } as JWK };
}

function token(key: CryptoKey, claims: { iss: string; aud?: string; lifetime?: number; jti?: string; iat?: number }) {
  const iat = claims.iat ?? Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(claims.iss)
    .setAudience(claims.aud ?? AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (claims.lifetime ?? 60))
    .setJti(claims.jti ?? randomUUID())
    .sign(key);
}

const failure = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GatehouseAuthError) return `${error.failure}: ${error.message}`;
    throw error;
  }
  throw new Error('expected a GatehouseAuthError');
};

describeWithDb('caller identity against Postgres', () => {
  const run = randomUUID().slice(0, 8);
  const cardUrl = `https://spec-${run}.example/.well-known/agent-card.json`;
  let db: PostgresqlDatabaseService;
  let callers: CallersRepository;
  let auth: CallerAuthService;
  let key: Awaited<ReturnType<typeof keyPair>>;
  const outboundUrls = { assertSafe: jest.fn(async (value: string) => new URL(value)) };
  const a2a = { card: jest.fn() };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    callers = new CallersRepository(db);
    auth = new CallerAuthService(callers, outboundUrls as never, a2a as unknown as A2AClientService);
    key = await keyPair('k1');
  });

  afterAll(async () => {
    // Only this run's callers: other specs register spec-* callers in parallel.
    await db.rawQuery(`DELETE FROM gatehouse.callers WHERE card_url LIKE $1`, [`https://spec-%${run}.example/%`]);

    await db.onModuleDestroy();
  });

  it('an admin registers public keys only; a verified token names the caller once', async () => {
    expect(await failure(auth.registerByAdmin('Spec', cardUrl, { keys: [{ ...key.publicJwk, d: 'secret' }] }, 'u'))).toMatch('private or symmetric');
    expect(await failure(auth.registerByAdmin('Spec', cardUrl, { keys: [{ kty: 'oct', k: 'abc', alg: 'HS256' }] }, 'u'))).toMatch('private or symmetric');
    expect(await failure(auth.registerByAdmin('Spec', 'http://spec.example/card', { keys: [key.publicJwk] }, 'u'))).toMatch('https');
    const caller = await auth.registerByAdmin('Spec partner', cardUrl, { keys: [key.publicJwk] }, 'admin-1');
    expect(caller).toMatchObject({ name: 'Spec partner', status: 'active', registeredBy: 'admin:admin-1', jwksUrl: null });

    const jti = randomUUID();
    const signed = await token(key.privateKey, { iss: cardUrl, jti });
    expect((await auth.verify(signed, AUDIENCE)).id).toBe(caller.id);
    expect(await failure(auth.verify(signed, AUDIENCE))).toBe('unauthenticated: This token was already used');
    expect((await callers.byCardUrl(cardUrl))?.lastSeenAt).not.toBeNull();
  });

  it('refuses a token for another endpoint, one that lives too long, a stranger, or another key', async () => {
    expect(await failure(auth.verify(await token(key.privateKey, { iss: cardUrl, aud: 'https://elsewhere.example/a2a' }), AUDIENCE))).toMatch('did not verify');
    expect(await failure(auth.verify(await token(key.privateKey, { iss: cardUrl, lifetime: 3600 }), AUDIENCE))).toMatch('at most 300 seconds');
    expect(await failure(auth.verify(await token(key.privateKey, { iss: `https://stranger-${run}.example/card` }), AUDIENCE))).toMatch('Unknown caller');
    const other = await keyPair('k1');
    expect(await failure(auth.verify(await token(other.privateKey, { iss: cardUrl }), AUDIENCE))).toMatch('did not verify');
    expect(await failure(auth.verify('not-a-jwt', AUDIENCE))).toMatch('not a JWT');
  });

  it('holds a caller to its rate limit, and turns away a suspended caller', async () => {
    const caller = (await callers.byCardUrl(cardUrl))!;
    await db.rawQuery(`UPDATE gatehouse.callers SET rate_limit_per_minute = 2 WHERE id = $1`, [caller.id]);
    await db.rawQuery(`DELETE FROM gatehouse.used_tokens WHERE caller_id = $1`, [caller.id]);
    await auth.verify(await token(key.privateKey, { iss: cardUrl }), AUDIENCE);
    await auth.verify(await token(key.privateKey, { iss: cardUrl }), AUDIENCE);
    expect(await failure(auth.verify(await token(key.privateKey, { iss: cardUrl }), AUDIENCE))).toBe('rate-limited: More than 2 requests a minute');

    await callers.setStatus(caller.id, 'suspended');
    expect(await failure(auth.verify(await token(key.privateKey, { iss: cardUrl }), AUDIENCE))).toBe('forbidden: This caller is suspended');
  });

  it('lets a caller register itself with a card and key set on one origin, signed by that key', async () => {
    const origin = `https://spec-self-${run}.example`;
    const selfCard = `${origin}/.well-known/agent-card.json`;
    const jwksUrl = `${origin}/.well-known/jwks.json`;
    const register = `https://enterprise.example/api/gatehouse/callers/register`;
    a2a.card.mockResolvedValue({ name: 'Self-registered partner', description: 'd', url: `${origin}/a2a`, skills: [] });
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ keys: [key.publicJwk] }), { status: 200 })) as unknown as typeof fetch;

    expect(await failure(auth.registerSelf(await token(key.privateKey, { iss: selfCard, aud: register }), register, selfCard, `https://other-${run}.example/jwks.json`))).toMatch('same origin');
    expect(await failure(auth.registerSelf(await token(key.privateKey, { iss: `${origin}/other`, aud: register }), register, selfCard, jwksUrl))).toMatch('issued by the card URL');
    const other = await keyPair('k1');
    expect(await failure(auth.registerSelf(await token(other.privateKey, { iss: selfCard, aud: register }), register, selfCard, jwksUrl))).toMatch('did not verify');

    const caller = await auth.registerSelf(await token(key.privateKey, { iss: selfCard, aud: register }), register, selfCard, jwksUrl);
    expect(caller).toMatchObject({ name: 'Self-registered partner', registeredBy: 'self', jwksUrl, jwks: null, status: 'active' });
    expect(outboundUrls.assertSafe).toHaveBeenCalledWith(jwksUrl);
    expect((await auth.verify(await token(key.privateKey, { iss: selfCard }), AUDIENCE)).id).toBe(caller.id);
  });
});

describe('our signing key', () => {
  it('publishes only the public half, and signs tokens that verify against it', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(privateKey)), kid: 'gatehouse-1' };
    const keys = new GatehouseKeysService({ getRequired: () => JSON.stringify(jwk) } as never);
    await keys.onModuleInit();
    const published = keys.jwks();
    expect(published.keys).toHaveLength(1);
    expect(published.keys[0]).not.toHaveProperty('d');
    expect(published.keys[0]).toMatchObject({ kid: 'gatehouse-1', alg: 'ES256', use: 'sig' });

    const signed = await keys.sign('https://us.example/api/a2a/send-invoice/card', 'https://partner.example/a2a', 'https://us.example/api/gatehouse/jwks.json');
    const { payload, protectedHeader } = await jwtVerify(signed, createLocalJWKSet(published), { audience: 'https://partner.example/a2a' });
    expect(payload.iss).toBe('https://us.example/api/a2a/send-invoice/card');
    expect(protectedHeader).toMatchObject({ kid: 'gatehouse-1', jku: 'https://us.example/api/gatehouse/jwks.json' });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(120);
  });

  it('refuses a signing key that is not a private P-256 JWK with a kid', async () => {
    for (const raw of ['nope', JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', kid: 'k' }), JSON.stringify({ kty: 'RSA', d: 'x', kid: 'k' })]) {
      const keys = new GatehouseKeysService({ getRequired: () => raw } as never);
      await expect(keys.onModuleInit()).rejects.toThrow('GATEHOUSE_SIGNING_KEY');
    }
  });
});
