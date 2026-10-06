import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import { randomBytes } from 'node:crypto';
import {
  hashKey,
  newAgentKey,
  newRefreshToken,
  ORDER_POLICIES,
  type AgentCredentialStore,
  type AgentGrant,
  type NewAgentGrant,
  type OAuthClient,
  type OAuthCode,
  type OrderPolicy,
} from './agent-credentials';

const SCHEMA = 'gatehouse';

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toClient(row: Record<string, unknown>): OAuthClient {
  return {
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    redirectUris: (row.redirect_uris as unknown[]).map(String),
    clientUri: text(row.client_uri),
    createdAt: String(row.created_at),
  };
}

function toGrant(row: Record<string, unknown>): AgentGrant {
  const kind = row.kind;
  if (kind !== 'api_key' && kind !== 'oauth') throw new Error(`gatehouse.agent_grants.kind "${String(kind)}" is not a kind`);
  const orderPolicy = row.order_policy as OrderPolicy;
  if (!ORDER_POLICIES.includes(orderPolicy)) throw new Error(`gatehouse.agent_grants.order_policy "${String(row.order_policy)}" is not a policy`);
  const cents = (value: unknown) => (value === null ? null : Number(value));
  return {
    id: String(row.id),
    orgSlug: String(row.org_slug),
    agentName: String(row.agent_name),
    accountRef: String(row.account_ref),
    accountLabel: String(row.account_label),
    kind,
    tokenPrefix: String(row.token_prefix),
    orderPolicy,
    perOrderLimitCents: cents(row.per_order_limit_cents),
    monthlyLimitCents: cents(row.monthly_limit_cents),
    rateLimitPerMinute: Number(row.rate_limit_per_minute),
    validUntil: text(row.valid_until),
    revokedAt: text(row.revoked_at),
    lastUsedAt: text(row.last_used_at),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

/**
 * The default agent-key store, in this deployment's own database
 * (gatehouse.agent_grants): for enterprise, whose one database is also its
 * company database. Keys are stored only as SHA-256 hashes.
 */
@Injectable()
export class PlatformAgentCredentials implements AgentCredentialStore {
  private lastPruned = 0;

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async resolve(key: string): Promise<AgentGrant | null> {
    const { data, error } = await this.db.from(SCHEMA, 'agent_grants').select('*').eq('token_hash', hashKey(key)).maybeSingle();
    if (error) throw new Error(`Failed to look up an agent key: ${error.message}`);
    return data ? toGrant(data as Record<string, unknown>) : null;
  }

  async admitCall(grant: AgentGrant): Promise<boolean> {
    const since = new Date(Date.now() - 60_000).toISOString();
    const counted = await this.db
      .from(SCHEMA, 'grant_calls')
      .select('grant_id', { count: 'exact', head: true })
      .eq('grant_id', grant.id)
      .gte('called_at', since);
    if (counted.error) throw new Error(`Failed to count calls for agent key ${grant.id}: ${counted.error.message}`);
    if (typeof counted.count !== 'number') throw new Error(`No call count for agent key ${grant.id}`);
    if (counted.count >= grant.rateLimitPerMinute) return false;

    const now = new Date().toISOString();
    const recorded = await this.db.from(SCHEMA, 'grant_calls').insert({ grant_id: grant.id, called_at: now });
    if (recorded.error) throw new Error(`Failed to record a call for agent key ${grant.id}: ${recorded.error.message}`);
    const touched = await this.db.from(SCHEMA, 'agent_grants').update({ last_used_at: now }).eq('id', grant.id);
    if (touched.error) throw new Error(`Failed to mark agent key ${grant.id} used: ${touched.error.message}`);
    if (Date.now() - this.lastPruned > 10 * 60_000) {
      this.lastPruned = Date.now();
      const pruned = await this.db
        .from(SCHEMA, 'grant_calls')
        .delete()
        .lt('called_at', new Date(Date.now() - 3_600_000).toISOString());
      if (pruned.error) throw new Error(`Failed to prune agent key calls: ${pruned.error.message}`);
    }
    return true;
  }

  async issue(input: NewAgentGrant): Promise<{ grant: AgentGrant; key: string }> {
    const key = newAgentKey();
    const { data, error } = await this.db
      .from(SCHEMA, 'agent_grants')
      .insert({
        org_slug: input.orgSlug,
        agent_name: input.agentName,
        account_ref: input.accountRef,
        account_label: input.accountLabel,
        kind: 'api_key',
        token_hash: hashKey(key),
        token_prefix: key.slice(0, 12),
        order_policy: input.orderPolicy,
        per_order_limit_cents: input.perOrderLimitCents,
        monthly_limit_cents: input.monthlyLimitCents,
        valid_until: input.validUntil,
        created_by: input.createdBy,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to issue an agent key: ${error.message}`);
    return { grant: toGrant(data as Record<string, unknown>), key };
  }

  async list(orgSlug: string): Promise<AgentGrant[]> {
    let query = this.db.from(SCHEMA, 'agent_grants').select('*');
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list agent keys: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toGrant);
  }

  async revoke(id: string, orgSlug: string): Promise<AgentGrant | null> {
    let query = this.db.from(SCHEMA, 'agent_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null);
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(`Failed to revoke agent key ${id}: ${error.message}`);
    return data ? toGrant(data as Record<string, unknown>) : null;
  }

  async registerClient(client: Omit<OAuthClient, 'createdAt'>): Promise<OAuthClient> {
    const { data, error } = await this.db
      .from(SCHEMA, 'oauth_clients')
      .insert({ client_id: client.clientId, client_name: client.clientName, redirect_uris: client.redirectUris, client_uri: client.clientUri })
      .select()
      .single();
    if (error) throw new Error(`Failed to register OAuth client: ${error.message}`);
    return toClient(data as Record<string, unknown>);
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const { data, error } = await this.db.from(SCHEMA, 'oauth_clients').select('*').eq('client_id', clientId).maybeSingle();
    if (error) throw new Error(`Failed to load OAuth client ${clientId}: ${error.message}`);
    return data ? toClient(data as Record<string, unknown>) : null;
  }

  async issueOAuthGrant(input: NewAgentGrant & { clientId: string }): Promise<AgentGrant> {
    // No one holds a key for it until the app exchanges its code (mint).
    const unusable = `oak_${randomBytes(32).toString('base64url')}`;
    const { data, error } = await this.db
      .from(SCHEMA, 'agent_grants')
      .insert({
        org_slug: input.orgSlug,
        agent_name: input.agentName,
        account_ref: input.accountRef,
        account_label: input.accountLabel,
        kind: 'oauth',
        oauth_client_id: input.clientId,
        token_hash: hashKey(unusable),
        token_prefix: 'oak_pending',
        order_policy: input.orderPolicy,
        per_order_limit_cents: input.perOrderLimitCents,
        monthly_limit_cents: input.monthlyLimitCents,
        valid_until: input.validUntil,
        created_by: input.createdBy,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to issue an OAuth grant: ${error.message}`);
    return toGrant(data as Record<string, unknown>);
  }

  async saveCode(code: OAuthCode): Promise<void> {
    const { error } = await this.db.from(SCHEMA, 'oauth_codes').insert({
      code_hash: code.codeHash,
      client_id: code.clientId,
      grant_id: code.grantId,
      redirect_uri: code.redirectUri,
      code_challenge: code.codeChallenge,
    });
    if (error) throw new Error(`Failed to save an authorization code: ${error.message}`);
  }

  async claimCode(codeHash: string): Promise<OAuthCode | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from(SCHEMA, 'oauth_codes')
      .update({ used_at: now })
      .eq('code_hash', codeHash)
      .is('used_at', null)
      .gt('expires_at', now)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to claim an authorization code: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      codeHash: String(row.code_hash),
      clientId: String(row.client_id),
      grantId: String(row.grant_id),
      redirectUri: String(row.redirect_uri),
      codeChallenge: String(row.code_challenge),
    };
  }

  async mint(grantId: string): Promise<{ grant: AgentGrant; key: string; refreshToken: string } | null> {
    const key = newAgentKey();
    const refreshToken = newRefreshToken();
    const { data, error } = await this.db
      .from(SCHEMA, 'agent_grants')
      .update({ token_hash: hashKey(key), token_prefix: key.slice(0, 12), refresh_token_hash: hashKey(refreshToken) })
      .eq('id', grantId)
      .is('revoked_at', null)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to mint a key for grant ${grantId}: ${error.message}`);
    if (!data) return null;
    const grant = toGrant(data as Record<string, unknown>);
    if (grant.validUntil && Date.parse(grant.validUntil) <= Date.now()) return null;
    if (grant.kind === 'oauth') {
      const row = data as Record<string, unknown>;
      const touched = await this.db.from(SCHEMA, 'oauth_clients').update({ last_used_at: new Date().toISOString() }).eq('client_id', String(row.oauth_client_id));
      if (touched.error) throw new Error(`Failed to mark OAuth client used: ${touched.error.message}`);
    }
    return { grant, key, refreshToken };
  }

  async byRefreshToken(refreshToken: string): Promise<(AgentGrant & { oauthClientId: string | null }) | null> {
    const { data, error } = await this.db.from(SCHEMA, 'agent_grants').select('*').eq('refresh_token_hash', hashKey(refreshToken)).maybeSingle();
    if (error) throw new Error(`Failed to look up a refresh token: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { ...toGrant(row), oauthClientId: text(row.oauth_client_id) };
  }
}
