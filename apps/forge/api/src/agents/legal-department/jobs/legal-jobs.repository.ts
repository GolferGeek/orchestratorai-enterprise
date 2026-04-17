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
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import {
  type AccessControl,
  AgentJobRow,
  DISCOVERY_REVIEW_JOB_TYPE,
  DOCUMENT_ANALYSIS_JOB_TYPE,
  EnqueueJobRequest,
  JobStatus,
  LEGAL_AGENT_SLUG,
  ReviewDecisionPayload,
} from './legal-jobs.types';

export function isAccessAllowed(
  row: AgentJobRow,
  callerUserId: string | undefined,
  isAdmin: boolean,
): boolean {
  const ac = row.access_control;
  if (!ac || ac.mode === 'open') return true;
  if (!callerUserId) return false;
  if (callerUserId === row.user_id) return true;
  if (isAdmin) return true;
  return ac.allowedUserIds?.includes(callerUserId) ?? false;
}

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
    accessControl?: AccessControl,
  ): Promise<AgentJobRow> {
    const { context, data, metadata } = request;

    // document_count: prefer explicit field, fall back to documents array length,
    // fall back to 1 (legacy single-doc path).
    const docCount =
      typeof (data as Record<string, unknown>).document_count === 'number'
        ? ((data as Record<string, unknown>).document_count as number)
        : Array.isArray((data as Record<string, unknown>).documents)
          ? ((data as Record<string, unknown>).documents as unknown[]).length
          : 1;

    const row = {
      org_slug: context.orgSlug,
      user_id: context.userId,
      conversation_id: conversationId,
      agent_slug: LEGAL_AGENT_SLUG,
      job_type:
        (metadata as Record<string, unknown>)?.jobType === 'legal-research'
          ? 'legal-research'
          : (metadata as Record<string, unknown>)?.jobType ===
              DISCOVERY_REVIEW_JOB_TYPE
            ? DISCOVERY_REVIEW_JOB_TYPE
            : DOCUMENT_ANALYSIS_JOB_TYPE,
      provider: context.provider,
      model: context.model,
      status: 'queued' as JobStatus,
      progress: 0,
      input: { data, metadata: metadata ?? null },
      document_count: docCount,
      ...(accessControl && { access_control: accessControl }),
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

    // Also insert a matching row in public.conversations so that
    // llm_usage.conversation_id can be populated for LLM calls made on this
    // job's behalf. The llm_usage writer nulls out conversation_id when the
    // referenced conversation doesn't exist (FK-safety), which would break
    // the Phase 4 reasoning endpoints that join llm_usage -> agent_jobs on
    // conversation_id. Keep this insert best-effort: a pre-existing row
    // (unlikely with a random UUID) is not fatal.
    const { error: convError } = await this.db
      .from(null, 'conversations')
      .insert({
        id: conversationId,
        user_id: context.userId,
        agent_name: LEGAL_AGENT_SLUG,
        agent_type: 'langgraph',
        organization_slug: context.orgSlug,
        started_at: new Date().toISOString(),
      });
    if (convError) {
      this.logger.warn(
        `Failed to insert public.conversations row for job ${inserted.id}: ${convError.message}`,
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
    options?: { allowedForUserId?: string; isAdmin?: boolean },
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
    const row = data ?? null;
    if (
      row &&
      options?.allowedForUserId &&
      !isAccessAllowed(row, options.allowedForUserId, options.isAdmin ?? false)
    ) {
      return null;
    }
    return row;
  }

  async listForOrg(
    orgSlug: string,
    options?: {
      status?: JobStatus;
      userId?: string;
      limit?: number;
      offset?: number;
      jobType?: string;
      parentJobId?: string;
      allowedForUserId?: string;
      isAdmin?: boolean;
    },
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
    if (options?.userId) {
      q = q.eq('user_id', options.userId);
    }
    // Filter on JSONB-nested fields via `@>` containment. The QueryBuilder's
    // `eq()` quotes the column name, which would treat an arrow-path string
    // as a literal column. `contains()` builds `"input" @> '...'::jsonb`,
    // which matches our shape exactly. Both filters can compound — passing
    // a single object with both fields scopes the result to memo jobs for a
    // specific DD parent.
    if (options?.jobType || options?.parentJobId) {
      const filter: Record<string, unknown> = {};
      if (options.jobType) {
        filter.metadata = { jobType: options.jobType };
      }
      if (options.parentJobId) {
        filter.data = { parentJobId: options.parentJobId };
      }
      q = q.contains('input', filter);
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
    const rows = data ?? [];
    if (options?.allowedForUserId) {
      return rows.filter((row) =>
        isAccessAllowed(
          row,
          options.allowedForUserId,
          options.isAdmin ?? false,
        ),
      );
    }
    return rows;
  }

  async updateAccessControl(
    id: string,
    orgSlug: string,
    accessControl: AccessControl,
  ): Promise<AgentJobRow> {
    const sql = `
      UPDATE legal.agent_jobs
      SET access_control = $1::jsonb
      WHERE id = $2 AND org_slug = $3
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      JSON.stringify(accessControl),
      id,
      orgSlug,
    ])) as {
      data: AgentJobRow[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`updateAccessControl(${id}) failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new NotFoundException(`Job ${id} not found in org ${orgSlug}`);
    }
    return data[0]!;
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

  async updateOriginalFilePath(id: string, path: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update({ original_file_path: path })
      .eq('id', id);
    if (error) {
      throw new Error(`updateOriginalFilePath(${id}) failed: ${error.message}`);
    }
  }

  /**
   * Persist the storage paths for all documents in a multi-doc upload
   * (Phase 3). Also updates document_count to paths.length.
   */
  async updateDocumentPaths(id: string, paths: string[]): Promise<void> {
    // Use rawQuery so the TEXT[] column receives a real Postgres array via
    // parameterized binding. The QueryBuilder/PostgREST update path serializes
    // string[] in a way that doesn't survive the array column on the
    // legal.agent_jobs table.
    const sql = `
      UPDATE legal.agent_jobs
      SET document_paths = $1::text[],
          document_count = $2
      WHERE id = $3
    `;
    const { error } = (await this.db.rawQuery(sql, [
      paths,
      paths.length,
      id,
    ])) as { data: unknown; error: { message: string } | null };
    if (error) {
      throw new Error(`updateDocumentPaths(${id}) failed: ${error.message}`);
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
   * joins to public.observability_events.
   *
   * The existing LangGraph observability pipeline writes the conversationId
   * into the `task_id` and `session_id` columns (legacy) instead of the
   * dedicated `conversation_id` column, so we match on either to stay
   * backward compatible with existing events AND any future events that
   * populate conversation_id.
   */
  async listEventsForConversation(conversationId: string): Promise<unknown[]> {
    const { data, error } = (await this.db
      .from(null, 'observability_events')
      .select('*')
      .or(`conversation_id.eq.${conversationId},task_id.eq.${conversationId}`)
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

  /**
   * Transition a running job to `awaiting_review` after the graph hits a
   * HITL interrupt. The worker calls this from its GraphInterrupt catch
   * path before releasing the provider concurrency slot.
   */
  async markAwaitingReview(id: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update({
        status: 'awaiting_review',
        current_step: 'hitl_checkpoint',
        progress: 85,
        last_message: 'Awaiting attorney review',
      })
      .eq('id', id);
    if (error) {
      throw new Error(`markAwaitingReview(${id}) failed: ${error.message}`);
    }
  }

  /**
   * Clear the review_decision after the worker has successfully resumed the
   * graph with it. Used on success paths so a later re-queue doesn't see a
   * stale decision.
   */
  async clearReviewDecision(id: string): Promise<void> {
    const { error } = await this.db
      .from(SCHEMA, TABLE)
      .update({ review_decision: null })
      .eq('id', id);
    if (error) {
      throw new Error(`clearReviewDecision(${id}) failed: ${error.message}`);
    }
  }

  /**
   * Record an attorney's review decision AND transition the job back to
   * queued in a single guarded UPDATE. Returns the updated row on success,
   * or null if the row was not in `awaiting_review` (so the controller can
   * return 409 without a TOCTOU race against a concurrent transition).
   */
  async recordReviewAndRequeue(
    id: string,
    orgSlug: string,
    decision: ReviewDecisionPayload,
  ): Promise<AgentJobRow | null> {
    // rawQuery so we can combine the status guard with the JSONB write and
    // get RETURNING * back atomically.
    const sql = `
      UPDATE legal.agent_jobs
      SET status = 'queued',
          review_decision = $1::jsonb,
          last_message = 'Review submitted, re-queued for resume',
          current_step = 'resume_pending'
      WHERE id = $2
        AND org_slug = $3
        AND status = 'awaiting_review'
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      JSON.stringify(decision),
      id,
      orgSlug,
    ])) as {
      data: AgentJobRow[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(`recordReviewAndRequeue(${id}) failed: ${error.message}`);
    }
    return data && data.length > 0 ? (data[0] ?? null) : null;
  }

  /**
   * Fetch the captured reasoning for a specific specialist on a specific job.
   *
   * Joins `public.llm_usage` to `legal.agent_jobs` on `conversation_id` and
   * filters by `agent_name` matching the caller-name pattern for the given
   * `specialistKey`. Returns the most-recent matching row (most recent LLM call
   * wins in case of retries), or `null` when no reasoning was captured.
   *
   * Uses `rawQuery` to cross-schema join — PostgREST silently drops those.
   *
   * Org scoping: the join to `legal.agent_jobs` guarantees the caller cannot
   * retrieve reasoning for a job outside their org.
   */
  async findReasoningForSpecialist(
    jobId: string,
    orgSlug: string,
    specialistKey: string,
  ): Promise<{
    thinkingContent: string;
    thinkingDurationMs: number | null;
    thinkingTokenCount: number | null;
  } | null> {
    // The callerName format for the 8 specialists is `legal-department:{specialistKey}-agent`.
    // Synthesis and report-generation omit the `-agent` suffix.
    // We try both patterns and take the first non-null result.
    const sql = `
      SELECT u.thinking_content, u.thinking_duration_ms, u.thinking_token_count
      FROM public.llm_usage u
      JOIN legal.agent_jobs j ON j.conversation_id = u.conversation_id
      WHERE j.id = $1
        AND j.org_slug = $2
        AND u.thinking_content IS NOT NULL
        AND (
          u.agent_name = $3
          OR u.agent_name = $4
        )
      ORDER BY u.started_at DESC
      LIMIT 1
    `;
    const agentNameWithSuffix = `legal-department:${specialistKey}-agent`;
    const agentNameExact = `legal-department:${specialistKey}`;

    const { data, error } = (await this.db.rawQuery(sql, [
      jobId,
      orgSlug,
      agentNameWithSuffix,
      agentNameExact,
    ])) as {
      data: Array<{
        thinking_content: string | null;
        thinking_duration_ms: number | null;
        thinking_token_count: number | null;
      }> | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `findReasoningForSpecialist(${jobId}, ${specialistKey}) failed: ${error.message}`,
      );
    }

    const row = data?.[0];
    if (!row || !row.thinking_content) {
      return null;
    }

    return {
      thinkingContent: row.thinking_content,
      thinkingDurationMs: row.thinking_duration_ms,
      thinkingTokenCount: row.thinking_token_count,
    };
  }

  /**
   * Return the list of specialist keys that have captured reasoning for a
   * given job. Used by the review modal probe to decide which accordions
   * to render.
   *
   * Returns an empty array when no reasoning was captured (non-reasoning
   * model, or provider not yet wired in Phase 4).
   */
  async listSpecialistKeysWithReasoning(
    jobId: string,
    orgSlug: string,
  ): Promise<string[]> {
    // Fetch all llm_usage rows for this job (via conversation_id join) that
    // have thinking_content populated.  Extract the specialistKey by stripping
    // the 'legal-department:' prefix and optional '-agent' suffix.
    const sql = `
      SELECT DISTINCT u.agent_name
      FROM public.llm_usage u
      JOIN legal.agent_jobs j ON j.conversation_id = u.conversation_id
      WHERE j.id = $1
        AND j.org_slug = $2
        AND u.thinking_content IS NOT NULL
        AND u.agent_name LIKE 'legal-department:%'
    `;

    const { data, error } = (await this.db.rawQuery(sql, [jobId, orgSlug])) as {
      data: Array<{ agent_name: string }> | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(
        `listSpecialistKeysWithReasoning(${jobId}) failed: ${error.message}`,
      );
    }

    return (data ?? []).map((row) => {
      // Strip 'legal-department:' prefix
      let key = row.agent_name.replace(/^legal-department:/, '');
      // Strip optional '-agent' suffix
      key = key.replace(/-agent$/, '');
      return key;
    });
  }

  /**
   * Prepare a completed DD room job for an incremental document update.
   * Appends new storage paths, increments document count, and re-queues
   * the job so the worker picks it up for incremental processing.
   *
   * Precondition: job must be status=completed AND metadata.jobType=due-diligence.
   * Throws ConflictException if the job is not in the correct state.
   */
  async addDocumentsToRoom(
    id: string,
    orgSlug: string,
    updates: {
      newDocumentPaths: string[];
      newDocumentCount: number;
    },
  ): Promise<AgentJobRow> {
    // Set input.metadata.incremental = true so the worker knows to use
    // processIncrementalDueDiligence instead of processDueDiligence.
    const sql = `
      UPDATE legal.agent_jobs
      SET document_paths = document_paths || $1::text[],
          document_count = document_count + $2,
          status = 'queued',
          result = NULL,
          completed_at = NULL,
          queued_at = now(),
          input = jsonb_set(
            COALESCE(input, '{}'::jsonb),
            '{metadata,incremental}',
            'true'::jsonb
          )
      WHERE id = $3
        AND org_slug = $4
        AND status = 'completed'
        AND input->'metadata'->>'jobType' = 'due-diligence'
      RETURNING *;
    `;
    const { data, error } = (await this.db.rawQuery(sql, [
      updates.newDocumentPaths,
      updates.newDocumentCount,
      id,
      orgSlug,
    ])) as {
      data: AgentJobRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`addDocumentsToRoom(${id}) failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new ConflictException(
        `Job ${id} cannot accept new documents — it must be a completed due-diligence room`,
      );
    }
    return data[0]!;
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

  /**
   * Cancel a job. Immediate for queued/awaiting_review/review_rejected;
   * deferred for processing (worker checks between node transitions).
   * Throws ConflictException for terminal statuses.
   */
  async cancelJob(
    id: string,
    orgSlug: string,
  ): Promise<'canceled' | 'cancel_requested'> {
    const job = await this.findByIdForOrg(id, orgSlug);
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    const immediateCancel = ['queued', 'awaiting_review', 'review_rejected'];
    if (immediateCancel.includes(job.status)) {
      const { error } = await this.db
        .from(SCHEMA, TABLE)
        .update({
          status: 'canceled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('org_slug', orgSlug);
      if (error) {
        throw new Error(`cancelJob(${id}) failed: ${error.message}`);
      }
      return 'canceled';
    }

    if (job.status === 'processing') {
      const { error } = await this.db
        .from(SCHEMA, TABLE)
        .update({ status: 'cancel_requested' })
        .eq('id', id)
        .eq('org_slug', orgSlug);
      if (error) {
        throw new Error(`cancelJob(${id}) failed: ${error.message}`);
      }
      return 'cancel_requested';
    }

    // Terminal statuses: completed, failed, canceled, cancel_requested
    throw new ConflictException(
      `Job cannot be canceled in current status: ${job.status}`,
    );
  }

  /**
   * Delete completed jobs older than the specified number of days.
   * Returns the count of deleted rows.
   */
  async deleteOlderThan(days: number, status: string): Promise<number> {
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result: {
      data: unknown[] | null;
      error: { message: string } | null;
    } = await this.db.rawQuery(
      `DELETE FROM ${SCHEMA}.${TABLE} WHERE status = $1 AND completed_at < $2`,
      [status, cutoff],
    );
    if (result.error) {
      this.logger.error(`deleteOlderThan failed: ${result.error.message}`);
      return 0;
    }
    return result.data?.length ?? 0;
  }
}
