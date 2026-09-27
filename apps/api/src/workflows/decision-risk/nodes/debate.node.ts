import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkUnitService } from '../../shared/work-units';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState } from '../decision-risk.state';
import { propositionInput, reportProgress, scopeOf } from './run-context';

/** The arbiter's ruling (its agent contract enforces it). */
interface ArbiterRuling {
  final_score: number;
  adjustment: number;
  rationale: string;
  would_change_my_mind: string;
}

/** Cap on how far one debate may move a score. */
export const MAX_DEBATE_ADJUSTMENT = 25;

/**
 * Red team / blue team, as one red/blue work unit: blue defends the radar's
 * verdict, red attacks it (including risks it MISSED), the arbiter rules.
 * Each is framed by the scope's own debate prompt from the risk schema.
 *
 * All three exchanges are stored in full: the adjusted number is worth much
 * less than the argument that produced it.
 */
export function createDebateNode(deps: {
  units: WorkUnitService;
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DecisionRiskState>> => {
    const { scope, subjectId, compositeScoreId, overallScore, executionContext } = state;
    if (!scope || !subjectId || !compositeScoreId || overallScore === null) {
      throw new Error('debate ran before a composite score existed.');
    }

    await reportProgress(config, 'red_team', 62, `Red team reviewing the composite of ${overallScore}`);
    const prompts = await deps.store.getDebatePrompts(scope.id);
    for (const role of ['blue', 'red', 'arbiter']) {
      if (!prompts[role]) throw new Error(`Scope '${scope.name}' has no active ${role} debate prompt.`);
    }
    const base = { ...propositionInput(state), assessment: renderRadar(state) };

    const { blue, red, decision } = await deps.units.runRedBlue<
      Record<string, unknown>,
      Record<string, unknown>,
      never,
      ArbiterRuling
    >(scopeOf(state), {
      slug: 'red-team',
      blue: { agent: 'risk-debate-defender', input: base, framing: prompts.blue },
      red: {
        agent: 'risk-debate-challenger',
        input: ({ blue: defence }) => ({ ...base, defence }),
        framing: prompts.red,
      },
      arbitrator: {
        agent: 'risk-debate-arbiter',
        input: ({ blue: defence, red: challenges }) => ({
          ...base,
          defence,
          challenges,
          score_before: overallScore,
        }),
        framing: prompts.arbiter,
      },
    });
    if (!decision) throw new Error('The red team ran without an arbiter ruling.');

    const finalScore = clampAdjustment(overallScore, decision.final_score, deps.logger);
    const adjustment = finalScore - overallScore;
    const debateId = await deps.store.recordDebate({
      context: executionContext,
      subjectId,
      compositeScoreId,
      blue,
      red,
      arbiter: {
        ruling: decision,
        requestedScore: decision.final_score,
        appliedScore: finalScore,
        rationale: decision.rationale,
        wouldChangeMyMind: decision.would_change_my_mind,
      },
      originalScore: overallScore,
      finalScore,
    });
    await deps.store.applyDebateToScore(compositeScoreId, debateId, finalScore, adjustment);

    deps.logger.log(`Debate moved the score ${overallScore} -> ${finalScore}`);
    await reportProgress(config, 'red_team', 72, `Red team moved the score ${overallScore} to ${finalScore}`);
    return {
      overallScore: finalScore,
      debate: {
        debateId,
        originalScore: overallScore,
        finalScore,
        adjustment,
        blue,
        red,
        arbiter: decision,
      },
    };
  };
}

export function clampAdjustment(original: number, requested: number, logger?: Logger): number {
  const delta = requested - original;
  if (Math.abs(delta) <= MAX_DEBATE_ADJUSTMENT) return requested;
  const clamped = original + Math.sign(delta) * MAX_DEBATE_ADJUSTMENT;
  logger?.warn(
    `Arbiter asked for ${requested} (${delta > 0 ? '+' : ''}${delta} from ${original}); ` +
      `clamped to ${clamped} at the ${MAX_DEBATE_ADJUSTMENT}-point limit.`,
  );
  return clamped;
}

/** The radar as the debating agents see it. */
export function renderRadar(state: DecisionRiskState): string {
  const bySlug = new Map(state.dimensions.map((d) => [d.slug, d]));
  const lines = state.assessments.map((a) => {
    const dimension = bySlug.get(a.dimensionSlug);
    const weight = dimension ? ` weight ${dimension.weight}` : '';
    return (
      `- ${dimension?.name ?? a.dimensionSlug} (${a.dimensionSlug}):` +
      ` score ${a.score}, confidence ${a.confidence}${weight}\n` +
      `  ${a.reasoning}`
    );
  });
  return `Composite: ${state.overallScore}\n\n${lines.join('\n')}`;
}
