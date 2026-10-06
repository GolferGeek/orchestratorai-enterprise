import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AGENT_CREDENTIALS, hashKey, type AgentCredentialStore, type NewAgentGrant, type OAuthClient } from './agent-credentials';
import { CUSTOMER_ACCOUNTS, type CustomerAccountDirectory, type SignedInPerson } from './customer-accounts';

/**
 * "Log in with <company>": a small OAuth 2.1 authorization server for outside
 * agents (ChatGPT, Claude, Codex), per the MCP authorization spec. Ported from
 * neuromics.com's src/lib/agent/oauth.ts.
 *
 *   <base>/gatehouse/oauth/metadata   RFC 8414 (also served at /.well-known/oauth-authorization-server)
 *   <base>/gatehouse/oauth/register   RFC 7591: dynamic registration, public clients with PKCE only
 *   <base>/gatehouse/oauth/authorize  the person signs in (auth plane), picks the account and limits, consents
 *   <base>/gatehouse/oauth/token      code (+ PKCE S256) or refresh token → agent key
 *
 * What the app gets is an ordinary agent key (agent_grants, kind 'oauth'): the
 * account, its ordering limits and revoking all apply, exactly as for a key
 * staff issue.
 */
export const OAUTH_SCOPE = 'agent';

export type AuthorizeRequest = { client: OAuthClient; redirectUri: string; codeChallenge: string; state: string | null };
export type AuthorizeCheck = { ok: true; request: AuthorizeRequest } | { ok: false; show: string } | { ok: false; redirect: string };
type TokenOk = { ok: true; body: Record<string, unknown> };
type TokenError = { ok: false; status: number; error: string; error_description: string };

/** What the person chose on the consent page. */
export interface Consent {
  orgSlug: string;
  accountRef: string;
  agentName: string | null;
  orderPolicy: NewAgentGrant['orderPolicy'];
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  validUntil: string | null;
}

/** OAuth metadata (RFC 8414) for an authorization server at `base` (…/api). */
export function authorizationServerMetadata(base: string) {
  const o = `${base}/gatehouse/oauth`;
  return {
    issuer: o,
    authorization_endpoint: `${o}/authorize`,
    token_endpoint: `${o}/token`,
    registration_endpoint: `${o}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
  };
}

/** Protected resource metadata (RFC 9728) for one of our endpoints. */
export function protectedResourceMetadata(base: string, resource: string, name: string) {
  return {
    resource,
    authorization_servers: [`${base}/gatehouse/oauth`],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: name,
  };
}

/** Redirects must be exact, complete URLs: https anywhere, or http on this machine (desktop and CLI clients). */
export function redirectAllowed(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

const fail = (error: string, error_description: string, status = 400): TokenError => ({ ok: false, status, error, error_description });

@Injectable()
export class GatehouseOAuthService {
  constructor(
    @Inject(AGENT_CREDENTIALS) private readonly credentials: AgentCredentialStore,
    @Inject(CUSTOMER_ACCOUNTS) private readonly accounts: CustomerAccountDirectory,
  ) {}

  async register(body: unknown): Promise<{ ok: true; client: Record<string, unknown> } | { ok: false; error: string; error_description: string }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every(redirectAllowed)) {
      return { ok: false, error: 'invalid_redirect_uri', error_description: 'redirect_uris must be 1 to 10 complete https URLs (or http on localhost).' };
    }
    if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== 'none') {
      return { ok: false, error: 'invalid_client_metadata', error_description: "Only public clients (token_endpoint_auth_method 'none', with PKCE) are supported." };
    }
    const clientName = (typeof b.client_name === 'string' ? b.client_name.trim().slice(0, 80) : '') || 'An AI agent';
    const clientUri = typeof b.client_uri === 'string' && b.client_uri.startsWith('https://') ? b.client_uri : null;
    const client = await this.credentials.registerClient({
      clientId: `oac_${randomBytes(16).toString('base64url')}`,
      clientName,
      redirectUris: uris,
      clientUri,
    });
    return {
      ok: true,
      client: {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: OAUTH_SCOPE,
      },
    };
  }

  /**
   * Check an authorization request. Problems with the client or its redirect
   * are shown on our page (never redirected, per OAuth); the rest go back to
   * the client's redirect URI.
   */
  async check(query: Record<string, string | undefined>): Promise<AuthorizeCheck> {
    const client = query.client_id ? await this.credentials.getClient(query.client_id) : null;
    if (!client) return { ok: false, show: 'This app is not registered. Connect again from your AI app.' };
    const redirectUri = query.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0]! : '');
    if (!client.redirectUris.includes(redirectUri)) return { ok: false, show: "This app's return address doesn't match what it registered." };
    const back = (error: string, description: string): AuthorizeCheck => ({ ok: false, redirect: withParams(redirectUri, { error, error_description: description, state: query.state }) });
    if (query.response_type !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
    if (!query.code_challenge || query.code_challenge_method !== 'S256') return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(query.code_challenge)) return back('invalid_request', 'code_challenge must be a base64url S256 challenge.');
    return { ok: true, request: { client, redirectUri, codeChallenge: query.code_challenge, state: query.state ?? null } };
  }

  accountsFor(person: SignedInPerson, orgSlug: string) {
    return this.accounts.accountsFor(person, orgSlug);
  }

  /** The person allowed it: a grant on the account they chose, and a one-time code for the app. */
  async allow(request: AuthorizeRequest, person: SignedInPerson, consent: Consent): Promise<string> {
    const account = (await this.accounts.accountsFor(person, consent.orgSlug)).find((a) => a.ref === consent.accountRef);
    if (!account) throw new Error(`You cannot let an agent act for account ${consent.accountRef} in ${consent.orgSlug}`);
    const grant = await this.credentials.issueOAuthGrant({
      orgSlug: consent.orgSlug,
      agentName: consent.agentName ?? request.client.clientName,
      accountRef: account.ref,
      accountLabel: account.label,
      orderPolicy: consent.orderPolicy,
      perOrderLimitCents: consent.perOrderLimitCents,
      monthlyLimitCents: consent.monthlyLimitCents,
      validUntil: consent.validUntil,
      createdBy: `oauth:${person.userId}`,
      clientId: request.client.clientId,
    });
    const code = `oaa_${randomBytes(32).toString('base64url')}`;
    await this.credentials.saveCode({
      codeHash: hashKey(code),
      clientId: request.client.clientId,
      grantId: grant.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
    });
    return withParams(request.redirectUri, { code, state: request.state ?? undefined });
  }

  deny(request: AuthorizeRequest): string {
    return withParams(request.redirectUri, { error: 'access_denied', error_description: 'The person declined.', state: request.state ?? undefined });
  }

  async token(params: Record<string, string | undefined>): Promise<TokenOk | TokenError> {
    if (params.grant_type === 'authorization_code') {
      const { code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId } = params;
      if (!code || !verifier) return fail('invalid_request', 'code and code_verifier are required.');
      // Single use: claim the code before anything else.
      const claimed = await this.credentials.claimCode(hashKey(code));
      if (!claimed) return fail('invalid_grant', 'The code is invalid, used or expired.');
      if (clientId && clientId !== claimed.clientId) return fail('invalid_grant', 'The code was issued to another client.');
      if (redirectUri && redirectUri !== claimed.redirectUri) return fail('invalid_grant', "redirect_uri doesn't match.");
      if (createHash('sha256').update(verifier).digest('base64url') !== claimed.codeChallenge) return fail('invalid_grant', 'PKCE verification failed.');
      return this.tokenBody(claimed.grantId);
    }
    if (params.grant_type === 'refresh_token') {
      const grant = params.refresh_token ? await this.credentials.byRefreshToken(params.refresh_token) : null;
      if (!grant || grant.revokedAt || (grant.validUntil && Date.parse(grant.validUntil) <= Date.now())) {
        return fail('invalid_grant', 'The refresh token is invalid, or the connection was revoked or expired.');
      }
      if (params.client_id && params.client_id !== grant.oauthClientId) return fail('invalid_grant', 'The refresh token belongs to another client.');
      return this.tokenBody(grant.id);
    }
    return fail('unsupported_grant_type', 'Use authorization_code or refresh_token.');
  }

  private async tokenBody(grantId: string): Promise<TokenOk | TokenError> {
    const minted = await this.credentials.mint(grantId);
    if (!minted) return fail('invalid_grant', 'The connection was revoked or expired.');
    const until = minted.grant.validUntil ? Date.parse(minted.grant.validUntil) : Date.now() + 365 * 86_400_000;
    return {
      ok: true,
      body: {
        access_token: minted.key,
        token_type: 'Bearer',
        expires_in: Math.max(60, Math.floor((until - Date.now()) / 1000)),
        refresh_token: minted.refreshToken,
        scope: OAUTH_SCOPE,
      },
    };
  }
}

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}
