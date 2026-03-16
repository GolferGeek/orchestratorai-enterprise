import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskSubject,
  CreateRiskSubjectData,
  UpdateRiskSubjectData,
} from '../interfaces/subject.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface SubjectFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class SubjectRepository {
  private readonly logger = new Logger(SubjectRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'subjects';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: SubjectFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findByScope(
    scopeId: string,
    filter?: SubjectFilter,
  ): Promise<RiskSubject[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('identifier', {
      ascending: true,
    })) as SupabaseSelectListResponse<RiskSubject>;

    if (error) {
      this.logger.error(`Failed to fetch subjects: ${error.message}`);
      throw new Error(`Failed to fetch subjects: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskSubject | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskSubject>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch subject: ${error.message}`);
      throw new Error(`Failed to fetch subject: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskSubject> {
    const subject = await this.findById(id);
    if (!subject) {
      throw new NotFoundException(`Subject not found: ${id}`);
    }
    return subject;
  }

  async findByIdentifier(
    scopeId: string,
    identifier: string,
  ): Promise<RiskSubject | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('identifier', identifier)
      .single()) as SupabaseSelectResponse<RiskSubject>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch subject by identifier: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch subject by identifier: ${error.message}`,
      );
    }

    return data;
  }

  async create(subjectData: CreateRiskSubjectData): Promise<RiskSubject> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(subjectData)
      .select()
      .single()) as SupabaseSelectResponse<RiskSubject>;

    if (error) {
      this.logger.error(`Failed to create subject: ${error.message}`);
      throw new Error(`Failed to create subject: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no subject returned');
    }

    this.logger.log(`Created subject: ${data.id} (${data.identifier})`);
    return data;
  }

  async update(
    id: string,
    updateData: UpdateRiskSubjectData,
  ): Promise<RiskSubject> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<RiskSubject>;

    if (error) {
      this.logger.error(`Failed to update subject: ${error.message}`);
      throw new Error(`Failed to update subject: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no subject returned');
    }

    this.logger.log(`Updated subject: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete subject: ${error.message}`);
      throw new Error(`Failed to delete subject: ${error.message}`);
    }

    this.logger.log(`Deleted subject: ${id}`);
  }

  /**
   * Find all active subjects across all scopes
   * Used by batch runners that process system-wide
   */
  async findAllActive(filter?: SubjectFilter): Promise<RiskSubject[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<RiskSubject>;

    if (error) {
      this.logger.error(
        `Failed to fetch all active subjects: ${error.message}`,
      );
      throw new Error(`Failed to fetch all active subjects: ${error.message}`);
    }

    return data ?? [];
  }

  async findByType(
    scopeId: string,
    subjectType: string,
    filter?: SubjectFilter,
  ): Promise<RiskSubject[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scope_id', scopeId)
      .eq('subject_type', subjectType)
      .eq('is_active', true);

    query = this.applyTestFilter(query, filter);

    const { data, error } =
      (await query) as SupabaseSelectListResponse<RiskSubject>;

    if (error) {
      this.logger.error(`Failed to fetch subjects by type: ${error.message}`);
      throw new Error(`Failed to fetch subjects by type: ${error.message}`);
    }

    return data ?? [];
  }
}
