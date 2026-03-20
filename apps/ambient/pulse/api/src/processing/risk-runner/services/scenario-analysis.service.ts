/**
 * Scenario Analysis Service
 *
 * Enables "what-if" analysis by applying hypothetical adjustments
 * to dimension scores and calculating projected overall risk.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  asArray,
  asNumber,
  asPostgrestResult,
  asRecord,
  asString,
  isRecord,
  type UnknownRecord,
} from '../utils/safe-access';

export interface ScenarioAdjustment {
  dimensionSlug: string;
  adjustment: number; // -1.0 to +1.0 (represents score change)
}

export interface ScenarioSubjectResult {
  subjectId: string;
  subjectName: string;
  baselineScore: number;
  adjustedScore: number;
  change: number;
  changePercent: number;
  dimensionDetails: Array<{
    dimensionSlug: string;
    baselineScore: number;
    adjustedScore: number;
    adjustment: number;
  }>;
}

export interface ScenarioResult {
  scenarioName: string;
  adjustments: Record<string, number>;
  portfolioBaseline: number;
  portfolioAdjusted: number;
  portfolioChange: number;
  portfolioChangePercent: number;
  subjectResults: ScenarioSubjectResult[];
  riskDistributionBefore: Record<string, number>;
  riskDistributionAfter: Record<string, number>;
}

export interface Scenario {
  id: string;
  scope_id: string;
  name: string;
  description: string | null;
  adjustments: Record<string, number>;
  baseline_snapshot: Record<string, unknown>;
  results: ScenarioResult | null;
  is_template: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type SubjectRow = {
  id: string;
  name: string;
  identifier: string;
  scope_id?: string;
};
type DimensionRow = { id: string; slug: string; name: string; weight: number };
type CompositeScoreRow = {
  id: string;
  subject_id: string;
  overall_score: number;
  dimension_scores: UnknownRecord;
};

@Injectable()
export class ScenarioAnalysisService {
  private readonly logger = new Logger(ScenarioAnalysisService.name);
  private readonly schema = 'risk';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Run a scenario analysis without saving
   */
  async runScenario(
    scopeId: string,
    name: string,
    adjustments: ScenarioAdjustment[],
  ): Promise<ScenarioResult> {
    this.logger.log(`Running scenario "${name}" for scope ${scopeId}`);

    // Get current baseline data
    const [subjects, dimensions, compositeScores] = await Promise.all([
      this.getSubjects(scopeId),
      this.getDimensions(scopeId),
      this.getCompositeScores(scopeId),
    ]);

    // Build adjustment map
    const adjustmentMap = new Map<string, number>();
    for (const adj of adjustments) {
      adjustmentMap.set(adj.dimensionSlug, adj.adjustment);
    }

    // Calculate adjusted scores for each subject
    const subjectResults: ScenarioSubjectResult[] = [];

    for (const score of compositeScores) {
      const subject = subjects.find((s) => s.id === score.subject_id);
      if (!subject) continue;

      const dimensionDetails: ScenarioSubjectResult['dimensionDetails'] = [];
      let totalAdjustedWeight = 0;
      let totalAdjustedScore = 0;

      const dimensionScores = score.dimension_scores || {};

      for (const dim of dimensions) {
        const dimData = dimensionScores[dim.slug];
        const baselineScoreRaw =
          typeof dimData === 'object' &&
          dimData !== null &&
          !Array.isArray(dimData)
            ? (asNumber((dimData as UnknownRecord)['score']) ?? 0)
            : (asNumber(dimData) ?? 0);
        const weight =
          typeof dimData === 'object' &&
          dimData !== null &&
          !Array.isArray(dimData)
            ? (asNumber((dimData as UnknownRecord)['weight']) ?? dim.weight)
            : dim.weight;

        // Normalize: if score > 1, it's stored as 0-100, convert to 0-1
        const baselineScore =
          baselineScoreRaw > 1 ? baselineScoreRaw / 100 : baselineScoreRaw;

        const adjustment = adjustmentMap.get(dim.slug) ?? 0;
        // Apply adjustment, clamping between 0 and 1
        const adjustedScore = Math.max(
          0,
          Math.min(1, baselineScore + adjustment),
        );

        dimensionDetails.push({
          dimensionSlug: dim.slug,
          baselineScore,
          adjustedScore,
          adjustment,
        });

        totalAdjustedWeight += weight;
        totalAdjustedScore += adjustedScore * weight;
      }

      // Normalize overall_score: if > 1, it's stored as 0-100, convert to 0-1
      const overallScoreRaw = score.overall_score ?? 0;
      const baselineScore =
        overallScoreRaw > 1 ? overallScoreRaw / 100 : overallScoreRaw;
      const adjustedScore =
        totalAdjustedWeight > 0
          ? totalAdjustedScore / totalAdjustedWeight
          : baselineScore;

      subjectResults.push({
        subjectId: subject.id,
        subjectName: subject.name,
        baselineScore,
        adjustedScore,
        change: adjustedScore - baselineScore,
        changePercent:
          baselineScore > 0
            ? ((adjustedScore - baselineScore) / baselineScore) * 100
            : 0,
        dimensionDetails,
      });
    }

    // Calculate portfolio-level changes
    const portfolioBaseline =
      subjectResults.length > 0
        ? subjectResults.reduce((sum, r) => sum + r.baselineScore, 0) /
          subjectResults.length
        : 0;

    const portfolioAdjusted =
      subjectResults.length > 0
        ? subjectResults.reduce((sum, r) => sum + r.adjustedScore, 0) /
          subjectResults.length
        : 0;

    // Calculate risk distributions
    const riskDistributionBefore = this.calculateRiskDistribution(
      subjectResults.map((r) => r.baselineScore),
    );
    const riskDistributionAfter = this.calculateRiskDistribution(
      subjectResults.map((r) => r.adjustedScore),
    );

    return {
      scenarioName: name,
      adjustments: Object.fromEntries(adjustmentMap),
      portfolioBaseline,
      portfolioAdjusted,
      portfolioChange: portfolioAdjusted - portfolioBaseline,
      portfolioChangePercent:
        portfolioBaseline > 0
          ? ((portfolioAdjusted - portfolioBaseline) / portfolioBaseline) * 100
          : 0,
      subjectResults,
      riskDistributionBefore,
      riskDistributionAfter,
    };
  }

  /**
   * Save a scenario
   */
  async saveScenario(params: {
    scopeId: string;
    name: string;
    description?: string;
    adjustments: ScenarioAdjustment[];
    results?: ScenarioResult;
    isTemplate?: boolean;
    createdBy?: string;
  }): Promise<Scenario> {
    const adjustmentMap: Record<string, number> = {};
    for (const adj of params.adjustments) {
      adjustmentMap[adj.dimensionSlug] = adj.adjustment;
    }

    // Capture baseline snapshot
    const baseline = await this.captureBaseline(params.scopeId);

    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'scenarios')
        .insert({
          scope_id: params.scopeId,
          name: params.name,
          description: params.description || null,
          adjustments: adjustmentMap,
          baseline_snapshot: baseline,
          results: params.results || null,
          is_template: params.isTemplate ?? false,
          created_by: params.createdBy || null,
        })
        .select()
        .single(),
    );

    if (result.error?.message) {
      this.logger.error(`Failed to save scenario: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return asRecord(result.data) as unknown as Scenario;
  }

  /**
   * List scenarios for a scope
   */
  async listScenarios(
    scopeId: string,
    options?: { includeTemplates?: boolean },
  ): Promise<Scenario[]> {
    let query = this.db
      .from(this.schema, 'scenarios')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false });

    if (!options?.includeTemplates) {
      query = query.eq('is_template', false);
    }

    const { data, error } = (await query) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to list scenarios: ${error.message}`);
      throw new Error((error as { message: string }).message);
    }

    return (data || []) as Scenario[];
  }

  /**
   * Get a specific scenario
   */
  async getScenario(id: string): Promise<Scenario | null> {
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'scenarios')
        .select('*')
        .eq('id', id)
        .single(),
    );

    if (result.error?.message && result.error.code !== 'PGRST116') {
      this.logger.error(`Failed to get scenario: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return (asRecord(result.data) as unknown as Scenario | null) ?? null;
  }

  /**
   * Delete a scenario
   */
  async deleteScenario(id: string): Promise<void> {
    const { error } = (await this.db
      .from(this.schema, 'scenarios')
      .delete()
      .eq('id', id)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to delete scenario: ${error.message}`);
      throw new Error((error as { message: string }).message);
    }
  }

  /**
   * Get scenario templates
   */
  async getTemplates(): Promise<Scenario[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'scenarios')
      .select('*')
      .eq('is_template', true)
      .order('name')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get templates: ${error.message}`);
      throw new Error((error as { message: string }).message);
    }

    return (data || []) as Scenario[];
  }

  /**
   * Get subjects for a scope
   */
  private async getSubjects(scopeId: string): Promise<SubjectRow[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'subjects')
      .select('id, name, identifier')
      .eq('scope_id', scopeId)
      .eq('is_active', true)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get subjects: ${error.message}`);
      return [];
    }

    const rows = (asArray(data) ?? []).filter(isRecord);
    return rows.map((row) => ({
      id: asString(row['id']) ?? '',
      name: asString(row['name']) ?? '',
      identifier: asString(row['identifier']) ?? '',
    }));
  }

  /**
   * Get dimensions for a scope
   */
  private async getDimensions(scopeId: string): Promise<DimensionRow[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'dimensions')
      .select('id, slug, name, weight')
      .eq('scope_id', scopeId)
      .eq('is_active', true)
      .order('display_order')) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get dimensions: ${error.message}`);
      return [];
    }

    const rows = (asArray(data) ?? []).filter(isRecord);
    return rows.map((row) => ({
      id: asString(row['id']) ?? '',
      slug: asString(row['slug']) ?? '',
      name: asString(row['name']) ?? '',
      weight: asNumber(row['weight']) ?? 0,
    }));
  }

  /**
   * Get composite scores for a scope
   */
  private async getCompositeScores(
    scopeId: string,
  ): Promise<CompositeScoreRow[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'composite_scores')
      .select(
        `
        id,
        subject_id,
        overall_score,
        dimension_scores,
        subjects!inner(scope_id)
      `,
      )
      .eq('subjects.scope_id', scopeId)
      .eq('status', 'active')
      .eq('is_test', false)) as QueryResult<unknown>;

    if (error) {
      this.logger.error(`Failed to get composite scores: ${error.message}`);
      return [];
    }

    const rows = (asArray(data) ?? []).filter(isRecord);
    return rows.map((row) => ({
      id: asString(row['id']) ?? '',
      subject_id: asString(row['subject_id']) ?? '',
      overall_score: asNumber(row['overall_score']) ?? 0,
      dimension_scores: asRecord(row['dimension_scores']) ?? {},
    }));
  }

  /**
   * Capture baseline snapshot for a scope
   */
  private async captureBaseline(
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const [subjects, dimensions, scores] = await Promise.all([
      this.getSubjects(scopeId),
      this.getDimensions(scopeId),
      this.getCompositeScores(scopeId),
    ]);

    return {
      capturedAt: new Date().toISOString(),
      subjectCount: subjects.length,
      dimensionCount: dimensions.length,
      avgScore:
        scores.length > 0
          ? scores.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) /
            scores.length
          : 0,
      scores: scores.map((s) => ({
        subjectId: s.subject_id,
        overallScore: s.overall_score,
        dimensionScores: s.dimension_scores,
      })),
    };
  }

  /**
   * Calculate risk distribution from scores
   */
  private calculateRiskDistribution(scores: number[]): Record<string, number> {
    const distribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const score of scores) {
      if (score >= 0.7) {
        distribution.critical++;
      } else if (score >= 0.5) {
        distribution.high++;
      } else if (score >= 0.3) {
        distribution.medium++;
      } else {
        distribution.low++;
      }
    }

    return distribution;
  }
}
