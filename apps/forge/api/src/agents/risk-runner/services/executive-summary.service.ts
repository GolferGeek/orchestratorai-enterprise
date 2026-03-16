/* eslint-disable @typescript-eslint/no-unsafe-argument */
// Disabled unsafe rules due to Supabase RPC calls returning generic 'any' types
/**
 * Executive Summary Service
 *
 * Generates AI-powered executive summaries for portfolio risk reporting.
 * Uses portfolio aggregate data and key risk indicators to produce
 * concise, actionable insights for stakeholders.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import {
  asArray,
  asNumber,
  asPostgrestResult,
  asRecord,
  asString,
  isRecord,
  type UnknownRecord,
} from '../utils/safe-access';

export interface ExecutiveSummaryContent {
  headline: string;
  status: 'critical' | 'high' | 'medium' | 'low' | 'stable';
  keyFindings: string[];
  recommendations: string[];
  riskHighlights: {
    topRisks: Array<{
      subject: string;
      subjectId?: string;
      score: number;
      dimension: string;
    }>;
    recentChanges: Array<{
      subject: string;
      subjectId?: string;
      change: number;
      direction: 'up' | 'down';
    }>;
  };
}

export interface ExecutiveSummary {
  id: string;
  scope_id: string;
  summary_type: string;
  content: ExecutiveSummaryContent;
  risk_snapshot: Record<string, unknown>;
  generated_by: string;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateSummaryInput {
  scopeId: string;
  summaryType?: 'daily' | 'weekly' | 'ad-hoc';
  forceRefresh?: boolean;
  context: ExecutionContext;
}

export interface GenerateSummaryResult {
  summary: ExecutiveSummary;
  cached: boolean;
}

type TopRisk = {
  subjectId: string;
  subjectName: string;
  overallScore: number;
  dimensionScores: UnknownRecord;
};

type RecentChange = {
  subjectId: string;
  subjectName: string;
  currentScore: number;
  previousScore: number | null;
  change: number;
  direction: 'up' | 'down';
  changedAt: string;
};

@Injectable()
export class ExecutiveSummaryService {
  private readonly logger = new Logger(ExecutiveSummaryService.name);
  private readonly schema = 'risk';

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Optional()
    private readonly observabilityEvents?: ObservabilityEventsService,
  ) {}

  /**
   * Emit a progress event for real-time UI updates
   */
  private emitProgress(
    context: ExecutionContext,
    step: string,
    message: string,
    progress: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.observabilityEvents) return;

    void this.observabilityEvents.push({
      context,
      source_app: 'risk-summary',
      hook_event_type: 'risk.summary.progress',
      status: 'in_progress',
      message,
      progress,
      step,
      payload: {
        mode: 'summary',
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Generate an executive summary for a scope
   *
   * If a recent summary exists (less than 1 hour old), returns cached version.
   * Otherwise generates a new summary using LLM.
   */
  async generateSummary(
    input: GenerateSummaryInput,
  ): Promise<GenerateSummaryResult> {
    const {
      scopeId,
      summaryType = 'ad-hoc',
      forceRefresh = false,
      context,
    } = input;

    this.logger.log(
      `Generating executive summary for scope ${scopeId}, type: ${summaryType}, forceRefresh: ${forceRefresh}`,
    );

    // Emit: Summary starting
    this.emitProgress(
      context,
      'summary-starting',
      'Starting executive summary generation...',
      0,
      {
        scopeId,
        summaryType,
      },
    );

    // Check for cached summary (less than 1 hour old for ad-hoc, or matching type for scheduled)
    // Skip cache check if forceRefresh is true
    if (!forceRefresh) {
      this.emitProgress(
        context,
        'checking-cache',
        'Checking for cached summary...',
        10,
        {
          scopeId,
        },
      );

      const cached = await this.findCachedSummary(scopeId, summaryType);
      if (cached) {
        this.logger.debug('Returning cached executive summary');
        this.emitProgress(context, 'cache-hit', 'Found cached summary', 100, {
          scopeId,
          cached: true,
        });
        return { summary: cached, cached: true };
      }
    } else {
      this.logger.debug('Skipping cache due to forceRefresh');
    }

    // Gather risk data for the summary
    this.emitProgress(
      context,
      'gathering-data',
      'Gathering portfolio risk data...',
      20,
      {
        scopeId,
      },
    );

    const riskData = await this.gatherRiskData(scopeId);

    this.emitProgress(context, 'data-gathered', 'Risk data collected', 40, {
      scopeId,
      hasPortfolioAggregate: !!riskData.portfolioAggregate,
      topRisksCount: (riskData.topRisks as unknown[])?.length || 0,
    });

    // Generate summary using LLM
    this.emitProgress(
      context,
      'generating-summary',
      'Generating summary with AI...',
      50,
      {
        scopeId,
      },
    );

    const content = await this.generateSummaryContent(riskData, context);

    this.emitProgress(
      context,
      'summary-generated',
      'AI summary generated',
      80,
      {
        scopeId,
        status: content.status,
        keyFindingsCount: content.keyFindings.length,
      },
    );

    // Save to database
    this.emitProgress(context, 'saving-summary', 'Saving summary...', 90, {
      scopeId,
    });

    const summary = await this.saveSummary({
      scopeId,
      summaryType,
      content,
      riskSnapshot: riskData,
      generatedBy: context.model,
    });

    // Emit: Complete
    this.emitProgress(
      context,
      'summary-complete',
      `Summary complete: ${content.status.toUpperCase()} status`,
      100,
      {
        scopeId,
        summaryId: summary.id,
        status: content.status,
        keyFindingsCount: content.keyFindings.length,
        recommendationsCount: content.recommendations.length,
      },
    );

    return { summary, cached: false };
  }

  /**
   * Get the latest summary for a scope
   */
  async getLatestSummary(scopeId: string): Promise<ExecutiveSummary | null> {
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'executive_summaries')
        .select('*')
        .eq('scope_id', scopeId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single(),
    );

    if (result.error?.message && result.error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to get latest summary: ${result.error.message}`,
      );
      throw new Error(result.error.message);
    }

    return (asRecord(result.data) as ExecutiveSummary | null) ?? null;
  }

  /**
   * List summaries for a scope
   */
  async listSummaries(
    scopeId: string,
    options?: { limit?: number; summaryType?: string },
  ): Promise<ExecutiveSummary[]> {
    let query = this.db
      .from(this.schema, 'executive_summaries')
      .select('*')
      .eq('scope_id', scopeId)
      .order('generated_at', { ascending: false });

    if (options?.summaryType) {
      query = query.eq('summary_type', options.summaryType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const result = asPostgrestResult(await query);

    if (result.error?.message) {
      this.logger.error(`Failed to list summaries: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return (asArray(result.data) ?? []).filter(
      isRecord,
    ) as unknown as ExecutiveSummary[];
  }

  /**
   * Find a cached summary if available
   */
  private async findCachedSummary(
    scopeId: string,
    summaryType: string,
  ): Promise<ExecutiveSummary | null> {
    // For ad-hoc summaries, check if there's one less than 1 hour old
    // For scheduled summaries, check for the same type from today
    const cacheWindow =
      summaryType === 'ad-hoc'
        ? new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour
        : new Date(new Date().setHours(0, 0, 0, 0)).toISOString(); // Today

    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'executive_summaries')
        .select('*')
        .eq('scope_id', scopeId)
        .eq('summary_type', summaryType)
        .gte('generated_at', cacheWindow)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single(),
    );

    if (result.error?.message && result.error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to find cached summary: ${result.error.message}`,
      );
    }

    return (asRecord(result.data) as ExecutiveSummary | null) ?? null;
  }

  /**
   * Gather all risk data needed for summary generation
   */
  private async gatherRiskData(
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const [portfolioAggregate, topRisks, recentChanges, riskDistribution] =
      await Promise.all([
        this.getPortfolioAggregate(scopeId),
        this.getTopRisks(scopeId),
        this.getRecentChanges(scopeId),
        this.getRiskDistribution(scopeId),
      ]);

    return {
      portfolioAggregate,
      topRisks,
      recentChanges,
      riskDistribution,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get portfolio aggregate stats
   */
  private async getPortfolioAggregate(
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'portfolio_aggregate')
        .select('*')
        .eq('scope_id', scopeId)
        .single(),
    );

    if (result.error?.message && result.error.code !== 'PGRST116') {
      this.logger.warn(
        `Failed to get portfolio aggregate: ${result.error.message}`,
      );
    }

    return asRecord(result.data) ?? {};
  }

  /**
   * Get top risk subjects
   */
  private async getTopRisks(scopeId: string): Promise<TopRisk[]> {
    const { data, error } = (await this.db
      .from(this.schema, 'composite_scores')
      .select(
        `
        id,
        subject_id,
        overall_score,
        dimension_scores,
        subjects!inner(id, name, identifier)
      `,
      )
      .eq('subjects.scope_id', scopeId)
      .eq('status', 'active')
      .eq('is_test', false)
      .order('overall_score', { ascending: false })
      .limit(5)) as QueryResult<unknown>;

    if (error) {
      this.logger.warn(`Failed to get top risks: ${error.message}`);
      return [];
    }

    const rows = (asArray(data) ?? []).filter(isRecord);
    return rows.map((row) => {
      const subjects = asRecord(row['subjects']) ?? {};
      return {
        subjectId: asString(row['subject_id']) ?? '',
        subjectName: asString(subjects['name']) ?? 'Unknown',
        overallScore: asNumber(row['overall_score']) ?? 0,
        dimensionScores: asRecord(row['dimension_scores']) ?? {},
      };
    });
  }

  /**
   * Get recent score changes
   */
  private async getRecentChanges(scopeId: string): Promise<RecentChange[]> {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'score_history')
        .select(
          `
          subject_id,
          overall_score,
          previous_score,
          score_change,
          created_at,
          subjects!inner(scope_id, name, identifier)
        `,
        )
        .eq('subjects.scope_id', scopeId)
        .gte('created_at', sevenDaysAgo)
        .not('score_change', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10),
    );

    if (result.error?.message) {
      this.logger.warn(`Failed to get recent changes: ${result.error.message}`);
      return [];
    }

    const rows = (asArray(result.data) ?? []).filter(isRecord);
    return rows.map((row) => {
      const change = asNumber(row['score_change']) ?? 0;
      const subjects = asRecord(row['subjects']) ?? {};
      return {
        subjectId: asString(row['subject_id']) ?? '',
        subjectName:
          asString(subjects['name']) ||
          asString(subjects['identifier']) ||
          'Unknown',
        currentScore: asNumber(row['overall_score']) ?? 0,
        previousScore: asNumber(row['previous_score']),
        change,
        direction: change > 0 ? 'up' : 'down',
        changedAt: asString(row['created_at']) ?? '',
      };
    });
  }

  /**
   * Get risk distribution
   */
  private async getRiskDistribution(
    scopeId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'risk_distribution')
        .select('*')
        .eq('scope_id', scopeId),
    );

    if (result.error?.message) {
      this.logger.warn(
        `Failed to get risk distribution: ${result.error.message}`,
      );
      return [];
    }

    return (asArray(result.data) ?? []).filter(isRecord);
  }

  /**
   * Generate summary content using LLM
   */
  private async generateSummaryContent(
    riskData: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutiveSummaryContent> {
    const systemPrompt = `You are a senior risk analyst generating executive summaries for portfolio risk reports.
Your summaries should be:
- Concise and actionable
- Free of jargon (explain technical terms)
- Focused on key findings and recommendations
- Balanced between highlighting concerns and providing context

IMPORTANT: All scores in the data are already expressed as percentages (0-100%).
For example, a score of 62.4% means 62.4%, NOT 0.624 that needs to be multiplied by 100.
Use the exact percentage values provided - do NOT multiply them again.

Always respond with valid JSON in the exact format specified.`;

    const aggregate = asRecord(riskData['portfolioAggregate']) ?? {};
    const topRisks = (asArray(riskData['topRisks']) ?? []).filter(isRecord);
    const recentChanges = (asArray(riskData['recentChanges']) ?? []).filter(
      isRecord,
    );
    const distribution = (asArray(riskData['riskDistribution']) ?? []).filter(
      isRecord,
    );

    const avgScoreRaw = asNumber(aggregate['avg_score']) ?? 0;
    // Normalize: if > 1, it's stored as 0-100, keep as-is; if <= 1, multiply by 100
    const avgScore = avgScoreRaw > 1 ? avgScoreRaw : avgScoreRaw * 100;
    const criticalCount = asNumber(aggregate['critical_count']) ?? 0;
    const highCount = asNumber(aggregate['high_count']) ?? 0;
    const subjectCount = asNumber(aggregate['subject_count']) ?? 0;
    const scoreStddevRaw = asNumber(aggregate['score_stddev']) ?? 0;
    const scoreStddev =
      scoreStddevRaw > 1 ? scoreStddevRaw : scoreStddevRaw * 100;

    const userPrompt = `Based on the following portfolio risk data, generate an executive summary:

## Portfolio Overview
- Total Subjects: ${subjectCount}
- Average Risk Score: ${avgScore.toFixed(1)}%
- Critical Risk Count: ${criticalCount}
- High Risk Count: ${highCount}
- Score Standard Deviation: ${scoreStddev.toFixed(1)}%

## Risk Distribution
${
  distribution
    .map((d) => {
      const level = asString(d['risk_level']) ?? 'unknown';
      const count = asNumber(d['count']) ?? 0;
      const pct = asNumber(d['percentage']) ?? 0;
      return `- ${level}: ${count} (${pct.toFixed(1)}%)`;
    })
    .join('\n') || 'No distribution data available'
}

## Top Risks (Highest Scores)
${
  topRisks
    .slice(0, 5)
    .map((r, i) => {
      const name = asString(r['subjectName']) ?? 'Unknown';
      const scoreRaw = asNumber(r['overallScore']) ?? 0;
      // Normalize: if > 1, it's stored as 0-100
      const score = scoreRaw > 1 ? scoreRaw : scoreRaw * 100;
      return `${i + 1}. ${name}: ${score.toFixed(1)}%`;
    })
    .join('\n') || 'No top risk data available'
}

## Recent Changes (Past 7 Days)
${
  recentChanges
    .slice(0, 5)
    .map((c) => {
      const subjectName = asString(c['subjectName']) ?? 'Unknown';
      const direction = asString(c['direction']) === 'up' ? 'up' : 'down';
      const changeRaw = asNumber(c['change']) ?? 0;
      // Normalize: if abs > 1, it's stored as 0-100
      const change = Math.abs(changeRaw) > 1 ? changeRaw : changeRaw * 100;
      return `- ${subjectName}: ${direction === 'up' ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`;
    })
    .join('\n') || 'No recent changes'
}

Please generate a JSON response with exactly this structure:
{
  "headline": "A single sentence (max 100 chars) summarizing the overall risk status",
  "status": "critical|high|medium|low|stable",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],
  "riskHighlights": {
    "topRisks": [{"subject": "Name", "score": 0.75, "dimension": "Primary Risk Dimension"}],
    "recentChanges": [{"subject": "Name", "change": 0.05, "direction": "up|down"}]
  }
}

Guidelines:
- headline: Must be under 100 characters, capture the essence of current risk state
- status: Choose based on avgScore: >=70%=critical, >=50%=high, >=30%=medium, >=10%=low, <10%=stable
- keyFindings: 3-5 bullet points highlighting the most important observations
- recommendations: 2-3 actionable next steps prioritized by impact
- riskHighlights: Include top 3 risks and up to 3 recent significant changes`;

    const response = await this.llmService.generateResponse(
      systemPrompt,
      userPrompt,
      {
        executionContext: context,
        callerType: 'api',
        callerName: 'executive-summary-generator',
      },
    );

    const responseText =
      typeof response === 'string' ? response : response.content;
    return this.parseSummaryResponse(
      responseText,
      avgScore,
      topRisks,
      recentChanges,
    );
  }

  /**
   * Sanitize text by fixing unreasonably large percentages
   * LLMs sometimes mistakenly multiply percentages by 100
   * e.g., 6240% should be 62.4%
   */
  private sanitizePercentages(text: string): string {
    // Match percentages like "6240%" and fix if > 200%
    return text.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, numStr) => {
      const num = parseFloat(numStr);
      // If > 200%, assume LLM multiplied by 100 erroneously
      if (num > 200) {
        const fixed = (num / 100).toFixed(1);
        return `${fixed}%`;
      }
      return match;
    });
  }

  /**
   * Parse LLM response into structured content
   */
  private parseSummaryResponse(
    response: string,
    avgScore: number,
    topRisks: UnknownRecord[],
    recentChanges: UnknownRecord[],
  ): ExecutiveSummaryContent {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = asRecord(JSON.parse(jsonMatch[0])) ?? {};
      const parsedHighlights = asRecord(parsed['riskHighlights']) ?? {};

      // Validate and fill defaults
      return {
        headline: this.sanitizePercentages(
          (asString(parsed['headline']) ?? 'Risk summary unavailable').slice(
            0,
            100,
          ),
        ),
        status: this.validateStatus(
          asString(parsed['status']) ?? undefined,
          avgScore,
        ),
        keyFindings: Array.isArray(parsed['keyFindings'])
          ? (parsed['keyFindings'] as unknown[])
              .filter((v): v is string => typeof v === 'string')
              .slice(0, 5)
              .map((finding) => this.sanitizePercentages(finding))
          : ['Summary generation encountered issues'],
        recommendations: Array.isArray(parsed['recommendations'])
          ? (parsed['recommendations'] as unknown[])
              .filter((v): v is string => typeof v === 'string')
              .slice(0, 3)
          : ['Review risk data manually'],
        riskHighlights: {
          // Merge LLM response with source data to include subjectIds
          topRisks: Array.isArray(parsedHighlights['topRisks'])
            ? (parsedHighlights['topRisks'] as unknown[])
                .slice(0, 3)
                .map((llmRisk) => {
                  const r = llmRisk as Record<string, unknown>;
                  const subjectName = asString(r['subject']) ?? '';
                  // Find matching subject in source data to get subjectId
                  const sourceRisk = topRisks.find(
                    (tr) =>
                      asString(tr['subjectName'])?.toLowerCase() ===
                      subjectName.toLowerCase(),
                  );
                  return {
                    subject: subjectName,
                    subjectId: sourceRisk
                      ? (asString(sourceRisk['subjectId']) ?? undefined)
                      : undefined,
                    score: asNumber(r['score']) ?? 0,
                    dimension: asString(r['dimension']) ?? 'Overall',
                  };
                })
            : topRisks.slice(0, 3).map((r) => ({
                subject: asString(r['subjectName']) ?? 'Unknown',
                subjectId: asString(r['subjectId']) ?? undefined,
                score: asNumber(r['overallScore']) ?? 0,
                dimension: 'Overall',
              })),
          recentChanges: Array.isArray(parsedHighlights['recentChanges'])
            ? (parsedHighlights['recentChanges'] as unknown[])
                .slice(0, 3)
                .map((llmChange) => {
                  const c = llmChange as Record<string, unknown>;
                  const subjectName = asString(c['subject']) ?? '';
                  // Find matching subject in source data to get subjectId
                  const sourceChange = recentChanges.find(
                    (rc) =>
                      asString(rc['subjectName'])?.toLowerCase() ===
                      subjectName.toLowerCase(),
                  );
                  return {
                    subject: subjectName,
                    subjectId: sourceChange
                      ? (asString(sourceChange['subjectId']) ?? undefined)
                      : undefined,
                    change: asNumber(c['change']) ?? 0,
                    direction:
                      asString(c['direction']) === 'up'
                        ? 'up'
                        : ('down' as const),
                  };
                })
            : recentChanges.slice(0, 3).map((c) => ({
                subject: asString(c['subjectName']) ?? 'Unknown',
                subjectId: asString(c['subjectId']) ?? undefined,
                change: asNumber(c['change']) ?? 0,
                direction: asString(c['direction']) === 'up' ? 'up' : 'down',
              })),
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to parse LLM response, using fallback: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return fallback content
      return this.buildFallbackContent(avgScore, topRisks, recentChanges);
    }
  }

  /**
   * Validate status or derive from score
   * @param avgScore - Score as percentage (0-100)
   */
  private validateStatus(
    status: string | undefined,
    avgScore: number,
  ): ExecutiveSummaryContent['status'] {
    const validStatuses = ['critical', 'high', 'medium', 'low', 'stable'];
    if (status && validStatuses.includes(status)) {
      return status as ExecutiveSummaryContent['status'];
    }

    // Derive from average score (using percentage thresholds)
    if (avgScore >= 70) return 'critical';
    if (avgScore >= 50) return 'high';
    if (avgScore >= 30) return 'medium';
    if (avgScore >= 10) return 'low';
    return 'stable';
  }

  /**
   * Build fallback content when LLM parsing fails
   * @param avgScore - Score as percentage (0-100)
   */
  private buildFallbackContent(
    avgScore: number,
    topRisks: UnknownRecord[],
    recentChanges: UnknownRecord[],
  ): ExecutiveSummaryContent {
    const status = this.validateStatus(undefined, avgScore);

    // Normalize top risk score for display
    const topRiskScoreRaw =
      asNumber((topRisks[0] as UnknownRecord)?.['overallScore']) ?? 0;
    const topRiskScore =
      topRiskScoreRaw > 1 ? topRiskScoreRaw : topRiskScoreRaw * 100;

    return {
      headline: `Portfolio risk at ${avgScore.toFixed(0)}% - ${status.toUpperCase()} status`,
      status,
      keyFindings: [
        `Average portfolio risk score: ${avgScore.toFixed(1)}%`,
        topRisks.length > 0
          ? `Highest risk: ${asString((topRisks[0] as UnknownRecord)?.['subjectName']) ?? 'Unknown'} at ${topRiskScore.toFixed(1)}%`
          : 'No high-risk subjects identified',
        recentChanges.length > 0
          ? `${recentChanges.length} score changes in the past 7 days`
          : 'No recent score changes detected',
      ],
      recommendations: [
        'Review detailed risk breakdown for actionable insights',
        'Monitor high-risk subjects closely',
      ],
      riskHighlights: {
        topRisks: topRisks.slice(0, 3).map((r) => ({
          subject: asString(r['subjectName']) ?? 'Unknown',
          subjectId: asString(r['subjectId']) ?? undefined,
          score: asNumber(r['overallScore']) ?? 0,
          dimension: 'Overall',
        })),
        recentChanges: recentChanges.slice(0, 3).map((c) => ({
          subject: asString(c['subjectName']) ?? 'Unknown',
          subjectId: asString(c['subjectId']) ?? undefined,
          change: asNumber(c['change']) ?? 0,
          direction: asString(c['direction']) === 'up' ? 'up' : 'down',
        })),
      },
    };
  }

  /**
   * Save summary to database
   */
  private async saveSummary(params: {
    scopeId: string;
    summaryType: string;
    content: ExecutiveSummaryContent;
    riskSnapshot: Record<string, unknown>;
    generatedBy: string;
  }): Promise<ExecutiveSummary> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'executive_summaries')
        .insert({
          scope_id: params.scopeId,
          summary_type: params.summaryType,
          content: params.content,
          risk_snapshot: params.riskSnapshot,
          generated_by: params.generatedBy,
          generated_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .select()
        .single(),
    );

    if (result.error?.message) {
      this.logger.error(`Failed to save summary: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return asRecord(result.data) as unknown as ExecutiveSummary;
  }
}
