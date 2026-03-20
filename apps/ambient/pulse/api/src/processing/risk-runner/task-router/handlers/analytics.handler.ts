/**
 * Analytics Handler
 *
 * Dashboard handler for advanced risk analytics features:
 * - Score history (Feature 1)
 * - Subject comparison (Feature 2)
 * - Heatmap data (Feature 4)
 * - Portfolio aggregate (Feature 6)
 * - Correlation analysis (Feature 7)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '../../../../shared/pulse-types';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { CompositeScoreRepository } from '../../repositories/composite-score.repository';
import { DimensionRepository } from '../../repositories/dimension.repository';
import { SubjectRepository } from '../../repositories/subject.repository';
import {
  asArray,
  asNumber,
  asPostgrestResult,
  asRecord,
  asString,
  isRecord,
  type UnknownRecord,
} from '../../utils/safe-access';

@Injectable()
export class AnalyticsHandler implements IDashboardHandler {
  private readonly logger = new Logger(AnalyticsHandler.name);
  private readonly schema = 'risk';
  private readonly supportedActions = [
    'score-history',
    'score-trends',
    'scope-score-history',
    'heatmap',
    'portfolio-aggregate',
    'risk-distribution',
    'dimension-contributions',
    'correlations',
    'compare-subjects',
    'save-comparison',
    'list-comparisons',
    'delete-comparison',
  ];

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly compositeScoreRepository: CompositeScoreRepository,
    private readonly dimensionRepository: DimensionRepository,
    private readonly subjectRepository: SubjectRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(`Executing analytics action: ${action}`);

    switch (action.toLowerCase()) {
      case 'score-history':
        return this.handleScoreHistory(payload);
      case 'score-trends':
        return this.handleScoreTrends(payload);
      case 'scope-score-history':
        return this.handleScopeScoreHistory(payload);
      case 'heatmap':
        return this.handleHeatmap(payload);
      case 'portfolio-aggregate':
        return this.handlePortfolioAggregate(payload);
      case 'risk-distribution':
        return this.handleRiskDistribution(payload);
      case 'dimension-contributions':
        return this.handleDimensionContributions(payload);
      case 'correlations':
        return this.handleCorrelations(payload);
      case 'compare-subjects':
        return this.handleCompareSubjects(payload);
      case 'save-comparison':
        return this.handleSaveComparison(payload);
      case 'list-comparisons':
        return this.handleListComparisons(payload);
      case 'delete-comparison':
        return this.handleDeleteComparison(payload);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported analytics action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  /**
   * Get score history for a subject
   * Action: analytics.score-history
   * Params: { subjectId: string, days?: number, limit?: number }
   */
  private async handleScoreHistory(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectId = params?.subjectId as string | undefined;
    const days = (params?.days as number) ?? 30;
    const limit = (params?.limit as number) ?? 100;

    if (!subjectId) {
      return buildDashboardError(
        'MISSING_SUBJECT_ID',
        'Subject ID is required for score history',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db.rpc(
          'get_score_history',
          {
            p_subject_id: subjectId,
            p_days: days,
            p_limit: limit,
          },
          this.schema,
        ),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to get score history: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform to frontend format
      const rows = (asArray(result.data) ?? []).filter(isRecord);
      const history = rows.map((row) => ({
        id: asString(row['id']) ?? '',
        overallScore: asNumber(row['overall_score']) ?? 0,
        dimensionScores: asRecord(row['dimension_scores']) ?? {},
        confidence: asNumber(row['confidence']) ?? 0,
        previousScore: asNumber(row['previous_score']),
        scoreChange: asNumber(row['score_change']),
        scoreChangePercent: asNumber(row['score_change_percent']),
        debateAdjustment: asNumber(row['debate_adjustment']) ?? 0,
        createdAt: asString(row['created_at']) ?? '',
      }));

      return buildDashboardSuccess(history, {
        subjectId,
        days,
        count: history.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get score history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SCORE_HISTORY_FAILED',
        error instanceof Error ? error.message : 'Failed to get score history',
      );
    }
  }

  /**
   * Get score trends for all subjects in a scope
   * Action: analytics.score-trends
   * Params: { scopeId: string }
   */
  private async handleScoreTrends(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for score trends',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db
          .from(this.schema, 'score_trends')
          .select(
            `
          subject_id,
          current_score,
          change_7d,
          change_30d,
          total_assessments,
          avg_score,
          max_score,
          min_score,
          score_stddev,
          first_assessment,
          latest_assessment
        `,
          )
          .eq('subject_id', scopeId),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to get score trends: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform to frontend format
      const rows = (asArray(result.data) ?? []).filter(isRecord);
      const trends = rows.map((row) => ({
        subjectId: asString(row['subject_id']) ?? '',
        currentScore: asNumber(row['current_score']) ?? 0,
        change7d: asNumber(row['change_7d']) ?? 0,
        change30d: asNumber(row['change_30d']) ?? 0,
        totalAssessments: asNumber(row['total_assessments']) ?? 0,
        avgScore: asNumber(row['avg_score']) ?? 0,
        maxScore: asNumber(row['max_score']) ?? 0,
        minScore: asNumber(row['min_score']) ?? 0,
        scoreStddev: asNumber(row['score_stddev']) ?? 0,
        firstAssessment: asString(row['first_assessment']) ?? '',
        latestAssessment: asString(row['latest_assessment']) ?? '',
      }));

      return buildDashboardSuccess(trends, { scopeId, count: trends.length });
    } catch (error) {
      this.logger.error(
        `Failed to get score trends: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SCORE_TRENDS_FAILED',
        error instanceof Error ? error.message : 'Failed to get score trends',
      );
    }
  }

  /**
   * Get score history for all subjects in a scope
   * Action: analytics.scope-score-history
   * Params: { scopeId: string, days?: number }
   */
  private async handleScopeScoreHistory(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const days = (params?.days as number) ?? 30;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for scope score history',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db.rpc(
          'get_scope_score_history',
          {
            p_scope_id: scopeId,
            p_days: days,
          },
          this.schema,
        ),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to get scope score history: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform to frontend format
      const rows = (asArray(result.data) ?? []).filter(isRecord);
      const history = rows.map((row) => ({
        subjectId: asString(row['subject_id']) ?? '',
        subjectName: asString(row['subject_name']) ?? '',
        subjectIdentifier: asString(row['subject_identifier']) ?? '',
        scores: asArray(row['scores']) ?? [],
      }));

      return buildDashboardSuccess(history, { scopeId, days });
    } catch (error) {
      this.logger.error(
        `Failed to get scope score history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SCOPE_HISTORY_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get scope score history',
      );
    }
  }

  /**
   * Get heatmap data for a scope
   * Action: analytics.heatmap
   * Params: { scopeId: string, riskLevel?: string }
   */
  private async handleHeatmap(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const riskLevel = params?.riskLevel as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for heatmap',
      );
    }

    try {
      // Get dimensions for the scope
      const dimensions = await this.dimensionRepository.findByScope(scopeId);

      // Get heatmap data
      const heatmapResult = asPostgrestResult(
        await this.db.rpc(
          'get_heatmap_data',
          {
            p_scope_id: scopeId,
            p_risk_level: riskLevel || null,
          },
          this.schema,
        ),
      );

      if (heatmapResult.error?.message) {
        this.logger.error(
          `Failed to get heatmap data: ${heatmapResult.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', heatmapResult.error.message);
      }

      // Get scope info
      const scopeResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'scopes')
          .select('id, name')
          .eq('id', scopeId)
          .single(),
      );
      const scopeData = asRecord(scopeResult.data);

      // Transform to frontend format
      const rows = (asArray(heatmapResult.data) ?? [])
        .filter(isRecord)
        .map((row) => ({
          subjectId: asString(row['subject_id']) ?? '',
          subjectName: asString(row['subject_name']) ?? '',
          subjectIdentifier: asString(row['subject_identifier']) ?? '',
          subjectType: asString(row['subject_type']) ?? '',
          dimensions: asArray(row['dimensions']) ?? [],
        }));

      return buildDashboardSuccess(
        {
          rows,
          dimensions: dimensions.map((d) => ({
            id: d.id,
            slug: d.slug,
            name: d.name,
            displayName: d.display_name,
            icon: d.icon,
            color: d.color,
            displayOrder: d.display_order,
          })),
          scopeId,
          scopeName: asString(scopeData?.['name']) ?? '',
        },
        {
          subjectCount: rows.length,
          dimensionCount: dimensions.length,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to get heatmap: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'HEATMAP_FAILED',
        error instanceof Error ? error.message : 'Failed to get heatmap',
      );
    }
  }

  /**
   * Get portfolio aggregate statistics
   * Action: analytics.portfolio-aggregate
   * Params: { scopeId: string }
   */
  private async handlePortfolioAggregate(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for portfolio aggregate',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db
          .from(this.schema, 'portfolio_aggregate')
          .select('*')
          .eq('scope_id', scopeId)
          .single(),
      );

      if (result.error?.message && result.error.code !== 'PGRST116') {
        this.logger.error(
          `Failed to get portfolio aggregate: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      const row = asRecord(result.data);
      if (!row) {
        return buildDashboardSuccess({
          scopeId,
          scopeName: '',
          domain: '',
          subjectCount: 0,
          avgScore: 0,
          maxScore: 0,
          minScore: 0,
          scoreStddev: 0,
          avgConfidence: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          latestAssessment: null,
          oldestAssessment: null,
        });
      }

      // Transform to frontend format
      return buildDashboardSuccess({
        scopeId: asString(row['scope_id']) ?? '',
        scopeName: asString(row['scope_name']) ?? '',
        domain: asString(row['domain']) ?? '',
        subjectCount: asNumber(row['subject_count']) ?? 0,
        avgScore: asNumber(row['avg_score']) ?? 0,
        maxScore: asNumber(row['max_score']) ?? 0,
        minScore: asNumber(row['min_score']) ?? 0,
        scoreStddev: asNumber(row['score_stddev']) ?? 0,
        avgConfidence: asNumber(row['avg_confidence']) ?? 0,
        criticalCount: asNumber(row['critical_count']) ?? 0,
        highCount: asNumber(row['high_count']) ?? 0,
        mediumCount: asNumber(row['medium_count']) ?? 0,
        lowCount: asNumber(row['low_count']) ?? 0,
        latestAssessment: asString(row['latest_assessment']),
        oldestAssessment: asString(row['oldest_assessment']),
      });
    } catch (error) {
      this.logger.error(
        `Failed to get portfolio aggregate: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'AGGREGATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get portfolio aggregate',
      );
    }
  }

  /**
   * Get risk distribution for a scope
   * Action: analytics.risk-distribution
   * Params: { scopeId: string }
   */
  private async handleRiskDistribution(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for risk distribution',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db
          .from(this.schema, 'risk_distribution')
          .select('*')
          .eq('scope_id', scopeId),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to get risk distribution: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform to frontend format with proper order
      const orderMap = { critical: 0, high: 1, medium: 2, low: 3 };
      const distribution = (asArray(result.data) ?? [])
        .filter(isRecord)
        .map((row) => ({
          riskLevel: asString(row['risk_level']) ?? 'low',
          color: asString(row['color']) ?? '',
          count: asNumber(row['count']) ?? 0,
          percentage: asNumber(row['percentage']) ?? 0,
        }))
        .sort(
          (a, b) =>
            (orderMap[a.riskLevel as keyof typeof orderMap] || 0) -
            (orderMap[b.riskLevel as keyof typeof orderMap] || 0),
        );

      return buildDashboardSuccess(distribution, { scopeId });
    } catch (error) {
      this.logger.error(
        `Failed to get risk distribution: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DISTRIBUTION_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get risk distribution',
      );
    }
  }

  /**
   * Get dimension contributions to overall risk
   * Action: analytics.dimension-contributions
   * Params: { scopeId: string }
   */
  private async handleDimensionContributions(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for dimension contributions',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db
          .from(this.schema, 'dimension_contribution')
          .select('*')
          .eq('scope_id', scopeId),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to get dimension contributions: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform to frontend format
      const contributions = (asArray(result.data) ?? [])
        .filter(isRecord)
        .map((row) => ({
          dimensionId: asString(row['dimension_id']) ?? '',
          dimensionSlug: asString(row['dimension_slug']) ?? '',
          dimensionName: asString(row['dimension_name']) ?? '',
          icon: asString(row['dimension_icon']),
          color: asString(row['dimension_color']),
          weight: asNumber(row['weight']) ?? 0,
          assessmentCount: asNumber(row['assessment_count']) ?? 0,
          avgScore: asNumber(row['avg_score']) ?? 0,
          avgConfidence: asNumber(row['avg_confidence']) ?? 0,
          maxScore: asNumber(row['max_score']) ?? 0,
          minScore: asNumber(row['min_score']) ?? 0,
          weightedContribution: asNumber(row['weighted_contribution']) ?? 0,
        }));

      return buildDashboardSuccess(contributions, {
        scopeId,
        count: contributions.length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get dimension contributions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CONTRIBUTIONS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get dimension contributions',
      );
    }
  }

  /**
   * Get correlation matrix for dimensions
   * Action: analytics.correlations
   * Params: { scopeId: string }
   */
  private async handleCorrelations(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required for correlations',
      );
    }

    try {
      // Get dimensions
      const dimensions = await this.dimensionRepository.findByScope(scopeId);

      // Calculate correlations
      const result = asPostgrestResult(
        await this.db.rpc(
          'calculate_correlations',
          { p_scope_id: scopeId },
          this.schema,
        ),
      );

      if (result.error?.message) {
        this.logger.error(
          `Failed to calculate correlations: ${result.error.message}`,
        );
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      // Transform correlations
      const correlations = (asArray(result.data) ?? [])
        .filter(isRecord)
        .map((row) => ({
          dimension1Id: asString(row['dimension1_id']) ?? '',
          dimension1Slug: asString(row['dimension1_slug']) ?? '',
          dimension1Name: asString(row['dimension1_name']) ?? '',
          dimension2Id: asString(row['dimension2_id']) ?? '',
          dimension2Slug: asString(row['dimension2_slug']) ?? '',
          dimension2Name: asString(row['dimension2_name']) ?? '',
          correlation: asNumber(row['correlation']) ?? 0,
          sampleSize: asNumber(row['sample_size']) ?? 0,
        }));

      // Build 2D matrix
      const dimSlugs = dimensions.map((d) => d.slug);
      const matrix: number[][] = dimSlugs.map(() => dimSlugs.map(() => 0));

      // Fill diagonal with 1s
      for (let i = 0; i < dimSlugs.length; i++) {
        const row = matrix[i];
        if (row) {
          row[i] = 1;
        }
      }

      // Fill in correlation values
      for (const corr of correlations) {
        const i = dimSlugs.indexOf(corr.dimension1Slug);
        const j = dimSlugs.indexOf(corr.dimension2Slug);
        if (i >= 0 && j >= 0) {
          const rowI = matrix[i];
          const rowJ = matrix[j];
          if (rowI) rowI[j] = corr.correlation;
          if (rowJ) rowJ[i] = corr.correlation;
        }
      }

      return buildDashboardSuccess(
        {
          dimensions: dimensions.map((d) => ({
            id: d.id,
            slug: d.slug,
            name: d.name,
            displayName: d.display_name,
            icon: d.icon,
            color: d.color,
          })),
          correlations,
          matrix,
        },
        { scopeId, dimensionCount: dimensions.length },
      );
    } catch (error) {
      this.logger.error(
        `Failed to get correlations: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CORRELATIONS_FAILED',
        error instanceof Error ? error.message : 'Failed to get correlations',
      );
    }
  }

  /**
   * Compare multiple subjects
   * Action: analytics.compare-subjects
   * Params: { subjectIds: string[] }
   */
  private async handleCompareSubjects(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const subjectIds = params?.subjectIds as string[] | undefined;

    if (!subjectIds || subjectIds.length < 2) {
      return buildDashboardError(
        'INSUFFICIENT_SUBJECTS',
        'At least 2 subject IDs are required for comparison',
      );
    }

    if (subjectIds.length > 6) {
      return buildDashboardError(
        'TOO_MANY_SUBJECTS',
        'Maximum 6 subjects can be compared at once',
      );
    }

    try {
      // Get subjects
      const subjects = await Promise.all(
        subjectIds.map((id) => this.subjectRepository.findById(id)),
      );
      const validSubjects = subjects.filter((s) => s !== null);

      if (validSubjects.length < 2) {
        return buildDashboardError(
          'SUBJECTS_NOT_FOUND',
          'Could not find enough valid subjects',
        );
      }

      // Get composite scores
      const scoresResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'composite_scores')
          .select('*')
          .in('subject_id', subjectIds)
          .eq('status', 'active')
          .eq('is_test', false)
          .order('created_at', { ascending: false }),
      );

      if (scoresResult.error?.message) {
        return buildDashboardError('QUERY_FAILED', scoresResult.error.message);
      }
      const scoreData = scoresResult.data;

      // Get latest score per subject
      const latestScores = new Map<string, UnknownRecord>();
      for (const scoreRow of (asArray(scoreData) ?? []).filter(isRecord)) {
        const subjectId = asString(scoreRow['subject_id']);
        if (!subjectId) {
          continue;
        }
        if (!latestScores.has(subjectId)) {
          latestScores.set(subjectId, scoreRow);
        }
      }

      // Build dimension comparisons
      const allDimensions = new Set<string>();
      for (const score of latestScores.values()) {
        const dimScores = score.dimension_scores || {};
        Object.keys(dimScores).forEach((key) => allDimensions.add(key));
      }

      // Get dimension info from first subject's scope
      const firstSubject = validSubjects[0];
      const dimensions = await this.dimensionRepository.findByScope(
        firstSubject!.scope_id,
      );
      const dimMap = new Map(dimensions.map((d) => [d.slug, d]));

      // Build comparison data
      const dimensionComparisons = Array.from(allDimensions).map((dimSlug) => {
        const dim = dimMap.get(dimSlug);
        const scores = subjectIds
          .map((subjectId) => {
            const cs = latestScores.get(subjectId);
            const dimScores = asRecord(cs?.['dimension_scores']) ?? {};
            const dimValue = dimScores[dimSlug];
            const dimObj = asRecord(dimValue);
            const score = dimObj
              ? (asNumber(dimObj['score']) ?? 0)
              : (asNumber(dimValue) ?? 0);
            return {
              subjectId,
              score: score ?? 0,
              rank: 0,
            };
          })
          .sort((a, b) => a.score - b.score); // Sort by score ascending (lower = better for risk)

        // Assign ranks
        scores.forEach((s, idx) => {
          s.rank = idx + 1;
        });

        return {
          dimensionSlug: dimSlug,
          dimensionName: dim?.display_name || dim?.name || dimSlug,
          icon: dim?.icon,
          color: dim?.color,
          scores,
        };
      });

      // Calculate overall rankings
      const rankings = subjectIds.map((subjectId) => {
        const subject = validSubjects.find((s) => s?.id === subjectId);
        const cs = latestScores.get(subjectId);
        const overallScore = asNumber(cs?.['overall_score']) ?? 0;
        const dimRanks: Record<string, number> = {};

        dimensionComparisons.forEach((dc) => {
          const scoreData = dc.scores.find((s) => s.subjectId === subjectId);
          dimRanks[dc.dimensionSlug] = scoreData?.rank ?? 0;
        });

        return {
          subjectId,
          subjectName: subject?.name || 'Unknown',
          overallScore,
          overallRank: 0,
          dimensionRanks: dimRanks,
        };
      });

      // Sort and assign overall ranks
      rankings.sort((a, b) => a.overallScore - b.overallScore);
      rankings.forEach((r, idx) => {
        r.overallRank = idx + 1;
      });

      return buildDashboardSuccess({
        subjects: validSubjects.map((s) => ({
          id: s.id,
          scopeId: s.scope_id,
          identifier: s.identifier,
          name: s.name,
          subjectType: s.subject_type,
        })),
        compositeScores: Array.from(latestScores.values()).map((cs) => ({
          id: asString(cs['id']) ?? '',
          subjectId: asString(cs['subject_id']) ?? '',
          overallScore: asNumber(cs['overall_score']) ?? 0,
          dimensionScores: asRecord(cs['dimension_scores']) ?? {},
          confidence: asNumber(cs['confidence']) ?? 0,
          createdAt: asString(cs['created_at']) ?? '',
        })),
        dimensionComparisons,
        rankings,
      });
    } catch (error) {
      this.logger.error(
        `Failed to compare subjects: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'COMPARISON_FAILED',
        error instanceof Error ? error.message : 'Failed to compare subjects',
      );
    }
  }

  /**
   * Save a comparison set
   * Action: analytics.save-comparison
   * Params: { scopeId: string, name: string, subjectIds: string[] }
   */
  private async handleSaveComparison(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;
    const name = params?.name as string | undefined;
    const subjectIds = params?.subjectIds as string[] | undefined;

    if (!scopeId || !name || !subjectIds || subjectIds.length < 2) {
      return buildDashboardError(
        'INVALID_PARAMS',
        'scopeId, name, and at least 2 subjectIds are required',
      );
    }

    try {
      const insertResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'comparisons')
          .insert({
            scope_id: scopeId,
            name,
            subject_ids: subjectIds,
          })
          .select()
          .single(),
      );

      if (insertResult.error?.message) {
        return buildDashboardError('INSERT_FAILED', insertResult.error.message);
      }
      const inserted = asRecord(insertResult.data) ?? {};

      return buildDashboardSuccess({
        id: asString(inserted['id']) ?? '',
        scopeId: asString(inserted['scope_id']) ?? '',
        name: asString(inserted['name']) ?? '',
        subjectIds: (asArray(inserted['subject_ids']) ?? []).filter(
          (id): id is string => typeof id === 'string',
        ),
        createdAt: asString(inserted['created_at']) ?? '',
      });
    } catch (error) {
      this.logger.error(
        `Failed to save comparison: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'SAVE_FAILED',
        error instanceof Error ? error.message : 'Failed to save comparison',
      );
    }
  }

  /**
   * List saved comparisons
   * Action: analytics.list-comparisons
   * Params: { scopeId: string }
   */
  private async handleListComparisons(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const scopeId = params?.scopeId as string | undefined;

    if (!scopeId) {
      return buildDashboardError(
        'MISSING_SCOPE_ID',
        'Scope ID is required to list comparisons',
      );
    }

    try {
      const result = asPostgrestResult(
        await this.db
          .from(this.schema, 'comparisons')
          .select('*')
          .eq('scope_id', scopeId)
          .order('created_at', { ascending: false }),
      );

      if (result.error?.message) {
        return buildDashboardError('QUERY_FAILED', result.error.message);
      }

      const rows = (asArray(result.data) ?? []).filter(isRecord);
      const comparisons = rows.map((row) => ({
        id: asString(row['id']) ?? '',
        scopeId: asString(row['scope_id']) ?? '',
        name: asString(row['name']) ?? '',
        subjectIds: (asArray(row['subject_ids']) ?? []).filter(
          (id): id is string => typeof id === 'string',
        ),
        createdAt: asString(row['created_at']) ?? '',
      }));

      return buildDashboardSuccess(comparisons, { count: comparisons.length });
    } catch (error) {
      this.logger.error(
        `Failed to list comparisons: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error ? error.message : 'Failed to list comparisons',
      );
    }
  }

  /**
   * Delete a comparison
   * Action: analytics.delete-comparison
   * Params: { id: string }
   */
  private async handleDeleteComparison(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const params = payload.params as Record<string, unknown> | undefined;
    const id = params?.id as string | undefined;

    if (!id) {
      return buildDashboardError('MISSING_ID', 'Comparison ID is required');
    }

    try {
      const { error } = await this.db
        .from(this.schema, 'comparisons')
        .delete()
        .eq('id', id);

      if (error) {
        return buildDashboardError('DELETE_FAILED', error.message);
      }

      return buildDashboardSuccess({ success: true });
    } catch (error) {
      this.logger.error(
        `Failed to delete comparison: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error ? error.message : 'Failed to delete comparison',
      );
    }
  }
}
