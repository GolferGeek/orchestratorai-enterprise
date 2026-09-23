import { Logger } from '@nestjs/common';
import type { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../shared/services/observability.service';
import type { DecisionRiskState } from '../decision-risk.state';
import { buildUserMessage } from './assess-dimensions.node';
import { renderRadar } from './debate.node';

/**
 * The one thing a busy reader will actually read.
 *
 * Every number it cites has already been computed and stored — this node
 * narrates the run, it does not re-judge it. That is deliberate: if the summary
 * were allowed to form its own view, the headline and the stored score could
 * disagree and nobody would know which was the answer.
 */
export function createExecutiveSummaryNode(deps: {
  llm: LLMHttpClientService;
  observability?: ObservabilityService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const response = await deps.llm.callLLM({
      context: state.executionContext,
      systemMessage:
        `You write the executive summary of a completed risk assessment. ` +
        `Lead with the recommendation — proceed, proceed with conditions, or do not proceed — ` +
        `and the reasoning in one sentence. Then the two or three dimensions that actually ` +
        `drive the score, the mitigations that matter, and what would change the picture.\n\n` +
        `Where an uncertainty range is given, prefer it to the point score — a range is ` +
        `the more honest object and the reader should see it.\n\n` +
        `Use only the numbers given. Do not recompute, re-score or introduce a risk not ` +
        `in the assessment. Where confidence is low, say what is unknown rather than ` +
        `writing around it. Plain prose, under 350 words, no headings, no bullet lists.`,
      userMessage: buildSummaryInput(state),
      temperature: 0.4,
      callerName: 'decision-risk:summary',
    });

    deps.logger.log('Executive summary written');

    await deps.observability?.emitCompleted(
      state.executionContext,
      state.executionContext.conversationId,
      'Risk assessment complete',
    );

    return {
      executiveSummary: response.text.trim(),
      status: 'completed',
      completedAt: Date.now(),
    };
  };
}

export function buildSummaryInput(state: DecisionRiskState): string {
  const sections = [buildUserMessage(state), renderRadar(state)];

  if (state.debate) {
    sections.push(
      `RED TEAM REVIEW:\nThe score moved from ${state.debate.originalScore} to ` +
        `${state.debate.finalScore}.\n${state.debate.arbiter}`,
    );
  } else {
    sections.push(
      'RED TEAM REVIEW:\nNot triggered — the composite did not reach the debate threshold.',
    );
  }

  if (state.mitigations.length) {
    const lines = state.mitigations.map(
      (m) =>
        `- ${m.dimensionSlug}: ${m.proposal} (effort ${m.effort}; ` +
        `this dimension would fall to ${m.residualScore})`,
    );
    sections.push(
      `MITIGATIONS:\n${lines.join('\n')}\n\n` +
        `Composite if all are carried out: ${state.residualScore} ` +
        `(currently ${state.overallScore}).`,
    );
  } else {
    sections.push(
      'MITIGATIONS:\nNone proposed — no dimension reached the flagged threshold.',
    );
  }

  if (state.monteCarlo) {
    const c = state.monteCarlo.composite;
    const lines = [
      `Simulating ${c.trials.toLocaleString()} outcomes from each dimension's confidence:`,
      `the composite falls between ${c.p10} and ${c.p90} eight times out of ten,`,
      `with a ${Math.round(c.probabilityAboveAlert * 100)}% chance of reaching the alert threshold of ${c.alertThreshold}.`,
    ];
    if (state.monteCarlo.residual) {
      const r = state.monteCarlo.residual;
      lines.push(
        `After mitigation that range becomes ${r.p10} to ${r.p90}, with a ${Math.round(r.probabilityAboveAlert * 100)}% chance of still reaching the threshold.`,
      );
    }
    lines.push(
      'Treat the interval as a floor on the uncertainty: the simulation assumes the dimensions vary independently, and in reality they tend to go wrong together.',
    );
    sections.push(`UNCERTAINTY:\n${lines.join(' ')}`);
  }

  sections.push(
    `OVERALL CONFIDENCE: ${state.overallConfidence ?? 'unknown'} (0-1, weighted across dimensions).`,
  );

  return sections.join('\n\n');
}
