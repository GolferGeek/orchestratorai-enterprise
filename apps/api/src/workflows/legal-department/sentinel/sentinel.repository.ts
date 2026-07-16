/**
 * SentinelRepository — CRUD for the four sentinel tables:
 *   legal.sentinel_sources, legal.sentinel_signals,
 *   legal.sentinel_portfolio, legal.sentinel_alerts
 *
 * All reads/writes filter by org_slug.
 */
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import type {
  SentinelSource,
  SentinelSignal,
  SentinelPortfolioHolding,
  SentinelAlert,
  CreateSourceDto,
  UpdateSourceDto,
  CreatePortfolioDto,
  UpdatePortfolioDto,
  CreateSignalDto,
  CreateAlertDto,
  AlertStatus,
} from './sentinel.types';

const SCHEMA = 'legal';

@Injectable()
export class SentinelRepository {
  private readonly logger = new Logger(SentinelRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  // ── Sources ─────────────────────────────────────────────────────────────

  async listSources(orgSlug: string): Promise<SentinelSource[]> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_sources')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('created_at', { ascending: false })) as {
      data: SentinelSource[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`listSources failed: ${error.message}`);
    }
    return data ?? [];
  }

  async getSource(id: string, orgSlug: string): Promise<SentinelSource | null> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_sources')
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .maybeSingle()) as {
      data: SentinelSource | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`getSource(${id}) failed: ${error.message}`);
    }
    return data;
  }

  async createSource(
    orgSlug: string,
    dto: CreateSourceDto,
  ): Promise<SentinelSource> {
    // Use rawQuery because TEXT[] columns don't survive the PostgREST insert path.
    const sql = `
      INSERT INTO legal.sentinel_sources
        (org_slug, name, source_type, url, poll_interval_minutes, practice_areas, jurisdictions, enabled)
      VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8)
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      orgSlug,
      dto.name,
      dto.sourceType,
      dto.url,
      dto.pollIntervalMinutes ?? 60,
      dto.practiceAreas ?? [],
      dto.jurisdictions ?? [],
      dto.enabled ?? true,
    ])) as {
      data: SentinelSource[] | null;
      error: { message: string } | null;
    };
    if (error || !data || data.length === 0) {
      throw new Error(`createSource failed: ${error?.message ?? 'unknown'}`);
    }
    const created = data[0]!;
    this.logger.log(`Created source ${created.id} (org=${orgSlug})`);
    return created;
  }

  async updateSource(
    id: string,
    orgSlug: string,
    dto: UpdateSourceDto,
  ): Promise<SentinelSource> {
    const fields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.sourceType !== undefined) fields.source_type = dto.sourceType;
    if (dto.url !== undefined) fields.url = dto.url;
    if (dto.pollIntervalMinutes !== undefined)
      fields.poll_interval_minutes = dto.pollIntervalMinutes;
    if (dto.practiceAreas !== undefined)
      fields.practice_areas = dto.practiceAreas;
    if (dto.jurisdictions !== undefined)
      fields.jurisdictions = dto.jurisdictions;
    if (dto.enabled !== undefined) fields.enabled = dto.enabled;

    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_sources')
      .update(fields)
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .select('*')
      .single()) as {
      data: SentinelSource | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`updateSource(${id}) failed: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundException(`Source ${id} not found in org ${orgSlug}`);
    }
    return data;
  }

  async deleteSource(id: string, orgSlug: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'sentinel_sources')
      .delete()
      .eq('id', id)
      .eq('org_slug', orgSlug);
    if (error) {
      throw new Error(`deleteSource(${id}) failed: ${error.message}`);
    }
  }

  async updateSourcePolled(
    id: string,
    lastError: string | null,
  ): Promise<void> {
    const fields: Record<string, unknown> = {
      last_polled_at: new Date().toISOString(),
      last_error: lastError,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from(SCHEMA, 'sentinel_sources')
      .update(fields)
      .eq('id', id);
    if (error) {
      throw new Error(`updateSourcePolled(${id}) failed: ${error.message}`);
    }
  }

  // ── Signals ─────────────────────────────────────────────────────────────

  async listSignals(
    orgSlug: string,
    filters?: {
      sourceId?: string;
      signalType?: string;
      processed?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<SentinelSignal[]> {
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    let q = this.db
      .from(SCHEMA, 'sentinel_signals')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('ingested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.sourceId) q = q.eq('source_id', filters.sourceId);
    if (filters?.signalType) q = q.eq('signal_type', filters.signalType);
    if (filters?.processed !== undefined)
      q = q.eq('processed', filters.processed);

    const { data, error } = (await q) as {
      data: SentinelSignal[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`listSignals failed: ${error.message}`);
    }
    return data ?? [];
  }

  async createSignal(
    orgSlug: string,
    dto: CreateSignalDto,
  ): Promise<SentinelSignal> {
    const sql = `
      INSERT INTO legal.sentinel_signals
        (org_slug, source_id, title, summary, full_text, url, published_at,
         signal_type, jurisdictions, practice_areas, content_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::text[], $11)
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      orgSlug,
      dto.sourceId,
      dto.title,
      dto.summary ?? null,
      dto.fullText ?? null,
      dto.url ?? null,
      dto.publishedAt ?? null,
      dto.signalType ?? null,
      dto.jurisdictions ?? [],
      dto.practiceAreas ?? [],
      dto.contentHash,
    ])) as {
      data: SentinelSignal[] | null;
      error: { message: string } | null;
    };
    if (error || !data || data.length === 0) {
      throw new Error(`createSignal failed: ${error?.message ?? 'unknown'}`);
    }
    return data[0]!;
  }

  async createSignalsBatch(
    orgSlug: string,
    dtos: CreateSignalDto[],
  ): Promise<SentinelSignal[]> {
    if (dtos.length === 0) return [];
    const results: SentinelSignal[] = [];
    for (const dto of dtos) {
      results.push(await this.createSignal(orgSlug, dto));
    }
    return results;
  }

  async getExistingHashes(
    orgSlug: string,
    hashes: string[],
  ): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_signals')
      .select('content_hash')
      .eq('org_slug', orgSlug)
      .in('content_hash', hashes)) as {
      data: Array<{ content_hash: string }> | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`getExistingHashes failed: ${error.message}`);
    }
    return new Set((data ?? []).map((r) => r.content_hash));
  }

  async markSignalsProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from(SCHEMA, 'sentinel_signals')
      .update({ processed: true })
      .in('id', ids);
    if (error) {
      throw new Error(`markSignalsProcessed failed: ${error.message}`);
    }
  }

  // ── Portfolio ───────────────────────────────────────────────────────────

  async listPortfolio(
    orgSlug: string,
    filters?: { active?: boolean },
  ): Promise<SentinelPortfolioHolding[]> {
    let q = this.db
      .from(SCHEMA, 'sentinel_portfolio')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('created_at', { ascending: false });

    if (filters?.active !== undefined) q = q.eq('active', filters.active);

    const { data, error } = (await q) as {
      data: SentinelPortfolioHolding[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`listPortfolio failed: ${error.message}`);
    }
    return data ?? [];
  }

  async getPortfolioHolding(
    id: string,
    orgSlug: string,
  ): Promise<SentinelPortfolioHolding | null> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_portfolio')
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .maybeSingle()) as {
      data: SentinelPortfolioHolding | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`getPortfolioHolding(${id}) failed: ${error.message}`);
    }
    return data;
  }

  async createPortfolioHolding(
    orgSlug: string,
    dto: CreatePortfolioDto,
  ): Promise<SentinelPortfolioHolding> {
    const sql = `
      INSERT INTO legal.sentinel_portfolio
        (org_slug, client_name, matter_name, practice_areas, jurisdictions,
         key_entities, description, active)
      VALUES ($1, $2, $3, $4::text[], $5::text[], $6::text[], $7, true)
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      orgSlug,
      dto.clientName,
      dto.matterName ?? null,
      dto.practiceAreas ?? [],
      dto.jurisdictions ?? [],
      dto.keyEntities ?? [],
      dto.description ?? null,
    ])) as {
      data: SentinelPortfolioHolding[] | null;
      error: { message: string } | null;
    };
    if (error || !data || data.length === 0) {
      throw new Error(
        `createPortfolioHolding failed: ${error?.message ?? 'unknown'}`,
      );
    }
    const created = data[0]!;
    this.logger.log(`Created portfolio holding ${created.id} (org=${orgSlug})`);
    return created;
  }

  async updatePortfolioHolding(
    id: string,
    orgSlug: string,
    dto: UpdatePortfolioDto,
  ): Promise<SentinelPortfolioHolding> {
    const fields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.clientName !== undefined) fields.client_name = dto.clientName;
    if (dto.matterName !== undefined) fields.matter_name = dto.matterName;
    if (dto.practiceAreas !== undefined)
      fields.practice_areas = dto.practiceAreas;
    if (dto.jurisdictions !== undefined)
      fields.jurisdictions = dto.jurisdictions;
    if (dto.keyEntities !== undefined) fields.key_entities = dto.keyEntities;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.active !== undefined) fields.active = dto.active;

    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_portfolio')
      .update(fields)
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .select('*')
      .single()) as {
      data: SentinelPortfolioHolding | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`updatePortfolioHolding(${id}) failed: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundException(
        `Portfolio holding ${id} not found in org ${orgSlug}`,
      );
    }
    return data;
  }

  async deactivatePortfolioHolding(id: string, orgSlug: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, 'sentinel_portfolio')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_slug', orgSlug);
    if (error) {
      throw new Error(
        `deactivatePortfolioHolding(${id}) failed: ${error.message}`,
      );
    }
  }

  // ── Alerts ──────────────────────────────────────────────────────────────

  async listAlerts(
    orgSlug: string,
    filters?: {
      status?: AlertStatus;
      severity?: string;
      urgency?: string;
      portfolioId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<SentinelAlert[]> {
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    let q = this.db
      .from(SCHEMA, 'sentinel_alerts')
      .select('*')
      .eq('org_slug', orgSlug)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.severity) q = q.eq('severity', filters.severity);
    if (filters?.urgency) q = q.eq('urgency', filters.urgency);
    if (filters?.portfolioId) q = q.eq('portfolio_id', filters.portfolioId);

    const { data, error } = (await q) as {
      data: SentinelAlert[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`listAlerts failed: ${error.message}`);
    }
    return data ?? [];
  }

  async getAlertDetail(
    id: string,
    orgSlug: string,
  ): Promise<{
    alert: SentinelAlert;
    signal: SentinelSignal;
    portfolio: SentinelPortfolioHolding;
  } | null> {
    // Fetch alert, then join signal + portfolio
    const { data: alert, error } = (await this.db
      .from(SCHEMA, 'sentinel_alerts')
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .maybeSingle()) as {
      data: SentinelAlert | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`getAlertDetail(${id}) failed: ${error.message}`);
    }
    if (!alert) return null;

    const [signalRes, portfolioRes] = (await Promise.all([
      this.db
        .from(SCHEMA, 'sentinel_signals')
        .select('*')
        .eq('id', alert.signal_id)
        .maybeSingle(),
      this.db
        .from(SCHEMA, 'sentinel_portfolio')
        .select('*')
        .eq('id', alert.portfolio_id)
        .maybeSingle(),
    ])) as [
      { data: SentinelSignal | null; error: { message: string } | null },
      {
        data: SentinelPortfolioHolding | null;
        error: { message: string } | null;
      },
    ];

    if (signalRes.error || !signalRes.data) {
      throw new Error(`getAlertDetail: signal ${alert.signal_id} not found`);
    }
    if (portfolioRes.error || !portfolioRes.data) {
      throw new Error(
        `getAlertDetail: portfolio ${alert.portfolio_id} not found`,
      );
    }

    return {
      alert,
      signal: signalRes.data,
      portfolio: portfolioRes.data,
    };
  }

  async createAlert(
    orgSlug: string,
    dto: CreateAlertDto,
  ): Promise<SentinelAlert> {
    const row = {
      org_slug: orgSlug,
      signal_id: dto.signalId,
      portfolio_id: dto.portfolioId,
      relevance_score: dto.relevanceScore,
      severity: dto.severity,
      urgency: dto.urgency,
      summary: dto.summary,
      reasoning: dto.reasoning,
      recommended_action: dto.recommendedAction,
      status: 'new' as AlertStatus,
    };
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_alerts')
      .insert(row)
      .select('*')
      .single()) as {
      data: SentinelAlert | null;
      error: { message: string } | null;
    };
    if (error || !data) {
      throw new Error(`createAlert failed: ${error?.message ?? 'unknown'}`);
    }
    return data;
  }

  async createAlertsBatch(
    orgSlug: string,
    dtos: CreateAlertDto[],
  ): Promise<SentinelAlert[]> {
    if (dtos.length === 0) return [];
    const rows = dtos.map((dto) => ({
      org_slug: orgSlug,
      signal_id: dto.signalId,
      portfolio_id: dto.portfolioId,
      relevance_score: dto.relevanceScore,
      severity: dto.severity,
      urgency: dto.urgency,
      summary: dto.summary,
      reasoning: dto.reasoning,
      recommended_action: dto.recommendedAction,
      status: 'new' as AlertStatus,
    }));
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_alerts')
      .insert(rows)
      .select('*')) as {
      data: SentinelAlert[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`createAlertsBatch failed: ${error.message}`);
    }
    return data ?? [];
  }

  async updateAlertStatus(
    id: string,
    orgSlug: string,
    status: AlertStatus,
    acknowledgedBy?: string,
  ): Promise<SentinelAlert> {
    const fields: Record<string, unknown> = { status };
    if (status === 'acknowledged' || status === 'actioned') {
      fields.acknowledged_by = acknowledgedBy ?? null;
      fields.acknowledged_at = new Date().toISOString();
    }

    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_alerts')
      .update(fields)
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .select('*')
      .single()) as {
      data: SentinelAlert | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`updateAlertStatus(${id}) failed: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundException(`Alert ${id} not found in org ${orgSlug}`);
    }
    return data;
  }

  // ── Pulse Trigger Sync ──────────────────────────────────────────────────

  /**
   * Convert poll_interval_minutes to a cron expression.
   * Uses simple schedules: every N minutes.
   */
  private minutesToCron(minutes: number): string {
    if (minutes <= 0) return '0 * * * *'; // hourly fallback
    if (minutes < 60) return `*/${minutes} * * * *`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `0 */${hours} * * *`;
    return '0 0 * * *'; // daily fallback
  }

  /**
   * Upsert a Pulse cron trigger for a sentinel source.
   * The trigger name follows the convention: sentinel-ingest:{sourceId}
   * The trigger fires the Forge jobs endpoint via A2A.
   */
  async upsertPulseTrigger(
    source: SentinelSource,
  ): Promise<{ triggerId: string; created: boolean }> {
    const triggerName = `sentinel-ingest:${source.id}`;

    // Check if trigger already exists
    const { data: existing, error: findError } = (await this.db
      .from('ambient', 'triggers')
      .select('id')
      .eq('name', triggerName)
      .eq('product', 'pulse')
      .maybeSingle()) as {
      data: { id: string } | null;
      error: { message: string } | null;
    };
    if (findError) {
      throw new Error(`upsertPulseTrigger: find failed: ${findError.message}`);
    }

    const cronExpression = this.minutesToCron(source.poll_interval_minutes);
    const triggerData = {
      org_slug: source.org_slug,
      name: triggerName,
      description: `Auto-poll sentinel source: ${source.name}`,
      source_type: 'cron',
      enabled: source.enabled,
      source_config: { expression: cronExpression },
      condition: null,
      action_config: {
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma3:4b',
        payload: {
          jobType: 'sentinel-ingest',
          sourceId: source.id,
        },
        messageTemplate: `Sentinel poll: ${source.name}`,
      },
      cooldown_seconds: 0,
      max_fires_per_hour: null,
      product: 'pulse',
    };

    if (existing) {
      const { error: updateError } = await this.db
        .from('ambient', 'triggers')
        .update({
          ...triggerData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updateError) {
        throw new Error(
          `upsertPulseTrigger: update failed: ${updateError.message}`,
        );
      }
      return { triggerId: existing.id, created: false };
    }

    const { data: created, error: insertError } = (await this.db
      .from('ambient', 'triggers')
      .insert(triggerData)
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: { message: string } | null;
    };
    if (insertError || !created) {
      throw new Error(
        `upsertPulseTrigger: insert failed: ${insertError?.message ?? 'unknown'}`,
      );
    }
    return { triggerId: created.id, created: true };
  }

  /**
   * Remove the Pulse cron trigger for a sentinel source.
   */
  async deletePulseTrigger(sourceId: string): Promise<void> {
    const triggerName = `sentinel-ingest:${sourceId}`;
    const { error } = await this.db
      .from('ambient', 'triggers')
      .delete()
      .eq('name', triggerName)
      .eq('product', 'pulse');
    if (error) {
      throw new Error(
        `deletePulseTrigger(${sourceId}) failed: ${error.message}`,
      );
    }
  }

  async countNewAlerts(orgSlug: string): Promise<number> {
    const { data, error } = (await this.db
      .from(SCHEMA, 'sentinel_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('org_slug', orgSlug)
      .eq('status', 'new')) as {
      data: unknown;
      error: { message: string } | null;
      count?: number;
    };
    if (error) {
      throw new Error(`countNewAlerts failed: ${error.message}`);
    }
    // The count may come in different forms depending on the DB service implementation
    return (data as { count?: number })?.count ?? 0;
  }
}
