import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

export interface MailboxWatch {
  id: string;
  org_slug: string;
  provider: 'gmail';
  mailbox: string;
  credential_key: string;
  query: string;
  schedule: string;
  event: string;
  /** Read each stored attachment's text into the event. */
  extract_text: boolean;
  enabled: boolean;
  checked_after: string;
  last_polled_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
}

export type NewMailboxWatch = Pick<MailboxWatch, 'org_slug' | 'provider' | 'mailbox' | 'credential_key' | 'query' | 'schedule' | 'event' | 'extract_text' | 'created_by'>;

const TABLE = ['ambient', 'mailbox_watches'] as const;

function time(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toWatch(row: Record<string, unknown>): MailboxWatch {
  return {
    ...(row as unknown as MailboxWatch),
    checked_after: time(row.checked_after)!,
    last_polled_at: time(row.last_polled_at),
    created_at: time(row.created_at)!,
  };
}

/** ambient.mailbox_watches: every read and write scoped by organization, except the watcher's own. */
@Injectable()
export class MailboxWatchesRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async listEnabled(): Promise<MailboxWatch[]> {
    const { data, error } = await this.db.from(...TABLE).select('*').eq('enabled', true);
    if (error) throw new Error(`Failed to read mailbox watches: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toWatch);
  }

  async list(orgSlug: string): Promise<MailboxWatch[]> {
    const { data, error } = await this.db.from(...TABLE).select('*').eq('org_slug', orgSlug).order('created_at');
    if (error) throw new Error(`Failed to read the mailbox watches of ${orgSlug}: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toWatch);
  }

  async get(orgSlug: string, id: string): Promise<MailboxWatch | null> {
    const { data, error } = await this.db.from(...TABLE).select('*').eq('id', id).eq('org_slug', orgSlug);
    if (error) throw new Error(`Failed to read mailbox watch ${id}: ${error.message}`);
    const row = ((data ?? []) as Record<string, unknown>[])[0];
    return row ? toWatch(row) : null;
  }

  async create(watch: NewMailboxWatch): Promise<MailboxWatch> {
    const { data, error } = await this.db.from(...TABLE).insert(watch).select('*');
    if (error) {
      if (error.code === '23505') throw new Error(`${watch.mailbox} is already watched for ${watch.event} with that query`);
      throw new Error(`Failed to create the mailbox watch: ${error.message}`);
    }
    return toWatch(((data ?? []) as Record<string, unknown>[])[0]!);
  }

  async delete(orgSlug: string, id: string): Promise<boolean> {
    const { data, error } = await this.db.from(...TABLE).delete().eq('id', id).eq('org_slug', orgSlug).select('id');
    if (error) throw new Error(`Failed to delete mailbox watch ${id}: ${error.message}`);
    return Array.isArray(data) && data.length > 0;
  }

  /** Messages received at or before `checkedAfter` are handled. Never moves back. */
  async advance(id: string, checkedAfter: Date): Promise<void> {
    const { error } = await this.db
      .from(...TABLE)
      .update({ checked_after: checkedAfter.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .lt('checked_after', checkedAfter.toISOString());
    if (error) throw new Error(`Failed to advance mailbox watch ${id}: ${error.message}`);
  }

  async recordPoll(id: string, failure: string | null): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db.from(...TABLE).update({ last_polled_at: now, last_error: failure, updated_at: now }).eq('id', id);
    if (error) throw new Error(`Failed to record the poll of mailbox watch ${id}: ${error.message}`);
  }
}
