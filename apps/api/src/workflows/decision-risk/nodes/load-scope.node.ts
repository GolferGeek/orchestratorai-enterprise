import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState } from '../decision-risk.state';

export const DECISION_RISK_WORKFLOW_SLUG = 'decision-risk';

/**
 * Resolve the configuration this run is governed by: the scope for the calling
 * org, its dimensions and their prompts, and the subject row for the
 * proposition.
 *
 * Everything that varies between customers is read here, and nothing after this
 * node knows where it came from.
 */
export function createLoadScopeNode(deps: {
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const { executionContext, proposition } = state;

    if (!proposition?.trim()) {
      throw new Error('decision-risk requires a proposition to assess.');
    }

    const scope = await deps.store.findScope(
      executionContext.orgSlug,
      DECISION_RISK_WORKFLOW_SLUG,
    );
    const dimensions = await deps.store.listDimensions(scope.id);

    // Identify the subject by a hash of the proposition, so re-running the same
    // question builds history against one subject instead of a new row each
    // time — which is what makes score-over-time meaningful.
    const identifier = createHash('sha256')
      .update(proposition.trim())
      .digest('hex')
      .slice(0, 32);

    const subjectId = await deps.store.upsertSubject(
      scope.id,
      identifier,
      truncateName(proposition),
      {
        proposition: proposition.trim(),
        background: state.background?.trim() || undefined,
        createdBy: executionContext.userId,
      },
    );

    deps.logger.log(
      `Scope '${scope.name}' with ${dimensions.length} dimensions; subject ${subjectId}`,
    );

    return { scope, dimensions, subjectId, status: 'in_progress' };
  };
}

function truncateName(proposition: string, max = 120): string {
  const single = proposition.trim().replace(/\s+/g, ' ');
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}
