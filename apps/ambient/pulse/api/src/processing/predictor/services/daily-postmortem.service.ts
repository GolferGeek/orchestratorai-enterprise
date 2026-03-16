import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { TargetRepository } from '../repositories/target.repository';
import { TargetSnapshotService } from './target-snapshot.service';
import { SourceSubscriptionRepository } from '../repositories/source-subscription.repository';
import { HistoricalReplayService } from './historical-replay.service';

type RecType = 'context_update' | 'source_candidate' | 'replay_experiment';
type ScopeLevel =
  | 'instrument_context'
  | 'domain_context'
  | 'prediction_global_context';
type RecStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'escalated';
type ArtifactType = 'html' | 'markdown' | 'json';

interface DailyPostmortemRunRow {
  id: string;
  org_slug: string;
  agent_slug: string;
  run_date: string;
  status: string;
  summary: Record<string, unknown>;
  report_markdown: string;
  report_html: string;
  report_json: Record<string, unknown>;
  created_by: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyPostmortemRecommendationRow {
  id: string;
  run_id: string;
  recommendation_type: RecType;
  scope_level: ScopeLevel;
  target_id: string | null;
  target_symbol: string | null;
  title: string;
  rationale: string;
  proposed_change: Record<string, unknown>;
  confidence: number;
  status: RecStatus;
  action_source: string | null;
  action_note: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ActorMetrics {
  total: number;
  correct: number;
  hitRatePct: number;
  avgConfidence: number;
}

@Injectable()
export class DailyPostmortemService {
  private readonly logger = new Logger(DailyPostmortemService.name);
  private readonly schema = 'prediction';
  private readonly runsTable = 'daily_postmortem_runs';
  private readonly recsTable = 'daily_postmortem_recommendations';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly targetRepository: TargetRepository,
    private readonly targetSnapshotService: TargetSnapshotService,
    private readonly sourceSubscriptionRepository: SourceSubscriptionRepository,
    private readonly historicalReplayService: HistoricalReplayService,
  ) {}

  async listRuns(
    orgSlug: string,
    agentSlug: string,
    limit = 20,
  ): Promise<DailyPostmortemRunRow[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.runsTable)
      .select('*')
      .eq('org_slug', orgSlug)
      .eq('agent_slug', agentSlug)
      .order('created_at', { ascending: false })
      .limit(limit)) as QueryResult<unknown>;
    if (error)
      throw new Error(`Failed to list daily reports: ${error.message}`);
    return (data ?? []) as DailyPostmortemRunRow[];
  }

  async getRun(runId: string): Promise<{
    run: DailyPostmortemRunRow;
    recommendations: DailyPostmortemRecommendationRow[];
  } | null> {
    const runResult = await this.db
      .from(this.schema, this.runsTable)
      .select('*')
      .eq('id', runId)
      .single();
    const run = runResult.data as DailyPostmortemRunRow | null;
    const runError = runResult.error;
    if (runError && runError.code !== 'PGRST116') {
      throw new Error(`Failed to get daily report run: ${runError.message}`);
    }
    if (!run) return null;

    const recResult = await this.db
      .from(this.schema, this.recsTable)
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    const recs = recResult.data as DailyPostmortemRecommendationRow[] | null;
    const recError = recResult.error;
    if (recError) {
      throw new Error(
        `Failed to get daily report recommendations: ${recError.message}`,
      );
    }
    return {
      run,
      recommendations: recs ?? [],
    };
  }

  async getArtifact(
    runId: string,
    artifactType: ArtifactType,
  ): Promise<{
    runId: string;
    artifactType: ArtifactType;
    mimeType: string;
    filename: string;
    content: string | Record<string, unknown>;
  } | null> {
    const runResult = await this.db
      .from(this.schema, this.runsTable)
      .select('*')
      .eq('id', runId)
      .single();
    const run = runResult.data as DailyPostmortemRunRow | null;
    const runError = runResult.error;
    if (runError && runError.code !== 'PGRST116') {
      throw new Error(`Failed to get artifact: ${runError.message}`);
    }
    if (!run) return null;

    const baseFilename = `daily-report-${run.run_date}-${run.id.slice(0, 8)}`;
    if (artifactType === 'html') {
      return {
        runId: run.id,
        artifactType,
        mimeType: 'text/html',
        filename: `${baseFilename}.html`,
        content: run.report_html,
      };
    }
    if (artifactType === 'markdown') {
      return {
        runId: run.id,
        artifactType,
        mimeType: 'text/markdown',
        filename: `${baseFilename}.md`,
        content: run.report_markdown,
      };
    }
    return {
      runId: run.id,
      artifactType,
      mimeType: 'application/json',
      filename: `${baseFilename}.json`,
      content: run.report_json,
    };
  }

  async runDailyReport(
    context:
      | ExecutionContext
      | { orgSlug: string; agentSlug: string; userId: string },
    input?: { runDate?: string; overnightMoveThresholdPct?: number },
  ): Promise<{ runId: string }> {
    const now = new Date();
    const runDate = input?.runDate ?? now.toISOString().slice(0, 10);
    const thresholdPct = input?.overnightMoveThresholdPct ?? 2;
    const startIso = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const targets = await this.targetRepository.findAllActive();
    const overnightCandidates: Array<{
      targetId: string;
      symbol: string;
      name: string;
      changePercent: number;
      changeAbsolute: number;
      currentPrice: number | null;
      sourceCoverageCount: number;
    }> = [];

    for (const target of targets) {
      const change = await this.targetSnapshotService.calculateChange(
        target.id,
        startIso,
        now.toISOString(),
      );
      const changePct = change.change_percent ?? 0;
      if (Math.abs(changePct) < thresholdPct) continue;
      const sourceCoverage =
        await this.sourceSubscriptionRepository.findByTarget(target.id);
      overnightCandidates.push({
        targetId: target.id,
        symbol: target.symbol,
        name: target.name,
        changePercent: changePct,
        changeAbsolute: change.change_absolute ?? 0,
        currentPrice: target.current_price,
        sourceCoverageCount: sourceCoverage.length,
      });
    }

    const { data: recentPredictions, error: predError } = (await this.db
      .from(this.schema, 'predictions')
      .select('*')
      .gte('predicted_at', startIso)
      .order('predicted_at', { ascending: false })) as QueryResult<unknown>;
    if (predError)
      throw new Error(`Failed to query predictions: ${predError.message}`);
    const predictions = (recentPredictions ?? []) as Array<
      Record<string, unknown>
    >;

    const scorecard = this.buildActorScorecard(predictions);
    const attributionMatrix =
      this.buildPerInstrumentAttributionMatrix(predictions);
    const recommendations = this.buildRecommendationsFromMoves(
      overnightCandidates,
      predictions,
      thresholdPct,
    );

    const summary = {
      runDate,
      overnightMoveThresholdPct: thresholdPct,
      overnightCandidates: overnightCandidates.length,
      recommendations: recommendations.length,
      actorScorecard: scorecard,
      perInstrumentAttributionMatrixCount: attributionMatrix.length,
    };

    const markdown = this.buildMarkdownReport(
      summary,
      overnightCandidates,
      recommendations,
    );
    const html = this.buildHtmlReport(
      summary,
      overnightCandidates,
      recommendations,
    );
    const reportJson = {
      summary,
      actor_scorecard: scorecard,
      per_instrument_attribution_matrix: attributionMatrix,
      overnightCandidates,
      recommendations,
      generatedAt: now.toISOString(),
    };

    const runInsertResult = await this.db
      .from(this.schema, this.runsTable)
      .insert({
        org_slug: context.orgSlug,
        agent_slug: context.agentSlug,
        run_date: runDate,
        status: 'completed',
        summary,
        report_markdown: markdown,
        report_html: html,
        report_json: reportJson,
        created_by: context.userId,
        started_at: now.toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    const runRow = runInsertResult.data as DailyPostmortemRunRow | null;
    const runError = runInsertResult.error;
    if (runError || !runRow) {
      throw new Error(
        `Failed to create daily report run: ${runError?.message ?? 'unknown'}`,
      );
    }

    if (recommendations.length > 0) {
      const { error: recError } = await this.db
        .from(this.schema, this.recsTable)
        .insert(
          recommendations.map((rec) => ({
            run_id: runRow.id,
            recommendation_type: rec.recommendation_type,
            scope_level: rec.scope_level,
            target_id: rec.target_id,
            target_symbol: rec.target_symbol,
            title: rec.title,
            rationale: rec.rationale,
            proposed_change: rec.proposed_change,
            confidence: rec.confidence,
            status: 'pending',
          })),
        );
      if (recError) {
        throw new Error(
          `Failed to insert recommendations: ${recError.message}`,
        );
      }
    }

    this.logger.log(
      `Daily postmortem run created (${runRow.id}) with ${recommendations.length} recommendations`,
    );
    return { runId: runRow.id };
  }

  async decideRecommendation(
    context: ExecutionContext,
    input: {
      recommendationId: string;
      decision: 'approve' | 'reject' | 'apply' | 'escalate' | 'replay';
      actionSource?: 'dashboard' | 'openclaw-web' | 'openclaw-phone';
      note?: string;
      escalateTo?: ScopeLevel;
    },
  ): Promise<DailyPostmortemRecommendationRow> {
    const recResult = await this.db
      .from(this.schema, this.recsTable)
      .select('*')
      .eq('id', input.recommendationId)
      .single();
    const rec = recResult.data as DailyPostmortemRecommendationRow | null;
    const recError = recResult.error;
    if (recError || !rec) {
      throw new Error(`Recommendation not found: ${input.recommendationId}`);
    }

    let nextStatus: RecStatus =
      input.decision === 'reject'
        ? 'rejected'
        : input.decision === 'escalate'
          ? 'escalated'
          : 'approved';

    let actionNote = input.note ?? null;

    if (input.decision === 'apply') {
      nextStatus = await this.applyRecommendation(context, rec);
    }
    if (input.decision === 'replay') {
      const replaySummary = await this.runReplayExperiment(context, rec);
      actionNote = `${input.note ?? ''}${
        input.note ? ' | ' : ''
      }replay_test_id=${replaySummary.id}; replay_accuracy_pct=${
        replaySummary.replay_accuracy_pct ?? 'n/a'
      }; original_accuracy_pct=${replaySummary.original_accuracy_pct ?? 'n/a'}`;
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      action_source: input.actionSource ?? 'dashboard',
      action_note: actionNote,
      actioned_by: context.userId,
      actioned_at: new Date().toISOString(),
    };
    if (input.decision === 'escalate' && input.escalateTo) {
      updates.scope_level = input.escalateTo;
    }

    const updateResult = await this.db
      .from(this.schema, this.recsTable)
      .update(updates)
      .eq('id', input.recommendationId)
      .select('*')
      .single();
    const updated =
      updateResult.data as DailyPostmortemRecommendationRow | null;
    const updateError = updateResult.error;
    if (updateError || !updated) {
      throw new Error(
        `Failed to update recommendation: ${updateError?.message ?? 'unknown'}`,
      );
    }
    return updated;
  }

  private async applyRecommendation(
    context: ExecutionContext,
    rec: DailyPostmortemRecommendationRow,
  ): Promise<RecStatus> {
    if (rec.recommendation_type !== 'context_update') {
      throw new Error('Only context_update recommendations can be applied');
    }
    const section = this.toSafeString(rec.proposed_change?.context_section);
    if (section.toLowerCase() !== 'ai') {
      throw new Error('Only AI section context updates are allowed');
    }
    if (rec.scope_level !== 'instrument_context' || !rec.target_id) {
      throw new Error(
        'Auto-apply supports instrument_context with target_id only',
      );
    }

    const target = await this.targetRepository.findById(rec.target_id);
    if (!target) throw new Error(`Target not found: ${rec.target_id}`);
    const suggestion = String(
      (rec.proposed_change?.suggested_patch as string) ?? '',
    ).trim();
    if (!suggestion) throw new Error('Recommendation patch is empty');

    const existingContext = target.context ?? '';
    const patched = this.patchAiSection(
      existingContext,
      suggestion,
      context.userId,
    );
    await this.targetRepository.update(target.id, { context: patched });
    return 'applied';
  }

  private patchAiSection(
    current: string,
    suggestedPatch: string,
    userId: string,
  ): string {
    const stamp = new Date().toISOString();
    const line = `- [${stamp}] ${suggestedPatch} (applied_by=${userId})`;
    const aiHeader = /^##\s*AI Context\s*$/im;
    const headerMatch = current.match(aiHeader);
    if (!headerMatch || headerMatch.index === undefined) {
      const base = current.trim();
      return `${base}${base ? '\n\n' : ''}## AI Context\n${line}\n`;
    }

    const start = headerMatch.index + headerMatch[0].length;
    const rest = current.slice(start);
    const nextHeaderMatch = rest.match(/\n##\s+/);
    if (!nextHeaderMatch || nextHeaderMatch.index === undefined) {
      return `${current.trimEnd()}\n${line}\n`;
    }

    const splitIndex = start + nextHeaderMatch.index;
    return `${current.slice(0, splitIndex).trimEnd()}\n${line}\n${current.slice(splitIndex)}`;
  }

  private buildActorScorecard(predictions: Array<Record<string, unknown>>) {
    const score = {
      arbitrator: { total: 0, correct: 0, confidenceSum: 0 },
      analyst_ai: { total: 0, correct: 0, confidenceSum: 0 },
      analyst_user: { total: 0, correct: 0, confidenceSum: 0 },
    };

    for (const p of predictions) {
      const outcome = Number(p.outcome_value);
      if (!Number.isFinite(outcome) || outcome === 0) continue;
      const actual = outcome > 0 ? 'up' : 'down';
      const direction = this.toSafeString(p.direction);
      const analystSlug = this.toSafeString(p.analyst_slug);
      const isArb = Boolean(p.is_arbitrator) || analystSlug === 'arbitrator';

      if (isArb) {
        score.arbitrator.total += 1;
        score.arbitrator.confidenceSum += this.toNumberOrZero(p.confidence);
        if (direction === actual) score.arbitrator.correct += 1;
      } else {
        score.analyst_ai.total += 1;
        score.analyst_ai.confidenceSum += this.toNumberOrZero(p.confidence);
        if (direction === actual) score.analyst_ai.correct += 1;

        const ensemble =
          (p.analyst_ensemble as Record<string, unknown> | null) ?? null;
        const userFork =
          (ensemble?.user_fork as Record<string, unknown> | undefined) ??
          undefined;
        const userDirection = this.toSafeString(userFork?.direction);
        if (userDirection) {
          score.analyst_user.total += 1;
          score.analyst_user.confidenceSum += this.toNumberOrZero(
            userFork?.confidence,
          );
          const normalized =
            userDirection.toLowerCase() === 'bullish'
              ? 'up'
              : userDirection.toLowerCase() === 'bearish'
                ? 'down'
                : userDirection.toLowerCase() === 'up' ||
                    userDirection.toLowerCase() === 'down'
                  ? userDirection.toLowerCase()
                  : '';
          if (normalized === actual) score.analyst_user.correct += 1;
        }
      }
    }

    const toMetrics = (x: {
      total: number;
      correct: number;
      confidenceSum: number;
    }): ActorMetrics => ({
      total: x.total,
      correct: x.correct,
      hitRatePct:
        x.total > 0 ? Number(((x.correct / x.total) * 100).toFixed(1)) : 0,
      avgConfidence:
        x.total > 0 ? Number((x.confidenceSum / x.total).toFixed(3)) : 0,
    });

    return {
      arbitrator: toMetrics(score.arbitrator),
      analyst_ai: toMetrics(score.analyst_ai),
      analyst_user: toMetrics(score.analyst_user),
    };
  }

  private buildPerInstrumentAttributionMatrix(
    predictions: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const grouped = new Map<
      string,
      {
        targetId: string;
        symbol: string;
        total: number;
        arbitratorCorrect: number;
        arbitratorTotal: number;
        analystAiCorrect: number;
        analystAiTotal: number;
      }
    >();

    for (const prediction of predictions) {
      const targetId = this.toSafeString(prediction.target_id);
      if (!targetId) continue;
      const symbol = this.toSafeString(prediction.target_symbol) || targetId;
      const key = `${targetId}:${symbol}`;
      const row =
        grouped.get(key) ??
        ({
          targetId,
          symbol,
          total: 0,
          arbitratorCorrect: 0,
          arbitratorTotal: 0,
          analystAiCorrect: 0,
          analystAiTotal: 0,
        } as const);
      if (!grouped.has(key)) {
        grouped.set(key, { ...row });
      }

      const actualOutcome = this.toNumberOrZero(prediction.outcome_value);
      if (actualOutcome === 0) continue;
      const actualDirection = actualOutcome > 0 ? 'up' : 'down';
      const direction = this.toSafeString(prediction.direction);
      const analystSlug = this.toSafeString(prediction.analyst_slug);
      const isArb =
        Boolean(prediction.is_arbitrator) || analystSlug === 'arbitrator';
      const mutable = grouped.get(key)!;
      mutable.total += 1;
      if (isArb) {
        mutable.arbitratorTotal += 1;
        if (direction === actualDirection) mutable.arbitratorCorrect += 1;
      } else {
        mutable.analystAiTotal += 1;
        if (direction === actualDirection) mutable.analystAiCorrect += 1;
      }
    }

    return Array.from(grouped.values()).map((row) => ({
      targetId: row.targetId,
      symbol: row.symbol,
      totalPredictions: row.total,
      arbitrator: {
        total: row.arbitratorTotal,
        correct: row.arbitratorCorrect,
        hitRatePct:
          row.arbitratorTotal > 0
            ? Number(
                ((row.arbitratorCorrect / row.arbitratorTotal) * 100).toFixed(
                  1,
                ),
              )
            : 0,
      },
      analyst_ai: {
        total: row.analystAiTotal,
        correct: row.analystAiCorrect,
        hitRatePct:
          row.analystAiTotal > 0
            ? Number(
                ((row.analystAiCorrect / row.analystAiTotal) * 100).toFixed(1),
              )
            : 0,
      },
    }));
  }

  private buildRecommendationsFromMoves(
    moves: Array<{
      targetId: string;
      symbol: string;
      name: string;
      changePercent: number;
      changeAbsolute: number;
      currentPrice: number | null;
      sourceCoverageCount: number;
    }>,
    predictions: Array<Record<string, unknown>>,
    thresholdPct: number,
  ): Array<{
    recommendation_type: RecType;
    scope_level: ScopeLevel;
    target_id: string | null;
    target_symbol: string | null;
    title: string;
    rationale: string;
    proposed_change: Record<string, unknown>;
    confidence: number;
  }> {
    const recs: Array<{
      recommendation_type: RecType;
      scope_level: ScopeLevel;
      target_id: string | null;
      target_symbol: string | null;
      title: string;
      rationale: string;
      proposed_change: Record<string, unknown>;
      confidence: number;
    }> = [];

    for (const move of moves) {
      const targetPredictions = predictions.filter(
        (p) => p.target_id === move.targetId,
      );
      const actualDirection = move.changePercent > 0 ? 'up' : 'down';
      const matched = targetPredictions.some(
        (p) => this.toSafeString(p.direction) === actualDirection,
      );

      if (targetPredictions.length === 0) {
        recs.push({
          recommendation_type: 'source_candidate',
          scope_level: 'instrument_context',
          target_id: move.targetId,
          target_symbol: move.symbol,
          title: `Investigate missing coverage for ${move.symbol}`,
          rationale: `${move.symbol} moved ${move.changePercent.toFixed(2)}% in 24h (threshold ${thresholdPct}%) without any recent prediction.`,
          proposed_change: {
            candidate_source: `Add targeted news/filings source for ${move.symbol}`,
            auto_apply_allowed: false,
          },
          confidence: 0.72,
        });
      } else if (!matched) {
        recs.push({
          recommendation_type: 'context_update',
          scope_level:
            Math.abs(move.changePercent) >= thresholdPct * 2
              ? 'domain_context'
              : 'instrument_context',
          target_id: move.targetId,
          target_symbol: move.symbol,
          title: `Patch AI context for ${move.symbol} overnight miss`,
          rationale: `${move.symbol} moved ${move.changePercent.toFixed(2)}% with no matching direction in recent predictions.`,
          proposed_change: {
            context_section: 'ai',
            suggested_patch: `Increase weight for overnight gap catalysts and pre-market event signals for ${move.symbol}.`,
            auto_apply_allowed: true,
          },
          confidence: 0.78,
        });
      }
    }

    // Add replay recommendation as a single run-level item.
    recs.push({
      recommendation_type: 'replay_experiment',
      scope_level: 'prediction_global_context',
      target_id: null,
      target_symbol: null,
      title: 'Run version-mode replay on proposed AI context changes',
      rationale:
        'Validate proposed AI-context updates against baseline before promotion.',
      proposed_change: {
        replay_mode: 'version_only',
        mutate_live_context: false,
      },
      confidence: 0.9,
    });

    return recs;
  }

  private buildMarkdownReport(
    summary: {
      runDate: string;
      overnightCandidates: number;
      recommendations: number;
    },
    overnightCandidates: Array<{
      targetId: string;
      symbol: string;
      name: string;
      changePercent: number;
      sourceCoverageCount: number;
    }>,
    recommendations: Array<{
      recommendation_type: RecType;
      scope_level: ScopeLevel;
      target_symbol: string | null;
      title: string;
      rationale: string;
      confidence: number;
    }>,
  ): string {
    const lines: string[] = [];
    lines.push('# Daily Report');
    lines.push('');
    lines.push('## Summary');
    lines.push(`- Run date: ${summary.runDate}`);
    lines.push(`- Overnight candidates: ${summary.overnightCandidates}`);
    lines.push(`- Recommendations: ${summary.recommendations}`);
    lines.push('');
    lines.push('## Overnight Moves');
    for (const c of overnightCandidates) {
      lines.push(
        `- ${c.symbol}: ${c.changePercent.toFixed(2)}% (sources=${c.sourceCoverageCount})`,
      );
    }
    lines.push('');
    lines.push('## Recommendations');
    recommendations.forEach((r, idx) => {
      lines.push(
        `${idx + 1}. [${r.recommendation_type}] [${r.scope_level}] ${r.title} (${Math.round(r.confidence * 100)}%)`,
      );
      lines.push(`   - ${r.rationale}`);
    });
    return lines.join('\n');
  }

  private buildHtmlReport(
    summary: {
      runDate: string;
    },
    overnightCandidates: Array<{
      symbol: string;
      name: string;
      changePercent: number;
      sourceCoverageCount: number;
    }>,
    recommendations: Array<{
      recommendation_type: RecType;
      scope_level: ScopeLevel;
      target_symbol: string | null;
      title: string;
      rationale: string;
      confidence: number;
    }>,
  ): string {
    const rows = overnightCandidates
      .map(
        (c) =>
          `<tr><td>${c.symbol}</td><td>${c.name}</td><td>${c.changePercent.toFixed(2)}%</td><td>${c.sourceCoverageCount}</td></tr>`,
      )
      .join('');
    const recCards = recommendations
      .map(
        (r) => `<div class="rec-card">
  <h4>${r.title}</h4>
  <p><strong>Type:</strong> ${r.recommendation_type} | <strong>Scope:</strong> ${r.scope_level} | <strong>Confidence:</strong> ${Math.round(r.confidence * 100)}%</p>
  <p>${r.rationale}</p>
  <div class="actions">
    <button data-action="approve">Approve</button>
    <button data-action="apply">Apply</button>
    <button data-action="reject">Reject</button>
    <button data-action="escalate">Escalate</button>
  </div>
</div>`,
      )
      .join('');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Daily Report</title>
  <style>
    body{font-family:Arial,sans-serif;margin:20px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:8px;text-align:left}
    .rec-card{border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0}
    .actions button{margin-right:8px}
  </style>
</head>
<body>
  <h1>Daily Report</h1>
  <p>Run date: ${summary.runDate}</p>
  <h2>Overnight Moves</h2>
  <table>
    <thead><tr><th>Symbol</th><th>Name</th><th>Move</th><th>Source Coverage</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Recommendations</h2>
  ${recCards}
</body>
</html>`;
  }

  private toSafeString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private toNumberOrZero(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private async runReplayExperiment(
    context: ExecutionContext,
    rec: DailyPostmortemRecommendationRow,
  ) {
    if (!rec.target_id) {
      throw new Error('Replay requires recommendation target_id');
    }
    const target = await this.targetRepository.findById(rec.target_id);
    if (!target) {
      throw new Error(`Target not found for replay: ${rec.target_id}`);
    }

    const rollbackTo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const replay = await this.historicalReplayService.createReplayTest({
      name: `DailyReportReplay-${target.symbol}-${Date.now()}`,
      description: `Replay from daily report recommendation ${rec.id}`,
      organization_slug: context.orgSlug,
      rollback_depth: 'predictions',
      rollback_to: rollbackTo,
      universe_id: target.universe_id,
      target_ids: [target.id],
      config: {
        mode: 'version_only',
        source: 'daily_postmortem',
        recommendation_id: rec.id,
      },
      created_by: context.userId,
    });

    return this.historicalReplayService.runReplayTest(replay.id);
  }
}
