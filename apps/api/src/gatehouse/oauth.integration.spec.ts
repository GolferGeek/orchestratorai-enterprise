/**
 * "Log in with <company>" end to end against the real gatehouse tables: an app
 * registers, the person allows it, the app exchanges its code for an agent key
 * that resolves to the grant, and a refresh rotates both. Set
 * WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its apps are named spec-oauth-*.
 */
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { SelfAsCustomerAccount } from './customer-accounts';
import { GatehouseOAuthService } from './oauth.service';
import { PlatformAgentCredentials } from './platform-agent-credentials';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('Log in with <company> against Postgres', () => {
  const run = randomBytes(4).toString('hex');
  let db: PostgresqlDatabaseService;
  let store: PlatformAgentCredentials;
  let oauth: GatehouseOAuthService;

  beforeAll(() => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    store = new PlatformAgentCredentials(db);
    oauth = new GatehouseOAuthService(store, new SelfAsCustomerAccount());
  });

  afterAll(async () => {
    const { error } = await db.rawQuery(`DELETE FROM gatehouse.oauth_clients WHERE client_name = $1`, [`spec-oauth-${run}`]);
    if (error) throw new Error(error.message);
  });

  it('registers, consents, exchanges, resolves, refreshes, and claims each code once', async () => {
    const registered = await oauth.register({ client_name: `spec-oauth-${run}`, redirect_uris: ['https://app.example/cb'] });
    if (!registered.ok) throw new Error(registered.error_description);
    const verifier = randomBytes(32).toString('base64url');
    const checked = await oauth.check({
      client_id: registered.client.client_id as string,
      redirect_uri: 'https://app.example/cb',
      response_type: 'code',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    if (!checked.ok) throw new Error('check failed');
    const person = { userId: `spec-${run}`, email: 'spec@example.com', displayName: null };
    const code = new URL(
      await oauth.allow(checked.request, person, {
        orgSlug: 'marketing', accountRef: `user:spec-${run}`, agentName: null, orderPolicy: 'approve_each', perOrderLimitCents: 2500, monthlyLimitCents: null, validUntil: null,
      }),
    ).searchParams.get('code')!;

    const exchanged = await oauth.token({ grant_type: 'authorization_code', code, code_verifier: verifier });
    if (!exchanged.ok) throw new Error(exchanged.error_description);
    const key = exchanged.body.access_token as string;
    const grant = await store.resolve(key);
    expect(grant).toMatchObject({ kind: 'oauth', orgSlug: 'marketing', accountLabel: 'spec@example.com', perOrderLimitCents: 2500, revokedAt: null });
    expect(await oauth.token({ grant_type: 'authorization_code', code, code_verifier: verifier })).toMatchObject({ ok: false, error: 'invalid_grant' });

    const refreshed = await oauth.token({ grant_type: 'refresh_token', refresh_token: exchanged.body.refresh_token as string });
    if (!refreshed.ok) throw new Error(refreshed.error_description);
    // The old key stops working; the new one acts for the same grant.
    expect(await store.resolve(key)).toBeNull();
    expect((await store.resolve(refreshed.body.access_token as string))?.id).toBe(grant!.id);

    await store.revoke(grant!.id, 'marketing');
    expect(await oauth.token({ grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token as string })).toMatchObject({ ok: false, error: 'invalid_grant' });
  });
});
