import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkUnitService } from '../../shared/work-units';
import type { DecisionRiskState, Mitigation } from '../decision-risk.state';
import { compositeOf } from './aggregate.node';
import { DIMENSION_CONCURRENCY } from './assess-dimensions.node';
import { propositionInput, reportProgress, scopeOf } from './run-context';

/** The proposer's output (its agent contract enforces it). */
interface ProposedMitigation {
  proposal: string;
  rationale: string;
  effort: 'low' | 'medium' | 'high';
  residual_score: number;
}

/**
 * For every flagged dimension, the highest-value action and what the
 * dimension would score if it were done, as one panel work unit. Proposals
 * are not stored here: a person reviews them next (review_mitigations), and
 * only what they approve is recorded.
 */
export function createProposeMitigationsNode(deps: { units: WorkUnitService; logger: Logger }) {
  return async (
    state: DecisionRiskState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DecisionRiskState>> => {
    const { scope, subjectId, assessments, dimensions } = state;
    if (!scope || !subjectId) {
      throw new Error('propose_mitigations ran without a scope or subject.');
    }

    const threshold = flaggedThreshold(state);
    const flagged = assessments.filter((a) => a.score >= threshold);
    if (!flagged.length) {
      deps.logger.log(`No dimension reached the flagged threshold of ${threshold}; nothing to mitigate.`);
      return { mitigations: [], residualScore: state.overallScore };
    }

    await reportProgress(
      config,
      'propose_mitigations',
      78,
      `Proposing mitigations for ${flagged.length} flagged dimension(s)`,
    );
    const nameBySlug = new Map(dimensions.map((d) => [d.slug, d.name]));
    const base = propositionInput(state);
    const panel = await deps.units.runPanel<ProposedMitigation>(scopeOf(state), {
      slug: 'propose-mitigations',
      panelists: flagged.map((assessment) => ({
        agent: 'risk-mitigation-proposer',
        input: {
          ...base,
          dimension: nameBySlug.get(assessment.dimensionSlug) ?? assessment.dimensionSlug,
          current_score: assessment.score,
          confidence: assessment.confidence,
          finding: assessment.reasoning,
        },
      })),
      maxConcurrent: DIMENSION_CONCURRENCY,
      policy: { mode: 'fail_all' },
    });

    const mitigations: Mitigation[] = panel.results.map((result, index) => {
      const assessment = flagged[index]!;
      if (!result.ok) throw new Error(`No mitigation for '${assessment.dimensionSlug}': ${result.error}`);
      if (!assessment.assessmentId) {
        throw new Error(`Assessment for '${assessment.dimensionSlug}' was never persisted; cannot attach a mitigation.`);
      }
      return {
        assessmentId: assessment.assessmentId,
        dimensionSlug: assessment.dimensionSlug,
        proposal: result.output.proposal.trim(),
        rationale: result.output.rationale.trim(),
        effort: result.output.effort,
        residualScore: result.output.residual_score,
      };
    });
    return { mitigations, residualScore: residualCompositeOf(state, mitigations) };
  };
}

export function flaggedThreshold(state: DecisionRiskState): number {
  const config = (state.scope?.analysisConfig?.mitigations ?? {}) as {
    flaggedThreshold?: number;
  };
  return config.flaggedThreshold ?? state.scope?.thresholds.flagged ?? 60;
}

/**
 * The composite recomputed with mitigated dimensions at their residual score.
 *
 * Carries the red team's adjustment, because the headline score does. Without
 * it the two numbers sit on different bases — a post-debate 71 next to a
 * pre-debate residual of 53 implies an 18-point improvement that is partly just
 * the two figures disagreeing about what they are measuring.
 */
export function residualCompositeOf(
  state: DecisionRiskState,
  mitigations: Mitigation[],
): number {
  const residualBySlug = new Map(
    mitigations.map((m) => [m.dimensionSlug, m.residualScore]),
  );
  const substituted = state.assessments.map((a) => ({
    ...a,
    score: residualBySlug.get(a.dimensionSlug) ?? a.score,
  }));
  const raw =
    compositeOf(substituted, state.dimensions).score +
    (state.debate?.adjustment ?? 0);
  return Math.min(100, Math.max(0, raw));
}
