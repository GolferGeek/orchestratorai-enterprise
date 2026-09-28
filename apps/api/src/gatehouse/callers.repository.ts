import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import type { JWK } from 'jose';

const SCHEMA = 'gatehouse';

export interface Caller {
  id: string;
  name: string;
  cardUrl: string;
  jwksUrl: string | null;
  jwks: { keys: JWK[] } | null;
  status: 'active' | 'suspended';
  rateLimitPerMinute: number;
  registeredBy: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export type NewCaller = Pick<Caller, 'name' | 'cardUrl' | 'jwksUrl' | 'jwks' | 'registeredBy'>;

function toCaller(row: Record<string, unknown>): Caller {
  const status = row.status;
  if (status !== 'active' && status !== 'suspended') throw new Error(`gatehouse.callers.status "${String(status)}" is not a status`);
  return {
    id: String(row.id),
    name: String(row.name),
    cardUrl: String(row.card_url),
    jwksUrl: row.jwks_url === null ? null : String(row.jwks_url),
    jwks: (row.jwks ?? null) as Caller['jwks'],
    status,
    rateLimitPerMinute: Number(row.rate_limit_per_minute),
    registeredBy: String(row.registered_by),
    createdAt: String(row.created_at),
    lastSeenAt: row.last_seen_at === null ? null : String(row.last_seen_at),
  };
}

@Injectable()
export class CallersRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async byCardUrl(cardUrl: string): Promise<Caller | null> {
    const { data, error } = await this.db.from(SCHEMA, 'callers').select('*').eq('card_url', cardUrl).maybeSingle();
    if (error) throw new Error(`Failed to load caller ${cardUrl}: ${error.message}`);
    return data ? toCaller(data as Record<string, unknown>) : null;
  }

  async list(): Promise<Caller[]> {
    const { data, error } = await this.db.from(SCHEMA, 'callers').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list callers: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toCaller);
  }

  /** A new caller, or its keys renewed; a suspended caller stays suspended. */
  async upsert(caller: NewCaller): Promise<Caller> {
    const { data, error } = await this.db
      .from(SCHEMA, 'callers')
      .upsert(
        { name: caller.name, card_url: caller.cardUrl, jwks_url: caller.jwksUrl, jwks: caller.jwks, registered_by: caller.registeredBy },
        { onConflict: 'card_url' },
      )
      .select()
      .single();
    if (error) throw new Error(`Failed to register caller ${caller.cardUrl}: ${error.message}`);
    return toCaller(data as Record<string, unknown>);
  }

  async setStatus(id: string, status: Caller['status']): Promise<Caller | null> {
    const { data, error } = await this.db.from(SCHEMA, 'callers').update({ status }).eq('id', id).select().maybeSingle();
    if (error) throw new Error(`Failed to set caller ${id} ${status}: ${error.message}`);
    return data ? toCaller(data as Record<string, unknown>) : null;
  }

  /** Record a token's jti; false when it was already used (a replay). */
  async claimToken(callerId: string, jti: string, expiresAt: Date): Promise<boolean> {
    const { error } = await this.db
      .from(SCHEMA, 'used_tokens')
      .insert({ caller_id: callerId, jti, expires_at: expiresAt.toISOString() });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(`Failed to record token for caller ${callerId}: ${error.message}`);
  }

  async requestsSince(callerId: string, since: Date): Promise<number> {
    const { count, error } = await this.db
      .from(SCHEMA, 'used_tokens')
      .select('jti', { count: 'exact', head: true })
      .eq('caller_id', callerId)
      .gte('used_at', since.toISOString());
    if (error) throw new Error(`Failed to count requests for caller ${callerId}: ${error.message}`);
    if (typeof count !== 'number') throw new Error(`No request count for caller ${callerId}`);
    return count;
  }

  async touch(callerId: string): Promise<void> {
    const { error } = await this.db.from(SCHEMA, 'callers').update({ last_seen_at: new Date().toISOString() }).eq('id', callerId);
    if (error) throw new Error(`Failed to update caller ${callerId}: ${error.message}`);
  }

  async pruneExpiredTokens(before: Date): Promise<void> {
    const { error } = await this.db.from(SCHEMA, 'used_tokens').delete().lt('expires_at', before.toISOString());
    if (error) throw new Error(`Failed to prune used tokens: ${error.message}`);
  }
}
