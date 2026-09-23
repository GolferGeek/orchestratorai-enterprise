import { Logger } from '@nestjs/common';
import type { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState, Mitigation } from '../decision-risk.state';
import { parseJsonResponse, requireBoundedNumber } from './parse-json-response';
import { buildUserMessage } from './assess-dimensions.node';
import { compositeOf } from './aggregate.node';

interface MitigationResponse {
  proposal: unknown;
  rationale?: unknown;
  effort?: unknown;
  residual_score: unknown;
}

const EFFORTS = new Set(['low', 'medium', 'high']);

/**
 * For every dimension that came back flagged, what would you do about it, and
 * what does the score become if you do?
 *
 * This is the step the original engine never had. A risk report without it
 * tells an executive they have a problem; with it, they have a decision.
 *
 * The residual composite is recomputed with the same weighted mean used for the
 * original — mitigated dimensions substitute their residual score, unflagged
 * ones keep theirs — so "72 before, 48 after" is arithmetic a reader can check,
 * not a second opinion from a model.
 */
export function createProposeMitigationsNode(deps: {
  llm: LLMHttpClientService;
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const { scope, subjectId, assessments, dimensions, executionContext } =
      state;

    if (!scope || !subjectId) {
      throw new Error('propose_mitigations ran without a scope or subject.');
    }

    const threshold = flaggedThreshold(state);
    const flagged = assessments.filter((a) => a.score >= threshold);

    if (!flagged.length) {
      deps.logger.log(
        `No dimension reached the flagged threshold of ${threshold}; nothing to mitigate.`,
      );
      return { mitigations: [], residualScore: state.overallScore };
    }

    const proposition = buildUserMessage(state);
    const nameBySlug = new Map(dimensions.map((d) => [d.slug, d.name]));

    const mitigations: Mitigation[] = await Promise.all(
      flagged.map(async (assessment) => {
        if (!assessment.assessmentId) {
          throw new Error(
            `Assessment for '${assessment.dimensionSlug}' was never persisted; cannot attach a mitigation.`,
          );
        }

        const response = await deps.llm.callLLM({
          context: executionContext,
          systemMessage:
            `You propose a mitigation for one dimension of a risk assessment. ` +
            `Propose the single highest-value action that is realistically available — ` +
            `specific enough to assign to someone, not a restatement of the risk. ` +
            `Then state honestly what this dimension would score if it were done. ` +
            `A mitigation that barely moves the score is worth saying so about; ` +
            `do not claim a large reduction to look useful. ` +
            `Respond with JSON only: ` +
            `{"proposal": "<string>", "rationale": "<string>", "effort": "low"|"medium"|"high", "residual_score": <integer 0-100>}`,
          userMessage:
            `${proposition}\n\n` +
            `DIMENSION: ${nameBySlug.get(assessment.dimensionSlug) ?? assessment.dimensionSlug}\n` +
            `CURRENT SCORE: ${assessment.score} (confidence ${assessment.confidence})\n` +
            `FINDING: ${assessment.reasoning}`,
          temperature: 0.4,
          callerName: `decision-risk:mitigate-${assessment.dimensionSlug}`,
        });

        const parsed = parseJsonResponse<MitigationResponse>(
          response.text,
          `Mitigation for '${assessment.dimensionSlug}'`,
        );

        const effort = String(parsed.effort ?? 'medium').toLowerCase();

        return {
          assessmentId: assessment.assessmentId,
          dimensionSlug: assessment.dimensionSlug,
          proposal: String(parsed.proposal ?? '').trim(),
          rationale: String(parsed.rationale ?? '').trim(),
          effort: (EFFORTS.has(effort) ? effort : 'medium') as Mitigation['effort'],
          residualScore: Math.round(
            requireBoundedNumber(
              parsed.residual_score,
              `Mitigation residual_score for '${assessment.dimensionSlug}'`,
              0,
              100,
            ),
          ),
        };
      }),
    );

    await deps.store.recordMitigations(
      subjectId,
      mitigations,
      executionContext.provider,
      executionContext.model,
    );

    const residualScore = residualCompositeOf(state, mitigations);

    deps.logger.log(
      `${mitigations.length} mitigation(s); composite ${state.overallScore} -> ${residualScore} if all are done`,
    );

    return { mitigations, residualScore };
  };
}

/** Scope-configured, with the scope's own `flagged` threshold as the default. */
export function flaggedThreshold(state: DecisionRiskState): number {
  const config = (state.scope?.analysisConfig?.mitigations ?? {}) as {
    flaggedThreshold?: number;
  };
  return config.flaggedThreshold ?? state.scope?.thresholds.flagged ?? 60;
}

/** The composite recomputed with mitigated dimensions at their residual score. */
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
  return compositeOf(substituted, state.dimensions).score;
}
