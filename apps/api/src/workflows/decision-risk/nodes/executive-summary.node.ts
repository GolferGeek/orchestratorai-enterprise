import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkUnitService } from '../../shared/work-units';
import type { DecisionRiskState } from '../decision-risk.state';
import { renderRadar } from './debate.node';
import { reportProgress, scopeOf } from './run-context';

/**
 * The executive summary, as one solo work unit. It narrates what happened
 * without re-judging it: every number comes from the state.
 */
export function createExecutiveSummaryNode(deps: { units: WorkUnitService; logger: Logger }) {
  return async (
    state: DecisionRiskState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DecisionRiskState>> => {
    await reportProgress(config, 'executive_summary', 95, 'Writing the executive summary');
    const summary = await deps.units.runSolo<string>(scopeOf(state), {
      slug: 'executive-summary',
      agent: 'risk-executive-summary',
      input: { assessment: buildSummaryInput(state) },
    });
    deps.logger.log('Executive summary written');
    return { executiveSummary: summary.trim() };
  };
}

export function buildSummaryInput(state: DecisionRiskState): string {
  const context = state.background?.trim();
  const sections = [
    `PROPOSITION:\n${state.proposition.trim()}`,
    `CONTEXT:\n${context ? context : 'None supplied.'}`,
    renderRadar(state),
  ];

  if (state.debate) {
    sections.push(
      `RED TEAM REVIEW:\nThe score moved from ${state.debate.originalScore} to ` +
        `${state.debate.finalScore}.\n${JSON.stringify(state.debate.arbiter)}`,
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
