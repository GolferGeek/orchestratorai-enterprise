import { Logger } from '@nestjs/common';
import type { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState } from '../decision-risk.state';
import { parseJsonResponse, requireBoundedNumber } from './parse-json-response';
import { buildUserMessage } from './assess-dimensions.node';

interface ArbiterResponse {
  final_score: unknown;
  adjustment?: unknown;
  rationale?: unknown;
  would_change_my_mind?: unknown;
}

/** Cap on how far one debate may move a score. */
export const MAX_DEBATE_ADJUSTMENT = 25;

/**
 * Red team / blue team.
 *
 * Blue defends the radar's verdict, red attacks it, an arbiter rules. Runs only
 * when the composite crosses the scope's debate threshold, because arguing
 * about a low score is expensive and changes nothing.
 *
 * The three exchanges are stored in full. The adjusted number is worth much
 * less than the argument that produced it — a reader who disagrees with the
 * arbiter can see exactly what it discarded.
 */
export function createDebateNode(deps: {
  llm: LLMHttpClientService;
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const {
      scope,
      subjectId,
      compositeScoreId,
      overallScore,
      executionContext,
    } = state;

    if (!scope || !subjectId || !compositeScoreId || overallScore === null) {
      throw new Error('debate ran before a composite score existed.');
    }

    const prompts = await deps.store.getDebatePrompts(scope.id);
    const radar = renderRadar(state);
    const proposition = buildUserMessage(state);

    const blue = await deps.llm.callLLM({
      context: executionContext,
      systemMessage: prompts.blue,
      userMessage: `${proposition}\n\nASSESSMENT UNDER REVIEW:\n${radar}`,
      temperature: 0.4,
      callerName: 'decision-risk:debate-blue',
    });

    const red = await deps.llm.callLLM({
      context: executionContext,
      systemMessage: prompts.red,
      userMessage: `${proposition}\n\nASSESSMENT UNDER REVIEW:\n${radar}\n\nDEFENCE:\n${blue.text}`,
      temperature: 0.6,
      callerName: 'decision-risk:debate-red',
    });

    const arbiter = await deps.llm.callLLM({
      context: executionContext,
      systemMessage: prompts.arbiter,
      userMessage:
        `${proposition}\n\nASSESSMENT UNDER REVIEW:\n${radar}\n` +
        `\nDEFENCE:\n${blue.text}\n\nCHALLENGES:\n${red.text}\n` +
        `\nThe composite score before this debate was ${overallScore}.`,
      temperature: 0.2,
      callerName: 'decision-risk:debate-arbiter',
    });

    const verdict = parseJsonResponse<ArbiterResponse>(
      arbiter.text,
      'Debate arbiter',
    );

    const requested = Math.round(
      requireBoundedNumber(verdict.final_score, 'Arbiter final_score', 0, 100),
    );

    // The arbiter is instructed to justify anything beyond 15 points. This
    // clamp is a separate, harder stop: a single debate should refine a score,
    // not replace the radar. Clamping is recorded, never silent.
    const finalScore = clampAdjustment(
      overallScore,
      requested,
      deps.logger,
    );
    const adjustment = finalScore - overallScore;

    const debateId = await deps.store.recordDebate({
      subjectId,
      compositeScoreId,
      conversationId: executionContext.conversationId,
      blue: { raw: blue.text },
      red: { raw: red.text },
      arbiter: {
        raw: arbiter.text,
        requestedScore: requested,
        appliedScore: finalScore,
        rationale: verdict.rationale ?? null,
        wouldChangeMyMind: verdict.would_change_my_mind ?? null,
      },
      originalScore: overallScore,
      finalScore,
    });

    await deps.store.applyDebateToScore(
      compositeScoreId,
      debateId,
      finalScore,
      adjustment,
    );

    deps.logger.log(
      `Debate moved the score ${overallScore} -> ${finalScore} (${adjustment >= 0 ? '+' : ''}${adjustment})`,
    );

    return {
      overallScore: finalScore,
      debate: {
        debateId,
        originalScore: overallScore,
        finalScore,
        adjustment,
        blue: blue.text,
        red: red.text,
        arbiter: arbiter.text,
      },
    };
  };
}

export function clampAdjustment(
  original: number,
  requested: number,
  logger?: Logger,
): number {
  const delta = requested - original;
  if (Math.abs(delta) <= MAX_DEBATE_ADJUSTMENT) return requested;

  const clamped =
    original + Math.sign(delta) * MAX_DEBATE_ADJUSTMENT;
  logger?.warn(
    `Arbiter asked for ${requested} (${delta > 0 ? '+' : ''}${delta} from ${original}); ` +
      `clamped to ${clamped} at the ${MAX_DEBATE_ADJUSTMENT}-point limit.`,
  );
  return clamped;
}

/** The radar as the debating models see it. */
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
