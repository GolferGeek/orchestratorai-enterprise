import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;

export interface CompetitorSource {
  id: string;
  competitor: string;
  page: string;
  url: string;
  enabled: boolean;
}

export interface Snapshot {
  id: string;
  capturedFrom: 'live' | 'archive';
  archivedAt: string | null;
  text: string;
  fetchedAt: string;
}

const toSource = (r: Row): CompetitorSource => ({
  id: String(r.id),
  competitor: String(r.competitor),
  page: String(r.page),
  url: String(r.url),
  enabled: r.enabled === true,
});
const time = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

/** The pages an org follows and what each said at every fetch. */
@Injectable()
export class SourcesStoreService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async list(organizationSlug: string): Promise<CompetitorSource[]> {
    const { data, error } = await this.db.from('marketing', 'competitor_sources').select('*').eq('organization_slug', organizationSlug).order('created_at');
    if (error) throw new Error(`Failed to read competitor sources: ${error.message}`);
    return (data as Row[]).map(toSource);
  }

  async add(organizationSlug: string, source: { competitor: string; page: string; url: string; enabled: boolean }, userId: string): Promise<CompetitorSource> {
    const { data, error } = await this.db
      .from('marketing', 'competitor_sources')
      .insert({ organization_slug: organizationSlug, ...source, created_by: userId })
      .select('*');
    if (error) throw new Error(`Failed to add the source: ${error.message}`);
    return toSource((data as Row[])[0]!);
  }

  async update(organizationSlug: string, id: string, source: { competitor: string; page: string; url: string; enabled: boolean }): Promise<CompetitorSource | null> {
    const { data, error } = await this.db.from('marketing', 'competitor_sources').update(source).eq('organization_slug', organizationSlug).eq('id', id).select('*');
    if (error) throw new Error(`Failed to update the source: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? toSource(row) : null;
  }

  async remove(organizationSlug: string, id: string): Promise<boolean> {
    const { data, error } = await this.db.from('marketing', 'competitor_sources').delete().eq('organization_slug', organizationSlug).eq('id', id).select('id');
    if (error) throw new Error(`Failed to remove the source: ${error.message}`);
    return (data as Row[]).length > 0;
  }

  /** The newest live snapshot taken by another run, if any. */
  async lastLive(sourceId: string, excludeRunId: string): Promise<Snapshot | null> {
    const { data, error } = await this.db
      .from('marketing', 'competitor_snapshots')
      .select('*')
      .eq('source_id', sourceId)
      .eq('captured_from', 'live')
      .order('fetched_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`Failed to read snapshots: ${error.message}`);
    const row = (data as Row[]).find((r) => r.run_id !== excludeRunId);
    return row ? this.toSnapshot(row) : null;
  }

  async save(
    organizationSlug: string,
    sourceId: string,
    runId: string,
    snapshot: { capturedFrom: 'live' | 'archive'; archivedAt: string | null; text: string },
  ): Promise<Snapshot> {
    const { data, error } = await this.db
      .from('marketing', 'competitor_snapshots')
      .insert({
        source_id: sourceId,
        organization_slug: organizationSlug,
        run_id: runId,
        captured_from: snapshot.capturedFrom,
        archived_at: snapshot.archivedAt,
        content_hash: createHash('sha256').update(snapshot.text).digest('hex'),
        text: snapshot.text,
      })
      .select('*');
    if (error) throw new Error(`Failed to store the snapshot: ${error.message}`);
    return this.toSnapshot((data as Row[])[0]!);
  }

  private toSnapshot(r: Row): Snapshot {
    return {
      id: String(r.id),
      capturedFrom: r.captured_from as Snapshot['capturedFrom'],
      archivedAt: r.archived_at ? time(r.archived_at) : null,
      text: String(r.text),
      fetchedAt: time(r.fetched_at),
    };
  }
}
