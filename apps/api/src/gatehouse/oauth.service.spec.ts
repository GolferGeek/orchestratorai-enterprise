import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { AgentCredentialStore, AgentGrant, OAuthClient, OAuthCode } from './agent-credentials';
import { SelfAsCustomerAccount } from './customer-accounts';
import { consentOf } from './oauth.controller';
import { GatehouseOAuthService, redirectAllowed } from './oauth.service';

/** The credential store's OAuth half, in memory. */
function memoryStore() {
  const clients = new Map<string, OAuthClient>();
  const codes = new Map<string, OAuthCode & { used: boolean }>();
  const grants = new Map<string, AgentGrant & { refresh?: string; oauthClientId: string | null }>();
  const store: Partial<AgentCredentialStore> = {
    registerClient: async (c) => {
      const client = { ...c, createdAt: new Date().toISOString() };
      clients.set(c.clientId, client);
      return client;
    },
    getClient: async (id) => clients.get(id) ?? null,
    issueOAuthGrant: async (input) => {
      const grant = {
        id: `g${grants.size + 1}`, orgSlug: input.orgSlug, agentName: input.agentName, accountRef: input.accountRef, accountLabel: input.accountLabel,
        kind: 'oauth' as const, tokenPrefix: 'oak_pending', orderPolicy: input.orderPolicy, perOrderLimitCents: input.perOrderLimitCents,
        monthlyLimitCents: input.monthlyLimitCents, rateLimitPerMinute: 60, validUntil: input.validUntil, revokedAt: null, lastUsedAt: null,
        createdBy: input.createdBy, createdAt: new Date().toISOString(), oauthClientId: input.clientId,
      };
      grants.set(grant.id, grant);
      return grant;
    },
    saveCode: async (code) => void codes.set(code.codeHash, { ...code, used: false }),
    claimCode: async (hash) => {
      const code = codes.get(hash);
      if (!code || code.used) return null;
      code.used = true;
      return code;
    },
    mint: async (id) => {
      const grant = grants.get(id);
      if (!grant || grant.revokedAt) return null;
      const key = `oak_${randomBytes(8).toString('hex')}`;
      const refreshToken = `oar_${randomBytes(8).toString('hex')}`;
      grant.refresh = refreshToken;
      return { grant, key, refreshToken };
    },
    byRefreshToken: async (token) => [...grants.values()].find((g) => g.refresh === token) ?? null,
  };
  return { store: store as AgentCredentialStore, grants };
}

const person = { userId: 'u1', email: 'pat@acme.example', displayName: 'Pat' };
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

async function registered() {
  const { store, grants } = memoryStore();
  const oauth = new GatehouseOAuthService(store, new SelfAsCustomerAccount());
  const result = await oauth.register({ client_name: 'ChatGPT', redirect_uris: ['https://chat.example/callback'] });
  if (!result.ok) throw new Error('registration failed');
  const clientId = result.client.client_id as string;
  const query = { client_id: clientId, redirect_uri: 'https://chat.example/callback', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1' };
  return { oauth, clientId, query, grants };
}

describe('Log in with <company> (OAuth 2.1)', () => {
  it('registers public clients with exact https (or localhost) redirects only', async () => {
    const { oauth } = await registered();
    expect(await oauth.register({ redirect_uris: ['http://evil.example/cb'] })).toMatchObject({ ok: false, error: 'invalid_redirect_uri' });
    expect(await oauth.register({ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'client_secret_basic' })).toMatchObject({ ok: false, error: 'invalid_client_metadata' });
    expect(redirectAllowed('http://127.0.0.1:3000/cb')).toBe(true);
    expect(redirectAllowed('https://a.example/cb#frag')).toBe(false);
  });

  it('shows problems with the app on our page, and sends the rest back to it', async () => {
    const { oauth, query } = await registered();
    expect(await oauth.check({ ...query, client_id: 'nobody' })).toEqual({ ok: false, show: 'This app is not registered. Connect again from your AI app.' });
    expect(await oauth.check({ ...query, redirect_uri: 'https://elsewhere.example/cb' })).toMatchObject({ ok: false, show: expect.stringContaining("return address") });
    const noPkce = await oauth.check({ ...query, code_challenge_method: 'plain' });
    expect('redirect' in noPkce && noPkce.redirect).toContain('error=invalid_request');
    expect('redirect' in noPkce && noPkce.redirect).toContain('state=s1');
  });

  it('gives the app a one-time code for the account the person chose, then an agent key and refresh token for it (PKCE)', async () => {
    const { oauth, clientId, query, grants } = await registered();
    const checked = await oauth.check(query);
    if (!checked.ok) throw new Error('check failed');
    const accounts = await oauth.accountsFor(person, 'marketing');
    expect(accounts).toEqual([{ ref: 'user:u1', label: 'Pat' }]);
    const redirect = new URL(
      await oauth.allow(checked.request, person, {
        orgSlug: 'marketing', accountRef: 'user:u1', agentName: null, orderPolicy: 'approve_each', perOrderLimitCents: 50_000, monthlyLimitCents: null, validUntil: null,
      }),
    );
    expect(redirect.searchParams.get('state')).toBe('s1');
    const code = redirect.searchParams.get('code')!;
    expect([...grants.values()][0]).toMatchObject({ agentName: 'ChatGPT', accountLabel: 'Pat', perOrderLimitCents: 50_000, createdBy: 'oauth:u1' });

    expect(await oauth.token({ grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier', client_id: clientId })).toMatchObject({ ok: false, error: 'invalid_grant' });
    // The code was claimed by that failed attempt: single use, even when the verifier was wrong.
    expect(await oauth.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId })).toMatchObject({ ok: false, error: 'invalid_grant' });
  });

  it('exchanges a code once, and refreshes', async () => {
    const { oauth, clientId, query } = await registered();
    const checked = await oauth.check(query);
    if (!checked.ok) throw new Error('check failed');
    const code = new URL(
      await oauth.allow(checked.request, person, { orgSlug: 'marketing', accountRef: 'user:u1', agentName: null, orderPolicy: 'none', perOrderLimitCents: null, monthlyLimitCents: null, validUntil: null }),
    ).searchParams.get('code')!;
    const first = await oauth.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: query.redirect_uri });
    expect(first).toMatchObject({ ok: true, body: { token_type: 'Bearer', scope: 'agent', access_token: expect.stringMatching(/^oak_/), refresh_token: expect.stringMatching(/^oar_/) } });
    expect(await oauth.token({ grant_type: 'authorization_code', code, code_verifier: verifier })).toMatchObject({ ok: false, error: 'invalid_grant' });
    if (!first.ok) throw new Error('exchange failed');
    const refresh = first.body.refresh_token as string;
    expect(await oauth.token({ grant_type: 'refresh_token', refresh_token: refresh, client_id: 'someone-else' })).toMatchObject({ ok: false, error: 'invalid_grant' });
    expect(await oauth.token({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId })).toMatchObject({ ok: true });
    expect(await oauth.token({ grant_type: 'password' })).toMatchObject({ ok: false, error: 'unsupported_grant_type' });
  });

  it('refuses an account the person may not act for', async () => {
    const { oauth, query } = await registered();
    const checked = await oauth.check(query);
    if (!checked.ok) throw new Error('check failed');
    await expect(
      oauth.allow(checked.request, person, { orgSlug: 'marketing', accountRef: 'user:someone-else', agentName: null, orderPolicy: 'none', perOrderLimitCents: null, monthlyLimitCents: null, validUntil: null }),
    ).rejects.toThrow('cannot let an agent act for account user:someone-else');
  });

  it('checks what the person chose', () => {
    expect(consentOf({ orgSlug: 'marketing', accountRef: 'user:u1', perOrderLimitCents: 100, validDays: 7 })).toMatchObject({ orderPolicy: 'approve_each', perOrderLimitCents: 100 });
    expect(() => consentOf({ orgSlug: 'marketing', accountRef: 'user:u1', orderPolicy: 'auto_within_limits' })).toThrow(BadRequestException);
    expect(() => consentOf({ accountRef: 'user:u1' })).toThrow('orgSlug is required');
  });
});
