import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { IssueLedgerService, RaisedIssue } from '../../shared/ledger';
import type { WorkUnitService } from '../../shared/work-units';
import type { DecisionRiskState, DimensionAssessment, Mitigation } from '../decision-risk.state';
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
 *
 * Every flagged dimension is also an issue on the run's ledger (stage
 * RADAR_STAGE, key `dimension:<slug>`). Raising replaces the stage's issues,
 * so a re-run drops a dimension that is no longer flagged and keeps any
 * decision already made on one that still is.
 */
export function createProposeMitigationsNode(deps: {
  units: WorkUnitService;
  ledger: IssueLedgerService;
  logger: Logger;
}) {
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
    const nameBySlug = new Map(dimensions.map((d) => [d.slug, d.name]));
    await deps.ledger.raise(
      scopeOf(state),
      RADAR_STAGE,
      flagged.map((a) => flaggedIssue(state, a, nameBySlug.get(a.dimensionSlug) ?? a.dimensionSlug)),
    );
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
    const base = propositionInput(state);
    const panel = await deps.units.runPanel<ProposedMitigation>(scopeOf(state), {
      slug: 'propose-mitigations',
      panelists: flagged.map((assessment) => ({
        agent: 'risk-mitigation-proposer',
        label: nameBySlug.get(assessment.dimensionSlug) ?? assessment.dimensionSlug,
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

/** The ledger stage that holds the flagged dimensions. */
export const RADAR_STAGE = 'risk-radar';

export const issueKeyOf = (dimensionSlug: string): string => `dimension:${dimensionSlug}`;

/** A flagged dimension as a ledger issue; severity follows the scope's thresholds. */
export function flaggedIssue(state: DecisionRiskState, assessment: DimensionAssessment, name: string): RaisedIssue {
  const thresholds = state.scope?.thresholds ?? { flagged: 60, debate: 65, alert: 80 };
  const severity =
    assessment.score >= thresholds.alert ? 'critical' : assessment.score >= thresholds.debate ? 'high' : 'medium';
  return {
    issueKey: issueKeyOf(assessment.dimensionSlug),
    source: 'risk-radar',
    severity,
    category: assessment.dimensionSlug,
    title: `${name} risk scores ${assessment.score}`,
    finding: assessment.reasoning,
    subject: { dimension: assessment.dimensionSlug, score: assessment.score, confidence: assessment.confidence },
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
