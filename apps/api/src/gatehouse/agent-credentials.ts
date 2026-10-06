import { createHash, randomBytes } from 'node:crypto';

/**
 * Agent keys: the credential an outside agent uses when it cannot sign with a
 * registered key (ChatGPT, Codex, Claude, a buyer's own script). A grant is
 * one agent acting for one of the company's customer accounts, with what it
 * may do about orders.
 *
 * Logging in and authentication belong to the company's database, so where
 * grants are kept is pluggable: AGENT_CREDENTIALS. Enterprise provides a store
 * in its own database (PlatformAgentCredentials); a client copy with a
 * separate company database provides one over the grants it keeps there.
 */
export const AGENT_CREDENTIALS = Symbol('AGENT_CREDENTIALS');

export type OrderPolicy = 'none' | 'approve_each' | 'auto_within_limits';
export const ORDER_POLICIES: OrderPolicy[] = ['none', 'approve_each', 'auto_within_limits'];

export interface AgentGrant {
  /** The grant's id in its store; tasks name it as their grant_ref. */
  id: string;
  orgSlug: string;
  agentName: string;
  /** The customer account the agent acts for, in the company's own records. */
  accountRef: string;
  accountLabel: string;
  kind: 'api_key' | 'oauth';
  /** The key's first characters, to recognise it by; never the key. */
  tokenPrefix: string;
  orderPolicy: OrderPolicy;
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  rateLimitPerMinute: number;
  validUntil: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface NewAgentGrant {
  orgSlug: string;
  agentName: string;
  accountRef: string;
  accountLabel: string;
  orderPolicy: OrderPolicy;
  perOrderLimitCents: number | null;
  monthlyLimitCents: number | null;
  validUntil: string | null;
  createdBy: string;
}

export interface AgentCredentialStore {
  /** The grant a presented key belongs to (revoked or expired ones too, so the caller can be told); null for a key nobody issued. */
  resolve(key: string): Promise<AgentGrant | null>;
  /** Count one call against the grant's rate limit; false when it is over. */
  admitCall(grant: AgentGrant): Promise<boolean>;
  /** A new grant and its key, which is shown once and never stored. */
  issue(input: NewAgentGrant): Promise<{ grant: AgentGrant; key: string }>;
  list(orgSlug: string): Promise<AgentGrant[]>;
  /** Revoke one of the org's grants; null when it has none by that id. */
  revoke(id: string, orgSlug: string): Promise<AgentGrant | null>;

  // ---- "Log in with <company>" (OAuth 2.1): apps, one-time codes, refresh ----
  registerClient(client: Omit<OAuthClient, 'createdAt'>): Promise<OAuthClient>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  /** A grant for an app, after the person allowed it; it has no usable key until mint(). */
  issueOAuthGrant(input: NewAgentGrant & { clientId: string }): Promise<AgentGrant>;
  saveCode(code: OAuthCode): Promise<void>;
  /** Claim a code once: the unused, unexpired code with this hash, now marked used; null otherwise. */
  claimCode(codeHash: string): Promise<OAuthCode | null>;
  /** New agent key and refresh token for an active grant (the old ones stop working); null when it was revoked or expired. */
  mint(grantId: string): Promise<{ grant: AgentGrant; key: string; refreshToken: string } | null>;
  /** The grant a refresh token belongs to (any state); null for one nobody issued. */
  byRefreshToken(refreshToken: string): Promise<(AgentGrant & { oauthClientId: string | null }) | null>;
}

/** An app that registered itself to get agent keys through "Log in with <company>". */
export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  clientUri: string | null;
  createdAt: string;
}

/** A one-time authorization code, as stored: by its hash. */
export interface OAuthCode {
  codeHash: string;
  clientId: string;
  grantId: string;
  redirectUri: string;
  codeChallenge: string;
}

/** Why a key was not accepted, or null when it may call now. */
export function grantProblem(grant: AgentGrant, now = new Date()): string | null {
  if (grant.revokedAt) return 'This agent key was revoked';
  if (grant.validUntil && Date.parse(grant.validUntil) <= now.getTime()) return 'This agent key has expired';
  return null;
}

/**
 * An agent key is opaque (no dots); a registered caller's token is a JWT
 * (three dot-separated parts). That is how the Gatehouse tells them apart.
 */
export const isAgentKey = (bearer: string): boolean => !bearer.includes('.');

export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');
export const newAgentKey = (): string => `oak_${randomBytes(32).toString('base64url')}`;
export const newRefreshToken = (): string => `oar_${randomBytes(32).toString('base64url')}`;

/** What travels with every call an agent key makes, for the work it starts (the order workflow enforces the limits). */
export function agentKeyMetadata(grant: AgentGrant) {
  return {
    grantRef: grant.id,
    agentName: grant.agentName,
    accountRef: grant.accountRef,
    accountLabel: grant.accountLabel,
    orderPolicy: grant.orderPolicy,
    perOrderLimitCents: grant.perOrderLimitCents,
    monthlyLimitCents: grant.monthlyLimitCents,
  };
}
