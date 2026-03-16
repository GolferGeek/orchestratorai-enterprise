import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  RiskAssessment,
  CreateRiskAssessmentData,
} from '../interfaces/assessment.interface';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

export interface AssessmentFilter {
  includeTest?: boolean;
  testScenarioId?: string;
}

@Injectable()
export class AssessmentRepository {
  private readonly logger = new Logger(AssessmentRepository.name);
  private readonly schema = 'risk';
  private readonly table = 'assessments';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private applyTestFilter<T extends { eq: (col: string, val: unknown) => T }>(
    query: T,
    filter?: AssessmentFilter,
  ): T {
    if (filter?.testScenarioId) {
      query = query.eq('test_scenario_id', filter.testScenarioId);
    } else if (!filter?.includeTest) {
      query = query.eq('is_test', false);
    }
    return query;
  }

  async findBySubject(
    subjectId: string,
    filter?: AssessmentFilter,
  ): Promise<RiskAssessment[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select(
        `
        *,
        dimensions:dimension_id (
          slug,
          name,
          display_name,
          weight
        )
      `,
      )
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as SupabaseSelectListResponse<
      RiskAssessment & {
        dimensions: {
          slug: string;
          name: string;
          display_name: string | null;
          weight: number;
        } | null;
      }
    >;

    if (error) {
      this.logger.error(`Failed to fetch assessments: ${error.message}`);
      throw new Error(`Failed to fetch assessments: ${error.message}`);
    }

    // Map dimension data to flat assessment structure
    return (data ?? []).map((assessment) => ({
      ...assessment,
      dimension_slug: assessment.dimensions?.slug,
      dimension_name:
        assessment.dimensions?.display_name || assessment.dimensions?.name,
      dimension_weight: assessment.dimensions?.weight,
      dimensions: undefined, // Remove nested object
    }));
  }

  /**
   * Find the latest assessment for a subject and dimension
   */
  async findLatestBySubjectAndDimension(
    subjectId: string,
    dimensionId: string,
    filter?: AssessmentFilter,
  ): Promise<RiskAssessment | null> {
    let query = this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('subject_id', subjectId)
      .eq('dimension_id', dimensionId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<RiskAssessment>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch latest assessment: ${error.message}`);
      throw new Error(`Failed to fetch latest assessment: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all assessments for a task (all dimensions analyzed in one run)
   */
  async findByTask(taskId: string): Promise<RiskAssessment[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', {
        ascending: true,
      })) as SupabaseSelectListResponse<RiskAssessment>;

    if (error) {
      this.logger.error(
        `Failed to fetch assessments by task: ${error.message}`,
      );
      throw new Error(`Failed to fetch assessments by task: ${error.message}`);
    }

    return data ?? [];
  }

  async findById(id: string): Promise<RiskAssessment | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<RiskAssessment>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch assessment: ${error.message}`);
      throw new Error(`Failed to fetch assessment: ${error.message}`);
    }

    return data;
  }

  async findByIdOrThrow(id: string): Promise<RiskAssessment> {
    const assessment = await this.findById(id);
    if (!assessment) {
      throw new NotFoundException(`Assessment not found: ${id}`);
    }
    return assessment;
  }

  async create(
    assessmentData: CreateRiskAssessmentData,
  ): Promise<RiskAssessment> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(assessmentData)
      .select()
      .single()) as SupabaseSelectResponse<RiskAssessment>;

    if (error) {
      this.logger.error(`Failed to create assessment: ${error.message}`);
      throw new Error(`Failed to create assessment: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no assessment returned');
    }

    this.logger.log(`Created assessment: ${data.id} (score: ${data.score})`);
    return data;
  }

  async createBatch(
    assessments: CreateRiskAssessmentData[],
  ): Promise<RiskAssessment[]> {
    if (assessments.length === 0) {
      return [];
    }

    // Use upsert to handle existing assessments (update on conflict)
    // The unique constraint is on (subject_id, dimension_id)
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .upsert(assessments, {
        onConflict: 'subject_id,dimension_id',
        ignoreDuplicates: false, // Update existing rows
      })
      .select()) as SupabaseSelectListResponse<RiskAssessment>;

    if (error) {
      this.logger.error(`Failed to create assessments batch: ${error.message}`);
      throw new Error(`Failed to create assessments batch: ${error.message}`);
    }

    this.logger.log(`Upserted ${data?.length ?? 0} assessments in batch`);
    return data ?? [];
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete assessment: ${error.message}`);
      throw new Error(`Failed to delete assessment: ${error.message}`);
    }

    this.logger.log(`Deleted assessment: ${id}`);
  }

  /**
   * UPSERT with merge - creates or updates assessment for subject-dimension pair.
   * If existing, merges evidence arrays and updates score/reasoning.
   *
   * Merge logic:
   * - score: uses new score (caller should compute weighted avg if needed)
   * - confidence: uses new confidence
   * - reasoning: concatenates with separator showing source
   * - evidence: merges arrays (deduped)
   * - signals: merges arrays
   * - llm_provider/model: updates to new values
   */
  async upsertWithMerge(
    assessmentData: CreateRiskAssessmentData,
  ): Promise<RiskAssessment> {
    const { subject_id, dimension_id } = assessmentData;

    // Check if assessment exists for this subject-dimension pair
    const existing = await this.findLatestBySubjectAndDimension(
      subject_id,
      dimension_id,
      { includeTest: assessmentData.is_test },
    );

    if (existing) {
      // Merge evidence arrays (dedupe)
      const existingEvidence = existing.evidence || [];
      const newEvidence = assessmentData.evidence || [];
      const mergedEvidence = [
        ...new Set([...existingEvidence, ...newEvidence]),
      ];

      // Merge signals arrays
      const existingSignals = existing.signals || [];
      const newSignals = assessmentData.signals || [];
      const mergedSignals = [...existingSignals, ...newSignals];

      // Merge reasoning with source attribution
      let mergedReasoning = assessmentData.reasoning || '';
      if (existing.reasoning && assessmentData.reasoning) {
        const existingSource = existing.llm_model || 'previous';
        const newSource = assessmentData.llm_model || 'new';
        mergedReasoning = `[${newSource}] ${assessmentData.reasoning}\n\n---\n\n[${existingSource}] ${existing.reasoning}`;
      } else if (existing.reasoning) {
        mergedReasoning = existing.reasoning;
      }

      // Update existing assessment
      const { data, error } = (await this.db
        .from(this.schema, this.table)
        .update({
          score: assessmentData.score,
          confidence: assessmentData.confidence,
          reasoning: mergedReasoning,
          evidence: mergedEvidence,
          signals: mergedSignals,
          analyst_response: assessmentData.analyst_response,
          llm_provider: assessmentData.llm_provider,
          llm_model: assessmentData.llm_model,
        })
        .eq('id', existing.id)
        .select()
        .single()) as SupabaseSelectResponse<RiskAssessment>;

      if (error) {
        this.logger.error(`Failed to update assessment: ${error.message}`);
        throw new Error(`Failed to update assessment: ${error.message}`);
      }

      this.logger.log(
        `Updated assessment ${existing.id} for ${subject_id}/${dimension_id}`,
      );
      return data!;
    }

    // No existing assessment, create new
    return this.create(assessmentData);
  }

  /**
   * Find recent assessments for a subject (for history/timeline)
   */
  async findRecentBySubject(
    subjectId: string,
    limit: number = 10,
    filter?: AssessmentFilter,
  ): Promise<RiskAssessment[]> {
    let query = this.db
      .from(this.schema, this.table)
      .select(
        `
        *,
        dimensions:dimension_id (
          slug,
          name,
          display_name,
          weight
        )
      `,
      )
      .eq('subject_id', subjectId);

    query = this.applyTestFilter(query, filter);

    const { data, error } = (await query
      .order('created_at', { ascending: false })
      .limit(limit)) as SupabaseSelectListResponse<
      RiskAssessment & {
        dimensions: {
          slug: string;
          name: string;
          display_name: string | null;
          weight: number;
        } | null;
      }
    >;

    if (error) {
      this.logger.error(`Failed to fetch recent assessments: ${error.message}`);
      throw new Error(`Failed to fetch recent assessments: ${error.message}`);
    }

    // Map dimension data to flat assessment structure
    return (data ?? []).map((assessment) => ({
      ...assessment,
      dimension_slug: assessment.dimensions?.slug,
      dimension_name:
        assessment.dimensions?.display_name || assessment.dimensions?.name,
      dimension_weight: assessment.dimensions?.weight,
      dimensions: undefined, // Remove nested object
    }));
  }
}
