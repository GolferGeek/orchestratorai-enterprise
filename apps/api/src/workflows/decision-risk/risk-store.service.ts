import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type {
  DatabaseService,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import type {
  DecisionRiskScope,
  DimensionAssessment,
  Mitigation,
  RiskDimension,
} from './decision-risk.state';

/**
 * All `risk.*` access for the decision-risk workflow, through the database
 * plane. The graph nodes never touch a client directly.
 *
 * Every method throws on error rather than returning empty. A risk assessment
 * that silently loses a dimension is worse than one that fails.
 *
 * Methods that record a run take the whole ExecutionContext rather than loose
 * conversationId/provider/model arguments. Destructuring the capsule at a call
 * site is what CLAUDE.md rule 3 forbids, and it is also how attribution drifts:
 * the moment three fields travel separately, one of them eventually comes from
 * somewhere else.
 */
@Injectable()
export class RiskStoreService {
  private readonly logger = new Logger(RiskStoreService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  private unwrap<T>(result: { data: unknown; error: unknown }, what: string): T {
    if (result.error) {
      const message =
        typeof result.error === 'object' &&
        result.error !== null &&
        'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : String(result.error);
      throw new Error(`${what} failed: ${message}`);
    }
    return result.data as T;
  }

  /** The scope a workflow run belongs to, by org. */
  async findScope(
    organizationSlug: string,
    workflowSlug: string,
  ): Promise<DecisionRiskScope> {
    const result = await this.db
      .from('risk', 'scopes')
      .select('id, name, organization_slug, thresholds, analysis_config')
      .eq('organization_slug', organizationSlug)
      .eq('agent_slug', workflowSlug)
      .eq('is_active', true)
      .maybeSingle();

    const row = this.unwrap<Record<string, unknown> | null>(
      result,
      `Loading risk scope for ${organizationSlug}/${workflowSlug}`,
    );

    if (!row) {
      throw new Error(
        `No active risk scope for organization '${organizationSlug}' and workflow '${workflowSlug}'. ` +
          `Seed one (see migration 20260922230000) before running this workflow.`,
      );
    }

    const thresholds = (row.thresholds ?? {}) as Record<string, number>;
    return {
      id: String(row.id),
      name: String(row.name),
      organizationSlug: String(row.organization_slug),
      thresholds: {
        flagged: thresholds.flagged ?? 60,
        debate: thresholds.debate ?? 65,
        alert: thresholds.alert ?? 80,
      },
      analysisConfig: (row.analysis_config ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Active dimensions for a scope, each with its active prompt.
   *
   * A dimension without a context row cannot be assessed, so that is an error
   * and not a skip — silently dropping it would change the composite while
   * looking like a complete run.
   */
  async listDimensions(scopeId: string): Promise<RiskDimension[]> {
    const dimResult = await this.db
      .from('risk', 'dimensions')
      .select('id, slug, name, weight, display_order')
      .eq('scope_id', scopeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    const dims = this.unwrap<Record<string, unknown>[]>(
      dimResult,
      `Loading dimensions for scope ${scopeId}`,
    );

    if (!dims?.length) {
      throw new Error(`Risk scope ${scopeId} has no active dimensions.`);
    }

    const ctxResult = await this.db
      .from('risk', 'dimension_contexts')
      .select('id, dimension_id, system_prompt, version')
      .in(
        'dimension_id',
        dims.map((d) => String(d.id)),
      )
      .eq('is_active', true)
      .order('version', { ascending: false });

    const contexts = this.unwrap<Record<string, unknown>[]>(
      ctxResult,
      `Loading dimension prompts for scope ${scopeId}`,
    );

    // Ordered version-descending, so the first hit per dimension is the newest.
    const newestByDimension = new Map<string, Record<string, unknown>>();
    for (const ctx of contexts) {
      const key = String(ctx.dimension_id);
      if (!newestByDimension.has(key)) newestByDimension.set(key, ctx);
    }

    return dims.map((row) => {
      const ctx = newestByDimension.get(String(row.id));
      if (!ctx) {
        throw new Error(
          `Dimension '${String(row.slug)}' has no active prompt in risk.dimension_contexts.`,
        );
      }
      return {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        weight: Number(row.weight),
        contextId: String(ctx.id),
        systemPrompt: String(ctx.system_prompt),
      };
    });
  }

  /** The proposition, as a row. Re-runs of the same text reuse the subject. */
  async upsertSubject(
    scopeId: string,
    identifier: string,
    name: string,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const existing = await this.db
      .from('risk', 'subjects')
      .select('id')
      .eq('scope_id', scopeId)
      .eq('identifier', identifier)
      .maybeSingle();

    if (!existing.error && existing.data) {
      return String((existing.data as { id: unknown }).id);
    }

    const created = await this.db
      .from('risk', 'subjects')
      .insert({
        scope_id: scopeId,
        identifier,
        name,
        subject_type: 'decision',
        metadata,
      })
      .select('id')
      .single();

    const row = this.unwrap<{ id: unknown }>(
      created,
      `Creating risk subject '${identifier}'`,
    );
    return String(row.id);
  }

  /** Persist one run's dimension assessments; returns them with row ids. */
  async recordAssessments(
    context: ExecutionContext,
    subjectId: string,
    assessments: DimensionAssessment[],
    dimensions: RiskDimension[],
  ): Promise<DimensionAssessment[]> {
    const contextBySlug = new Map(dimensions.map((d) => [d.slug, d.contextId]));

    const result = await this.db
      .from('risk', 'assessments')
      .insert(
        assessments.map((a) => ({
          subject_id: subjectId,
          dimension_id: a.dimensionId,
          dimension_context_id: contextBySlug.get(a.dimensionSlug) ?? null,
          task_id: context.conversationId,
          score: a.score,
          confidence: a.confidence,
          reasoning: a.reasoning,
          evidence: a.evidence,
          llm_provider: context.provider,
          llm_model: context.model,
        })),
      )
      .select('id, dimension_id');

    const rows = this.unwrap<Record<string, unknown>[]>(
      result,
      `Recording ${assessments.length} assessments`,
    );

    const idByDimension = new Map(
      rows.map((r) => [String(r.dimension_id), String(r.id)]),
    );
    return assessments.map((a) => ({
      ...a,
      assessmentId: idByDimension.get(a.dimensionId),
    }));
  }

  /** Previous scores for this subject stop being the current answer. */
  async supersedePreviousScores(subjectId: string): Promise<void> {
    const result = await this.db
      .from('risk', 'composite_scores')
      .update({ status: 'superseded' })
      .eq('subject_id', subjectId)
      .eq('status', 'active');
    this.unwrap(result, `Superseding previous scores for subject ${subjectId}`);
  }

  async recordCompositeScore(input: {
    context: ExecutionContext;
    subjectId: string;
    overallScore: number;
    dimensionScores: Record<string, number>;
    confidence: number;
  }): Promise<string> {
    const result = await this.db
      .from('risk', 'composite_scores')
      .insert({
        subject_id: input.subjectId,
        task_id: input.context.conversationId,
        overall_score: input.overallScore,
        dimension_scores: input.dimensionScores,
        confidence: input.confidence,
        pre_debate_score: input.overallScore,
        status: 'active',
      })
      .select('id')
      .single();

    const row = this.unwrap<{ id: unknown }>(result, 'Recording composite score');
    return String(row.id);
  }

  /** Prompts for the blue/red/arbiter roles, by scope. */
  async getDebatePrompts(scopeId: string): Promise<Record<string, string>> {
    const result = await this.db
      .from('risk', 'debate_contexts')
      .select('role, system_prompt, version')
      .eq('scope_id', scopeId)
      .eq('is_active', true);

    const rows = this.unwrap<Record<string, unknown>[]>(
      result,
      `Loading debate prompts for scope ${scopeId}`,
    );

    const prompts: Record<string, string> = {};
    for (const row of rows) {
      prompts[String(row.role)] = String(row.system_prompt);
    }

    for (const role of ['blue', 'red', 'arbiter']) {
      if (!prompts[role]) {
        throw new Error(
          `Scope ${scopeId} is configured for debate but has no '${role}' prompt in risk.debate_contexts.`,
        );
      }
    }
    return prompts;
  }

  async recordDebate(input: {
    context: ExecutionContext;
    subjectId: string;
    compositeScoreId: string;
    blue: unknown;
    red: unknown;
    arbiter: unknown;
    originalScore: number;
    finalScore: number;
  }): Promise<string> {
    const result = await this.db
      .from('risk', 'debates')
      .insert({
        subject_id: input.subjectId,
        composite_score_id: input.compositeScoreId,
        task_id: input.context.conversationId,
        blue_assessment: input.blue,
        red_challenges: input.red,
        arbiter_synthesis: input.arbiter,
        original_score: input.originalScore,
        final_score: input.finalScore,
        score_adjustment: input.finalScore - input.originalScore,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const row = this.unwrap<{ id: unknown }>(result, 'Recording debate');
    return String(row.id);
  }

  /** The debate's verdict becomes the subject's current score. */
  async applyDebateToScore(
    compositeScoreId: string,
    debateId: string,
    finalScore: number,
    adjustment: number,
  ): Promise<void> {
    const result = await this.db
      .from('risk', 'composite_scores')
      .update({
        overall_score: finalScore,
        debate_id: debateId,
        debate_adjustment: adjustment,
      })
      .eq('id', compositeScoreId);
    this.unwrap(result, `Applying debate ${debateId} to score`);
  }

  async recordMitigations(
    context: ExecutionContext,
    subjectId: string,
    mitigations: Mitigation[],
  ): Promise<void> {
    if (!mitigations.length) return;

    const result = await this.db.from('risk', 'mitigations').insert(
      mitigations.map((m) => ({
        assessment_id: m.assessmentId,
        subject_id: subjectId,
        proposal: m.proposal,
        rationale: m.rationale,
        effort: m.effort,
        residual_score: m.residualScore,
        llm_provider: context.provider,
        llm_model: context.model,
      })),
    );
    this.unwrap(result, `Recording ${mitigations.length} mitigations`);
  }
}
