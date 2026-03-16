import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import type {
  HumanApprovalCreateInput,
  HumanApprovalDecisionInput,
  HumanApprovalListOptions,
  HumanApprovalMetadata,
  HumanApprovalRecord,
} from '../interfaces/human-approval-record.interface';

interface SupabaseListResponse<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
}

@Injectable()
export class HumanApprovalsRepository {
  private readonly logger = new Logger(HumanApprovalsRepository.name);
  private readonly table = 'human_approvals';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async create(input: HumanApprovalCreateInput): Promise<HumanApprovalRecord> {
    const { data, error } = (await this.db
      .from(null, this.table)
      .insert({
        organization_slug: input.organizationSlug,
        agent_slug: input.agentSlug,
        conversation_id: input.conversationId ?? null,
        task_id: input.taskId ?? null,
        orchestration_run_id: input.orchestrationRunId ?? null,
        orchestration_step_id: input.orchestrationStepId ?? null,
        mode: input.mode,
        status: 'pending',
        metadata: this.ensureMetadata(input.metadata),
      })
      .select('*')
      .single()) as {
      data: HumanApprovalRecord | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Failed to create approval: ${error.message}`);
    return data as HumanApprovalRecord;
  }

  async setStatus(
    id: HumanApprovalDecisionInput['id'],
    status: HumanApprovalDecisionInput['status'],
    approvedBy?: HumanApprovalDecisionInput['approvedBy'],
    metadata?: HumanApprovalMetadata,
  ): Promise<HumanApprovalRecord> {
    const payload: {
      status: HumanApprovalDecisionInput['status'];
      approved_by: string | null;
      decision_at: string;
      metadata?: HumanApprovalMetadata;
    } = {
      status,
      approved_by: approvedBy ?? null,
      decision_at: new Date().toISOString(),
    };
    if (metadata) {
      payload.metadata = this.ensureMetadata(metadata);
    }
    const { data, error } = (await this.db
      .from(null, this.table)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()) as {
      data: HumanApprovalRecord | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Failed to update approval: ${error.message}`);
    return data as HumanApprovalRecord;
  }

  async get(id: string): Promise<HumanApprovalRecord | null> {
    const { data, error } = (await this.db
      .from(null, this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as {
      data: HumanApprovalRecord | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Failed to fetch approval: ${error.message}`);
    return (data as HumanApprovalRecord) || null;
  }

  async listPendingByRun(
    orchestrationRunId: string,
  ): Promise<HumanApprovalRecord[]> {
    const { data, error } = (await this.db
      .from(null, this.table)
      .select('*')
      .eq('orchestration_run_id', orchestrationRunId)
      .eq('status', 'pending')
      .order('created_at', {
        ascending: true,
      })) as SupabaseListResponse<HumanApprovalRecord>;

    if (error) {
      throw new Error(
        `Failed to list approvals for run ${orchestrationRunId}: ${error.message}`,
      );
    }

    return (data as HumanApprovalRecord[]) ?? [];
  }

  async list(options: HumanApprovalListOptions = {}): Promise<{
    data: HumanApprovalRecord[];
    count: number | null;
    limit: number;
    offset: number;
  }> {
    const limit = this.clampLimit(options.limit ?? 50);
    const offset = Math.max(options.offset ?? 0, 0);

    let query = this.db.from(null, this.table).select('*', {
      count: 'exact',
      head: false,
    });

    if (options.organizationSlug) {
      query = query.eq('organization_slug', options.organizationSlug);
    }

    if (options.statuses && options.statuses.length > 0) {
      query = query.in('status', options.statuses);
    } else if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.mode) {
      query = query.eq('mode', options.mode);
    }

    if (options.orchestrationRunId) {
      query = query.eq('orchestration_run_id', options.orchestrationRunId);
    }

    if (options.createdAfter) {
      query = query.gte('created_at', options.createdAfter);
    }

    if (options.createdBefore) {
      query = query.lte('created_at', options.createdBefore);
    }

    const sortBy = options.sortBy ?? 'created_at';
    const ascending = (options.sortDirection ?? 'desc') === 'asc';
    query = query.order(sortBy, { ascending });

    const { data, error, count } = (await query.range(
      offset,
      offset + limit - 1,
    )) as SupabaseListResponse<HumanApprovalRecord>;

    if (error) {
      this.logger.error(`Failed to list approvals: ${error.message}`);
      throw new Error(`Failed to list approvals: ${error.message}`);
    }

    return {
      data: (data as HumanApprovalRecord[]) ?? [],
      count: count ?? null,
      limit,
      offset,
    };
  }

  async listByRunIds(runIds: string[]): Promise<HumanApprovalRecord[]> {
    if (!runIds.length) {
      return [];
    }

    const { data, error } = (await this.db
      .from(null, this.table)
      .select('*')
      .in('orchestration_run_id', runIds)
      .order('created_at', {
        ascending: false,
      })) as SupabaseListResponse<HumanApprovalRecord>;

    if (error) {
      this.logger.error(
        `Failed to list approvals by run ids: ${error.message}`,
      );
      throw new Error(`Failed to list approvals by run ids: ${error.message}`);
    }

    return (data as HumanApprovalRecord[]) ?? [];
  }

  async countPendingByRunIds(
    runIds: string[],
  ): Promise<Record<string, number>> {
    if (!runIds.length) {
      return {};
    }

    const { data, error } = (await this.db
      .from(null, this.table)
      .select('id, orchestration_run_id')
      .in('orchestration_run_id', runIds)
      .eq('status', 'pending')) as SupabaseListResponse<{
      id: string;
      orchestration_run_id: string | null;
    }>;

    if (error) {
      this.logger.error(`Failed to count pending approvals: ${error.message}`);
      throw new Error(`Failed to count pending approvals: ${error.message}`);
    }

    const counts: Record<string, number> = {};
    (data ?? []).forEach((record) => {
      const runId = record.orchestration_run_id;
      if (runId) {
        counts[runId] = (counts[runId] ?? 0) + 1;
      }
    });

    return counts;
  }

  private clampLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return 50;
    }

    return Math.min(Math.floor(limit), 200);
  }

  private ensureMetadata(
    metadata: HumanApprovalMetadata | undefined,
  ): HumanApprovalMetadata {
    if (metadata === undefined) {
      return {};
    }

    if (
      typeof metadata === 'object' &&
      metadata !== null &&
      !Array.isArray(metadata)
    ) {
      return metadata;
    }

    throw new Error('Human approval metadata must be a JSON object');
  }
}
