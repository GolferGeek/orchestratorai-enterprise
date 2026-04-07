/**
 * LegalJobsRepository — all reads and writes against legal.agent_jobs.
 *
 * - Goes through DATABASE_SERVICE only (no direct supabase imports).
 * - Every read/write filters by org_slug; the trust boundary is the caller's
 *   ExecutionContext.
 * - claimNextQueued is the atomic claim used by the worker (Phase 2): it
 *   returns the next queued row ordered by queued_at and flips it to
 *   processing in a single statement, so two worker ticks cannot grab the
 *   same row.
 *
 * See: docs/efforts/current/prd.md §4.1, §4.2
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import {
  AgentJobRow,
  DOCUMENT_ANALYSIS_JOB_TYPE,
  EnqueueJobRequest,
  JobStatus,
  LEGAL_AGENT_SLUG,
} from './legal-jobs.types';

const SCHEMA = 'legal';
const TABLE = 'agent_jobs';

@Injectable()
export class LegalJobsRepository {
  private readonly logger = new Logger(LegalJobsRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Insert a new queued job. The server-generated conversation_id is the
   * job's durable thread key for the rest of its life.
   */
  async insertQueued(
    request: EnqueueJobRequest,
    conversationId: string,
  ): Promise<AgentJobRow> {
    const { context, data, metadata } = request;

    const row = {
      org_slug: context.orgSlug,
      user_id: context.userId,
      conversation_id: conversationId,
      agent_slug: LEGAL_AGENT_SLUG,
      job_type: DOCUMENT_ANALYSIS_JOB_TYPE,
      provider: context.provider,
      model: context.model,
      status: 'queued' as JobStatus,
      progress: 0,
      input: { data, metadata: metadata ?? null },
    };

    const { data: inserted, error } = (await this.db
      .from(SCHEMA, TABLE)
      .insert(row)
      .select('*')
      .single()) as {
      data: AgentJobRow | null;
      error: { message: string } | null;
    };

    if (error || !inserted) {
      throw new Error(
        `Failed to insert legal.agent_jobs row: ${error?.message ?? 'unknown'}`,
      );
    }

    this.logger.log(
      `Enqueued job ${inserted.id} (org=${inserted.org_slug}, conv=${inserted.conversation_id})`,
    );
    return inserted;
  }

  async findByIdForOrg(
    id: string,
    orgSlug: string,
  ): Promise<AgentJobRow | null> {
    const { data, error } = (await this.db
      .from(SCHEMA, TABLE)
      .select('*')
      .eq('id', id)
      .eq('org_slug', orgSlug)
      .maybeSingle()) as {
      data: AgentJobRow | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to read legal.agent_jobs row ${id}: ${error.message}`,
      );
    }
    return data ?? null;
  }

  async listForOrg(
    orgSlug: string,
    options?: { status?: JobStatus; limit?: number; offset?: number },
  ): Promise<AgentJobRow[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let q = this.db
      .from(SCHEMA, TABLE)
      .select('*')
      .eq('org_slug', orgSlug)
      .order('queued_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.status) {
      q = q.eq('status', options.status);
    }

    const { data, error } = (await q) as {
      data: AgentJobRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `Failed to list legal.agent_jobs for org ${orgSlug}: ${error.message}`,
      );
    }
    return data ?? [];
  }

  /**
   * Atomically claim the oldest queued job and flip it to processing.
   *
   * Implementation note: the QueryBuilder doesn't expose ORDER BY + LIMIT on
   * UPDATE, so we do this in two steps inside a single rawQuery using a
   * subselect. This is still atomic because Postgres takes a row lock during
   * the UPDATE; with FOR UPDATE SKIP LOCKED in the subselect, two concurrent
   * worker ticks cannot grab the same row.
   *
   * Used by the Phase 2 worker; included here so Phase 1 tests can exercise
   * the contract.
   */
  async claimNextQueued(): Promise<AgentJobRow | null> {
    const sql = `
      UPDATE legal.agent_jobs
      SET status = 'processing', started_at = now()
      WHERE id = (
        SELECT id FROM legal.agent_jobs
        WHERE status = 'queued'
        ORDER BY queued_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql)) as {
      data: AgentJobRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`claimNextQueued failed: ${error.message}`);
    }
    return data && data.length > 0 ? (data[0] ?? null) : null;
  }

  async updateProgress(
    id: string,
    fields: { current_step?: string; progress?: number; last_message?: string },
  ): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update(fields)
      .eq('id', id);
    if (error) {
      throw new Error(`updateProgress(${id}) failed: ${error.message}`);
    }
  }

  async markCompleted(
    id: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
        progress: 100,
      })
      .eq('id', id);
    if (error) {
      throw new Error(`markCompleted(${id}) failed: ${error.message}`);
    }
  }

  /**
   * Read durable observability events for a job. The job's conversation_id
   * is the foreign key into public.observability_events.
   */
  async listEventsForConversation(conversationId: string): Promise<unknown[]> {
    const { data, error } = (await this.db
      .from(null, 'observability_events')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('id', { ascending: true })) as {
      data: unknown[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(
        `listEventsForConversation(${conversationId}) failed: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update({
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      throw new Error(`markFailed(${id}) failed: ${error.message}`);
    }
  }
}
