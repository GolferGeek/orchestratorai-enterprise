import { Logger } from '@nestjs/common';
import type { ObservabilityService } from '../../shared/services/observability.service';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState } from '../decision-risk.state';
import { runMonteCarlo } from '../monte-carlo';

/**
 * Turn the point estimate into a distribution.
 *
 * Runs after mitigations so it can simulate both the assessed composite and the
 * residual, and before the summary so the narrative can cite the interval
 * rather than a bare number.
 *
 * No LLM call. This is arithmetic, and the same rule applies as to the
 * composite: a number a reader cannot reconstruct is not worth printing.
 */
export function createMonteCarloNode(deps: {
  store: RiskStoreService;
  observability?: ObservabilityService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const { scope, assessments, dimensions, mitigations, executionContext } =
      state;

    if (!scope) {
      throw new Error('monte_carlo ran without a scope.');
    }

    await deps.store.setRunPhase(executionContext.conversationId, 'monte_carlo');

    const outcome = runMonteCarlo({
      assessments,
      dimensions,
      mitigations,
      alertThreshold: scope.thresholds.alert,
      debateAdjustment: state.debate?.adjustment ?? 0,
      // The thread id, so the same assessment re-derives the same interval.
      seed: executionContext.conversationId,
    });

    deps.logger.log(
      `Monte Carlo: composite ${outcome.composite.p10}-${outcome.composite.p90} ` +
        `(80% interval), ${Math.round(outcome.composite.probabilityAboveAlert * 100)}% ` +
        `chance of exceeding the alert threshold of ${scope.thresholds.alert}`,
    );

    await deps.observability?.emitProgress(
      executionContext,
      executionContext.conversationId,
      `Simulated ${outcome.composite.trials.toLocaleString()} outcomes`,
      {
        step: 'monte_carlo',
        progress: 93,
        p10: outcome.composite.p10,
        p90: outcome.composite.p90,
        probabilityAboveAlert: outcome.composite.probabilityAboveAlert,
      },
    );

    return { monteCarlo: outcome };
  };
}
