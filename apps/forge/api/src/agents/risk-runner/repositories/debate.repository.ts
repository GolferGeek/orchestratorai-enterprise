import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskDebate,
  CreateRiskDebateData,
  UpdateRiskDebateData,
  RiskDebateContext,
  CreateDebateContextData,
  UpdateDebateContextData,
} from '../interfaces/debate.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface DebateFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class DebateRepository {
  private readonly logger = new Logger(DebateRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'debates';
  private readonly contextTable = 'debate_contexts';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: DebateFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  // ─── DEBATES ────────────────────────────────────────────────────────

  async findBySubject(
    subjectId: string,
    filter?: DebateFilter,
  ): Promise<RiskDebate[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskDebate>;

    if (error) {
      this.logger.error(`Failed to fetch debates: ${error.message}`);
      throw new Error(`Failed to fetch debates: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find the latest completed debate for a subject
   */
  async findLatestBySubject(
    subjectId: string,
    filter?: DebateFilter,
  ): Promise<RiskDebate | null> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId)
      .eq('status', 'completed');

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<RiskDebate>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch latest debate: ${error.message}`);
      throw new Error(`Failed to fetch latest debate: ${error.message}`);
    }

    return data;
  }

  async findById(id: string): Promise<RiskDebate | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskDebate>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch debate: ${error.message}`);
      throw new Error(`Failed to fetch debate: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskDebate> {
    const debate = await this.findById(id);
    if (!debate) {
      throw new NotFoundException(`Debate not found: ${id}`);
    }
    return debate;
  }

  async create(debateData: CreateRiskDebateData): Promise<RiskDebate> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(debateData)
      .select()
      .single()) as SupabaseSelectResponse<RiskDebate>;

    if (error) {
      this.logger.error(`Failed to create debate: ${error.message}`);
      throw new Error(`Failed to create debate: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no debate returned');
    }

    this.logger.log(`Created debate: ${data.id}`);
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskDebateData,
  ): Promise<RiskDebate> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskDebate>;

    if (error) {
      this.logger.error(`Failed to update debate: ${error.message}`);
      throw new Error(`Failed to update debate: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no debate returned');
    }

    this.logger.log(`Updated debate: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete debate: ${error.message}`);
      throw new Error(`Failed to delete debate: ${error.message}`);
    }

    this.logger.log(`Deleted debate: ${id}`);
  }

  // ─── DEBATE CONTEXTS ────────────────────────────────────────────────────────

  async findContextsByScope(
    scopeId: string,
    filter?: DebateFilter,
  ): Promise<RiskDebateContext[]> {
    let query = this.db
      .from(this.schema, this.contextTable)
      .select('*')
      .eq('scope_id', scopeId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('role', {
      ascending: true,
    })) as SupabaseSelectListResponse<RiskDebateContext>;

    if (error) {
      this.logger.error(`Failed to fetch debate contexts: ${error.message}`);
      throw new Error(`Failed to fetch debate contexts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find active context for a role (latest active version)
   */
  async findActiveContextByRole(
    scopeId: string,
    role: 'blue' | 'red' | 'arbiter',
    filter?: DebateFilter,
  ): Promise<RiskDebateContext | null> {
    let query = this.db
      .from(this.schema, this.contextTable)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('role', role)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('version', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<RiskDebateContext>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch active debate context: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch active debate context: ${error.message}`,
      );
    }

    return data;
  }

  async createContext(
    contextData: CreateDebateContextData,
  ): Promise<RiskDebateContext> {
    // If no version specified, get the next version
    if (!contextData.version) {
      const existing = await this.findContextsByScope(contextData.scope_id);
      const roleContexts = existing.filter((c) => c.role === contextData.role);
      contextData.version =
        roleContexts.length > 0
          ? Math.max(...roleContexts.map((c) => c.version)) + 1
          : 1;
    }

    const { data, error } = (await this.db
      .from(this.schema, this.contextTable)
      .insert(contextData)
      .select()
      .single()) as SupabaseSelectResponse<RiskDebateContext>;

    if (error) {
      this.logger.error(`Failed to create debate context: ${error.message}`);
      throw new Error(`Failed to create debate context: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no debate context returned');
    }

    this.logger.log(
      `Created debate context: ${data.id} (${data.role} v${data.version})`,
    );
    return data;
  }

  async updateContext(
    id: string,
    updateData: UpdateDebateContextData,
  ): Promise<RiskDebateContext> {
    const { data, error } = (await this.db
      .from(this.schema, this.contextTable)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskDebateContext>;

    if (error) {
      this.logger.error(`Failed to update debate context: ${error.message}`);
      throw new Error(`Failed to update debate context: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no debate context returned');
    }

    this.logger.log(`Updated debate context: ${id}`);
    return data;
  }

  async deleteContext(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.contextTable)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete debate context: ${error.message}`);
      throw new Error(`Failed to delete debate context: ${error.message}`);
    }

    this.logger.log(`Deleted debate context: ${id}`);
  }
}
