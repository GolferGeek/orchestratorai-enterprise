import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import type { IssueLedgerService, IssueStatusChange } from '../../shared/ledger';
import type { WorkUnitService } from '../../shared/work-units';
import type { RiskStoreService } from '../risk-store.service';
import type { DecisionRiskState, Mitigation } from '../decision-risk.state';
import { RADAR_STAGE, issueKeyOf, residualCompositeOf } from './propose-mitigations.node';
import { reportProgress, scopeOf } from './run-context';

/**
 * A person approves the proposed mitigations, or decides per item: accept,
 * reject (drop it), or modify (the replacement is the new proposal text).
 * Items a modify decision does not mention are kept.
 */
export const MITIGATION_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'approve-mitigations',
  kind: 'approval',
  allowedDecisions: ['approve', 'modify'],
  allowItemDecisions: true,
  onReject: 'fail',
  taskTitle: 'Review the proposed risk mitigations',
};

/**
 * The human gate. No model is called in this node (the gate re-runs on
 * resume); proposals come from propose_mitigations. Only the approved
 * mitigations are recorded, and the residual score is recomputed from them.
 *
 * The decision settles each flagged dimension's ledger issue: accepted with
 * its approved mitigation, or not_addressed when the mitigation was dropped.
 * The actor names the review row (gate and round), which records who decided.
 */
export function createReviewMitigationsNode(deps: {
  units: WorkUnitService;
  store: RiskStoreService;
  ledger: IssueLedgerService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DecisionRiskState>> => {
    const { subjectId, executionContext, mitigations } = state;
    if (!subjectId) throw new Error('review_mitigations ran without a subject.');
    if (mitigations.length === 0) return {};

    const round = state.mitigationReviewRound;
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'review-mitigations',
      gate: MITIGATION_GATE,
      round,
      payload: {
        proposition: state.proposition,
        overallScore: state.overallScore,
        residualScore: state.residualScore,
        items: mitigations.map((m) => ({
          itemId: m.dimensionSlug,
          dimension: state.dimensions.find((d) => d.slug === m.dimensionSlug)?.name ?? m.dimensionSlug,
          proposal: m.proposal,
          rationale: m.rationale,
          effort: m.effort,
          residualScore: m.residualScore,
        })),
      },
    });

    const route = routeAfterDecision(MITIGATION_GATE, response);
    let approved: Mitigation[];
    if (route === 'approved') {
      approved = mitigations;
    } else if (route === 'modified' && response.kind === 'decision' && response.decision.type === 'modify') {
      approved = applyItemDecisions(mitigations, response.decision.items);
    } else {
      throw new Error(`The mitigation review ended with "${route}", which this gate does not allow.`);
    }

    await deps.ledger.move(
      scopeOf(state),
      ledgerDecisions(mitigations, approved),
      `review:${MITIGATION_GATE.slug}#${round}`,
    );
    await deps.store.recordMitigations(executionContext, subjectId, approved);
    const residualScore = residualCompositeOf(state, approved);
    deps.logger.log(`${approved.length} of ${mitigations.length} mitigation(s) approved`);
    await reportProgress(
      config,
      'review_mitigations',
      88,
      `${approved.length} mitigation(s) approved; composite ${state.overallScore} -> ${residualScore} if all are done`,
    );
    return { mitigations: approved, residualScore, mitigationReviewRound: round + 1 };
  };
}

/** How the review settles each proposed mitigation's ledger issue. */
export function ledgerDecisions(proposed: Mitigation[], approved: Mitigation[]): IssueStatusChange[] {
  const kept = new Map(approved.map((m) => [m.dimensionSlug, m]));
  return proposed.map((m) => {
    const approvedOne = kept.get(m.dimensionSlug);
    return approvedOne
      ? { stageSlug: RADAR_STAGE, issueKey: issueKeyOf(m.dimensionSlug), status: 'accepted', rationale: `Mitigation: ${approvedOne.proposal}` }
      : { stageSlug: RADAR_STAGE, issueKey: issueKeyOf(m.dimensionSlug), status: 'not_addressed', rationale: 'The reviewer dropped the proposed mitigation' };
  });
}

/** Apply per-item decisions. A modify replacement must be the new proposal text. */
export function applyItemDecisions(
  mitigations: Mitigation[],
  items: Array<{ itemId: string; decision: 'accept' | 'reject' | 'modify'; replacement?: unknown }>,
): Mitigation[] {
  const known = new Set(mitigations.map((m) => m.dimensionSlug));
  for (const item of items) {
    if (!known.has(item.itemId)) throw new Error(`No mitigation for "${item.itemId}" to decide on.`);
  }
  const byId = new Map(items.map((item) => [item.itemId, item]));
  return mitigations.flatMap((m) => {
    const item = byId.get(m.dimensionSlug);
    if (!item || item.decision === 'accept') return [m];
    if (item.decision === 'reject') return [];
    if (typeof item.replacement !== 'string' || item.replacement.trim() === '') {
      throw new Error(`The new proposal for "${m.dimensionSlug}" must be non-empty text.`);
    }
    return [{ ...m, proposal: item.replacement.trim() }];
  });
}
