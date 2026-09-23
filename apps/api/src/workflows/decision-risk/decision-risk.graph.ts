import { Logger } from '@nestjs/common';
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../shared/services/observability.service';
import type { RiskStoreService } from './risk-store.service';
import {
  DecisionRiskStateAnnotation,
  type DecisionRiskState,
} from './decision-risk.state';
import { createLoadScopeNode } from './nodes/load-scope.node';
import { createAssessDimensionsNode } from './nodes/assess-dimensions.node';
import { createAggregateNode } from './nodes/aggregate.node';
import { createDebateNode } from './nodes/debate.node';
import { createProposeMitigationsNode } from './nodes/propose-mitigations.node';
import { createMonteCarloNode } from './nodes/monte-carlo.node';
import { createExecutiveSummaryNode } from './nodes/executive-summary.node';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DecisionRiskGraph = CompiledStateGraph<any, any, any>;

/**
 * Corporate decision risk.
 *
 *   load_scope → assess_dimensions → aggregate → ┬→ debate ─┐
 *                                                │          ↓
 *                                                └─→ propose_mitigations
 *                                                          ↓
 *                                                    executive_summary → END
 *
 * The shape is the argument. Dimensions are assessed independently so they
 * cannot converge; the composite is deterministic arithmetic over weights held
 * in the database; the debate only runs when the score is high enough to be
 * worth contesting; mitigations turn a finding into a decision; and the summary
 * narrates what happened without re-judging it.
 *
 * What the graph does NOT contain is domain knowledge. Which dimensions exist,
 * how they are weighted, what each one asks, and how the debate is framed all
 * come from `risk.*`. Pointing this at a different scope gives a different
 * assessment with no code change — which is what makes it a starter platform
 * rather than a fixed product.
 *
 * NOTE ON NODE NAMES: LangGraph forbids a node name that collides with a state
 * channel. The debate step is therefore the `red_team` node writing the
 * `debate` channel, not a `debate` node. Graph construction throws on a
 * collision, which is why buildsTheGraph() is a test.
 */
export function createDecisionRiskGraph(deps: {
  llm: LLMHttpClientService;
  store: RiskStoreService;
  observability?: ObservabilityService;
  /**
   * LangGraph checkpointer. With one, a run is resumable and inspectable
   * mid-flight by thread_id; without one the graph still works but the state
   * between nodes is only in memory. Optional so the graph can be constructed
   * in a unit test without a database.
   */
  checkpointer?: BaseCheckpointSaver;
  logger?: Logger;
}): DecisionRiskGraph {
  const logger = deps.logger ?? new Logger('DecisionRiskGraph');
  const nodeDeps = {
    llm: deps.llm,
    store: deps.store,
    observability: deps.observability,
    logger,
  };

  const graph = new StateGraph(DecisionRiskStateAnnotation)
    .addNode('load_scope', createLoadScopeNode(nodeDeps))
    .addNode('assess_dimensions', createAssessDimensionsNode(nodeDeps))
    .addNode('aggregate', createAggregateNode(nodeDeps))
    .addNode('red_team', createDebateNode(nodeDeps))
    .addNode('propose_mitigations', createProposeMitigationsNode(nodeDeps))
    .addNode('monte_carlo', createMonteCarloNode(nodeDeps))
    .addNode('executive_summary', createExecutiveSummaryNode(nodeDeps))

    .addEdge('__start__', 'load_scope')
    .addEdge('load_scope', 'assess_dimensions')
    .addEdge('assess_dimensions', 'aggregate')
    .addConditionalEdges('aggregate', (state: DecisionRiskState) =>
      shouldDebate(state) ? 'red_team' : 'propose_mitigations',
    )
    .addEdge('red_team', 'propose_mitigations')
    .addEdge('propose_mitigations', 'monte_carlo')
    .addEdge('monte_carlo', 'executive_summary')
    .addEdge('executive_summary', END);

  return graph.compile(
    deps.checkpointer ? { checkpointer: deps.checkpointer } : undefined,
  );
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
