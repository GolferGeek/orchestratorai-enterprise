import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  Analyst,
  ActiveAnalyst,
  LlmTier,
  ContextProvider,
  PersonalityAnalyst,
} from '../interfaces/analyst.interface';
import {
  ForkType,
  ChangedBy,
  AnalystContextVersion,
} from '../interfaces/portfolio.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

@Injectable()
export class AnalystRepository {
  private readonly logger = new Logger(AnalystRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'analysts';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Get active analysts for a target using database function
   * Respects scope hierarchy and overrides
   */
  async getActiveAnalysts(
    targetId: string,
    tier?: LlmTier,
  ): Promise<ActiveAnalyst[]> {
    const { data, error } = (await this.db.rpc(
      'get_active_analysts',
      {
        p_target_id: targetId,
        p_tier: tier || null,
      },
      this.schema,
    )) as SupabaseSelectListResponse<ActiveAnalyst>;

    if (error) {
      this.logger.error(`Failed to get active analysts: ${error.message}`);
      throw new Error(`Failed to get active analysts: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<Analyst | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<Analyst>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch analyst: ${error.message}`);
      throw new Error(`Failed to fetch analyst: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<Analyst> {
    const analyst = await this.findById(id);
    if (!analyst) {
      throw new NotFoundException(`Analyst not found: ${id}`);
    }
    return analyst;
  }

  async findBySlug(
    slug: string,
    scopeLevel?: string,
    domain?: string,
  ): Promise<Analyst[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('slug', slug);

    if (scopeLevel) {
      query = query.eq('scope_level', scopeLevel);
    }
    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<Analyst>;

    if (error) {
      this.logger.error(`Failed to find analysts by slug: ${error.message}`);
      throw new Error(`Failed to find analysts by slug: ${error.message}`);
    }

    return data ?? [];
  }

  async create(analystData: Partial<Analyst>): Promise<Analyst> {
    const { data: created, error } = (await this.db
      .from(this.schema, this.table)
      .insert(analystData)
      .select()
      .single()) as SupabaseSelectResponse<Analyst>;

    if (error) {
      this.logger.error(`Failed to create analyst: ${error.message}`);
      throw new Error(`Failed to create analyst: ${error.message}`);
    }

    if (!created) {
      throw new Error('Create succeeded but no analyst returned');
    }

    return created;
  }

  async update(id: string, analystData: Partial<Analyst>): Promise<Analyst> {
    const { data: updated, error } = (await this.db
      .from(this.schema, this.table)
      .update(analystData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<Analyst>;

    if (error) {
      this.logger.error(`Failed to update analyst: ${error.message}`);
      throw new Error(`Failed to update analyst: ${error.message}`);
    }

    if (!updated) {
      throw new Error('Update succeeded but no analyst returned');
    }

    return updated;
  }

  /**
   * Get all active (enabled) analysts regardless of scope
   */
  async getActive(): Promise<Analyst[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_enabled', true)) as SupabaseSelectListResponse<Analyst>;

    if (error) {
      this.logger.error(`Failed to get active analysts: ${error.message}`);
      throw new Error(`Failed to get active analysts: ${error.message}`);
    }

    return data ?? [];
  }

  async findByDomain(domain: string): Promise<Analyst[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('domain', domain)
      .eq('is_enabled', true)) as SupabaseSelectListResponse<Analyst>;

    if (error) {
      this.logger.error(`Failed to find analysts by domain: ${error.message}`);
      throw new Error(`Failed to find analysts by domain: ${error.message}`);
    }

    return data ?? [];
  }

  async findRunnerLevel(): Promise<Analyst[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_level', 'runner')
      .eq('is_enabled', true)) as SupabaseSelectListResponse<Analyst>;

    if (error) {
      this.logger.error(
        `Failed to find runner-level analysts: ${error.message}`,
      );
      throw new Error(`Failed to find runner-level analysts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get all enabled personality analysts (decision-makers)
   * These are the 5 core analysts: Fred, Tina, Sally, Alex, Carl
   */
  async getPersonalityAnalysts(): Promise<PersonalityAnalyst[]> {
    const { data, error } = (await this.db.rpc(
      'get_personality_analysts',
      {},
      this.schema,
    )) as SupabaseSelectListResponse<PersonalityAnalyst>;

    if (error) {
      this.logger.error(`Failed to get personality analysts: ${error.message}`);
      throw new Error(`Failed to get personality analysts: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get context providers for a target in scope order
   * Returns: runner -> domain -> universe -> target level providers
   */
  async getContextProvidersForTarget(
    targetId: string,
  ): Promise<ContextProvider[]> {
    const { data, error } = (await this.db.rpc(
      'get_context_for_target',
      {
        p_target_id: targetId,
      },
      this.schema,
    )) as SupabaseSelectListResponse<ContextProvider>;

    if (error) {
      this.logger.error(
        `Failed to get context providers for target: ${error.message}`,
      );
      throw new Error(
        `Failed to get context providers for target: ${error.message}`,
      );
    }

    return data ?? [];
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete analyst: ${error.message}`);
      throw new Error(`Failed to delete analyst: ${error.message}`);
    }
  }

  // =============================================================================
  // CONTEXT VERSIONING METHODS
  // =============================================================================

  /**
   * Update analyst with version capture
   * Creates a new version in analyst_context_versions before updating
   * @param id Analyst ID
   * @param analystData Data to update
   * @param forkType Which fork to version (user or agent)
   * @param changeReason Reason for the change
   * @param changedBy Who made the change
   */
  async updateWithVersionCapture(
    id: string,
    analystData: Partial<Analyst>,
    forkType: ForkType,
    changeReason: string,
    changedBy: ChangedBy,
  ): Promise<{ analyst: Analyst; version: AnalystContextVersion }> {
    // Get current analyst state
    const currentAnalyst = await this.findByIdOrThrow(id);

    // Create new version before updating
    const version = await this.createContextVersion(
      id,
      forkType,
      analystData.perspective ?? currentAnalyst.perspective,
      analystData.tier_instructions ?? currentAnalyst.tier_instructions,
      analystData.default_weight ?? currentAnalyst.default_weight,
      changeReason,
      changedBy,
    );

    // Now update the analyst
    const updated = await this.update(id, analystData);

    this.logger.log(
      `Created version ${version.version_number} for analyst ${currentAnalyst.slug} (${forkType} fork)`,
    );

    return { analyst: updated, version };
  }

  /**
   * Create a new context version for an analyst fork
   */
  async createContextVersion(
    analystId: string,
    forkType: ForkType,
    perspective: string,
    tierInstructions: Record<string, string | undefined>,
    defaultWeight: number,
    changeReason: string,
    changedBy: ChangedBy,
    agentJournal?: string,
  ): Promise<AnalystContextVersion> {
    // Mark previous version as not current
    await this.db
      .from(this.schema, 'analyst_context_versions')
      .update({ is_current: false })
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .eq('is_current', true);

    // Get next version number
    const { data: versions } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('version_number')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .order('version_number', { ascending: false })
      .limit(1)) as SupabaseSelectListResponse<{ version_number: number }>;

    const nextVersion =
      versions && versions.length > 0 && versions[0]
        ? versions[0].version_number + 1
        : 1;

    // Create new version
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .insert({
        analyst_id: analystId,
        fork_type: forkType,
        version_number: nextVersion,
        perspective,
        tier_instructions: tierInstructions,
        default_weight: defaultWeight,
        agent_journal: agentJournal,
        change_reason: changeReason,
        changed_by: changedBy,
        is_current: true,
      })
      .select()
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(`Failed to create context version: ${error.message}`);
      throw new Error(`Failed to create context version: ${error.message}`);
    }

    return data!;
  }

  /**
   * Get current context version for an analyst fork
   */
  async getCurrentContextVersion(
    analystId: string,
    forkType: ForkType,
  ): Promise<AnalystContextVersion | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .eq('is_current', true)
      .single()) as SupabaseSelectResponse<AnalystContextVersion>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get current context version: ${error.message}`,
      );
      throw new Error(
        `Failed to get current context version: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Get all context versions for an analyst fork
   */
  async getContextVersionHistory(
    analystId: string,
    forkType: ForkType,
  ): Promise<AnalystContextVersion[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('analyst_id', analystId)
      .eq('fork_type', forkType)
      .order('version_number', {
        ascending: false,
      })) as SupabaseSelectListResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(
        `Failed to get context version history: ${error.message}`,
      );
      throw new Error(
        `Failed to get context version history: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Get current context versions for all analysts of a specific fork type
   * Useful for capturing version IDs when creating predictions
   */
  async getAllCurrentContextVersions(
    forkType: ForkType,
  ): Promise<Map<string, AnalystContextVersion>> {
    const { data, error } = (await this.db
      .from(this.schema, 'analyst_context_versions')
      .select('*')
      .eq('fork_type', forkType)
      .eq(
        'is_current',
        true,
      )) as SupabaseSelectListResponse<AnalystContextVersion>;

    if (error) {
      this.logger.error(
        `Failed to get all current context versions: ${error.message}`,
      );
      throw new Error(
        `Failed to get all current context versions: ${error.message}`,
      );
    }

    const versionMap = new Map<string, AnalystContextVersion>();
    for (const version of data ?? []) {
      versionMap.set(version.analyst_id, version);
    }

    return versionMap;
  }
}
