import { Logger } from '@nestjs/common';
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { IssueLedgerService } from '../shared/ledger';
import type { WorkUnitService } from '../shared/work-units';
import type { RiskStoreService } from './risk-store.service';
import {
  DecisionRiskStateAnnotation,
  type DecisionRiskState,
} from './decision-risk.state';
import { createLoadScopeNode } from './nodes/load-scope.node';
import { createAssessDimensionsNode } from './nodes/assess-dimensions.node';
import { createAggregateNode } from './nodes/aggregate.node';
import { createDebateNode } from './nodes/debate.node';
import { createConsolidateMitigationsNode } from './nodes/consolidate-mitigations.node';
import { createProposeMitigationsNode } from './nodes/propose-mitigations.node';
import { createReviewMitigationsNode } from './nodes/review-mitigations.node';
import { createMonteCarloNode } from './nodes/monte-carlo.node';
import { createExecutiveSummaryNode } from './nodes/executive-summary.node';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecisionRiskGraph = CompiledStateGraph<any, any, any>;

/**
 * Corporate decision risk, on the workflow runtime.
 *
 *   load_scope → assess_dimensions → aggregate → ┬→ red_team ─┐
 *                                                │            ↓
 *                                                └─→ propose_mitigations
 *                                                            ↓
 *                                                  consolidate_mitigations
 *                                                            ↓
 *                                                   review_mitigations (human gate)
 *                                                            ↓
 *                                                  monte_carlo → executive_summary → END
 *
 * Model calls are work units over the risk-* agent definitions: the radar is
 * a fail_all panel, the debate a red/blue unit with an arbiter, mitigations a
 * panel, the summary a solo unit. A person approves or edits the proposed
 * mitigations before anything is recorded or summarized. Flagged dimensions
 * are issues on the run's ledger; the review settles each one.
 *
 * What the graph does NOT contain is domain knowledge: which dimensions
 * exist, their weights and prompts, and how the debate is framed all come
 * from `risk.*`, passed to the agents as framing.
 *
 * NOTE ON NODE NAMES: LangGraph forbids a node name that collides with a
 * state channel, so the debate step is the `red_team` node writing the
 * `debate` channel.
 */
export function createDecisionRiskGraph(deps: {
  units: WorkUnitService;
  store: RiskStoreService;
  ledger: IssueLedgerService;
  checkpointer: BaseCheckpointSaver;
  logger?: Logger;
}): DecisionRiskGraph {
  const logger = deps.logger ?? new Logger('DecisionRiskGraph');
  const withUnits = { units: deps.units, store: deps.store, logger };

  const graph = new StateGraph(DecisionRiskStateAnnotation)
    .addNode('load_scope', createLoadScopeNode({ store: deps.store, logger }))
    .addNode('assess_dimensions', createAssessDimensionsNode(withUnits))
    .addNode('aggregate', createAggregateNode({ store: deps.store, logger }))
    .addNode('red_team', createDebateNode(withUnits))
    .addNode('propose_mitigations', createProposeMitigationsNode({ units: deps.units, ledger: deps.ledger, logger }))
    .addNode('consolidate_mitigations', createConsolidateMitigationsNode({ units: deps.units, logger }))
    .addNode('review_mitigations', createReviewMitigationsNode({ ...withUnits, ledger: deps.ledger }))
    .addNode('monte_carlo', createMonteCarloNode({ logger }))
    .addNode('executive_summary', createExecutiveSummaryNode({ units: deps.units, logger }))

    .addEdge('__start__', 'load_scope')
    .addEdge('load_scope', 'assess_dimensions')
    .addEdge('assess_dimensions', 'aggregate')
    .addConditionalEdges('aggregate', (state: DecisionRiskState) =>
      shouldDebate(state) ? 'red_team' : 'propose_mitigations',
    )
    .addEdge('red_team', 'propose_mitigations')
    .addEdge('propose_mitigations', 'consolidate_mitigations')
    .addEdge('consolidate_mitigations', 'review_mitigations')
    .addEdge('review_mitigations', 'monte_carlo')
    .addEdge('monte_carlo', 'executive_summary')
    .addEdge('executive_summary', END);

  return graph.compile({ checkpointer: deps.checkpointer });
}

/**
 * Should the red team run?
 *
 * Default is ALWAYS, whenever the scope enables it, and the threshold is an
 * opt-in economy rather than the rule.
 *
 * The original gate only argued about scores above the threshold, which had it
 * backwards. A high score is already going to be scrutinised by everyone who
 * reads it; a low one gets waved through. So a false LOW is the more dangerous
 * error, and it is the one a challenge would catch — the red prompt explicitly
 * asks for risks the assessment MISSED, not only for ones it overstated. Gating
 * on a high score meant the assessments most in need of a second opinion were
 * the only ones that never got one.
 *
 * It costs three extra calls on runs that would previously have skipped them.
 * A scope that would rather save them sets `redTeam.mode` to 'above-threshold'.
 *
 * Exported and pure so the rule can be tested without a graph, a database or a
 * model.
 */
export function shouldDebate(state: DecisionRiskState): boolean {
  const redTeam = (state.scope?.analysisConfig?.redTeam ?? {}) as {
    enabled?: boolean;
    mode?: 'always' | 'above-threshold';
    debateThreshold?: number;
  };

  if (redTeam.enabled !== true) return false;
  // Nothing to contest until the radar has produced a number.
  if (state.overallScore === null) return false;

  if ((redTeam.mode ?? 'always') === 'always') return true;

  const threshold =
    redTeam.debateThreshold ?? state.scope?.thresholds.debate ?? 65;
  return state.overallScore >= threshold;
}
