import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

const SCHEMA = 'gatehouse';
const KINDS = ['call', 'reply'] as const;
const STATES = ['sending', 'answered', 'failed'] as const;

export type OutboundKind = (typeof KINDS)[number];
export type OutboundState = (typeof STATES)[number];

/** Which of our A2A agents makes a call, and why. */
export interface OutboundFrom {
  orgSlug: string;
  agentSlug: string;
  kind: OutboundKind;
  /** The caller a reply goes to. */
  callerId?: string;
}

export interface OutboundCall {
  id: string;
  orgSlug: string;
  agentSlug: string;
  kind: OutboundKind;
  remoteCardUrl: string;
  remoteName: string | null;
  callerId: string | null;
  contextId: string | null;
  state: OutboundState;
  remoteState: string | null;
  remoteTaskId: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export type OutboundFinish =
  | { state: 'answered'; remoteName: string; remoteState: string; remoteTaskId?: string; durationMs: number }
  | { state: 'failed'; remoteName?: string; error: string; durationMs: number };

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function toCall(row: Record<string, unknown>): OutboundCall {
  const kind = row.kind as OutboundKind;
  const state = row.state as OutboundState;
  if (!KINDS.includes(kind)) throw new Error(`gatehouse.outbound_calls.kind "${String(row.kind)}" is not a kind`);
  if (!STATES.includes(state)) throw new Error(`gatehouse.outbound_calls.state "${String(row.state)}" is not a state`);
  return {
    id: String(row.id),
    orgSlug: String(row.org_slug),
    agentSlug: String(row.agent_slug),
    kind,
    remoteCardUrl: String(row.remote_card_url),
    remoteName: text(row.remote_name),
    callerId: text(row.caller_id),
    contextId: text(row.context_id),
    state,
    remoteState: text(row.remote_state),
    remoteTaskId: text(row.remote_task_id),
    error: text(row.error),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    createdAt: new Date(String(row.created_at)).toISOString(),
    finishedAt: row.finished_at === null ? null : new Date(String(row.finished_at)).toISOString(),
  };
}

/** gatehouse.outbound_calls: every SendMessage the Gatehouse makes. */
@Injectable()
export class OutboundCallsRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async start(from: OutboundFrom, remoteCardUrl: string, contextId: string | undefined): Promise<string> {
    const { data, error } = await this.db
      .from(SCHEMA, 'outbound_calls')
      .insert({
        org_slug: from.orgSlug,
        agent_slug: from.agentSlug,
        kind: from.kind,
        remote_card_url: remoteCardUrl,
        caller_id: from.callerId ?? null,
        context_id: contextId ?? null,
        state: 'sending',
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to record an outbound A2A call: ${error.message}`);
    return String((data as { id: unknown }).id);
  }

  async finish(id: string, outcome: OutboundFinish): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'outbound_calls')
      .update({
        state: outcome.state,
        remote_name: outcome.remoteName ?? null,
        ...(outcome.state === 'answered'
          ? { remote_state: outcome.remoteState, remote_task_id: outcome.remoteTaskId ?? null }
          : { error: outcome.error }),
        duration_ms: outcome.durationMs,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`Failed to record the outcome of outbound A2A call ${id}: ${error.message}`);
  }

  /** Newest first; every org when orgSlug is '*'. */
  async list(orgSlug: string, limit: number): Promise<OutboundCall[]> {
    let query = this.db.from(SCHEMA, 'outbound_calls').select('*');
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(`Failed to list outbound A2A calls: ${error.message}`);
    return (data as Record<string, unknown>[]).map(toCall);
  }

  /** Whether any call was a reply to this caller. */
  async anyForCaller(callerId: string): Promise<boolean> {
    const { data, error } = await this.db.from(SCHEMA, 'outbound_calls').select('id').eq('caller_id', callerId).limit(1);
    if (error) throw new Error(`Failed to read outbound A2A calls: ${error.message}`);
    return (data as unknown[]).length > 0;
  }
}
