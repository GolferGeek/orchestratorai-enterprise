import { Logger } from '@nestjs/common';
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import type { LLMHttpClientService } from '../shared/services/llm-http-client.service';
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
 */
export function createDecisionRiskGraph(deps: {
  llm: LLMHttpClientService;
  store: RiskStoreService;
  logger?: Logger;
}): DecisionRiskGraph {
  const logger = deps.logger ?? new Logger('DecisionRiskGraph');
  const nodeDeps = { llm: deps.llm, store: deps.store, logger };

  const graph = new StateGraph(DecisionRiskStateAnnotation)
    .addNode('load_scope', createLoadScopeNode(nodeDeps))
    .addNode('assess_dimensions', createAssessDimensionsNode(nodeDeps))
    .addNode('aggregate', createAggregateNode(nodeDeps))
    .addNode('debate', createDebateNode(nodeDeps))
    .addNode('propose_mitigations', createProposeMitigationsNode(nodeDeps))
    .addNode('executive_summary', createExecutiveSummaryNode(nodeDeps))

    .addEdge('__start__', 'load_scope')
    .addEdge('load_scope', 'assess_dimensions')
    .addEdge('assess_dimensions', 'aggregate')
    .addConditionalEdges('aggregate', (state: DecisionRiskState) =>
      shouldDebate(state) ? 'debate' : 'propose_mitigations',
    )
    .addEdge('debate', 'propose_mitigations')
    .addEdge('propose_mitigations', 'executive_summary')
    .addEdge('executive_summary', END);

  return graph.compile();
}

/**
 * Debate when the scope has it enabled and the composite reaches its threshold.
 *
 * Exported and pure so the routing rule can be tested without standing up a
 * graph, a database or a model.
 */
export function shouldDebate(state: DecisionRiskState): boolean {
  const redTeam = (state.scope?.analysisConfig?.redTeam ?? {}) as {
    enabled?: boolean;
    debateThreshold?: number;
  };

  if (redTeam.enabled !== true) return false;
  if (state.overallScore === null) return false;

  const threshold = redTeam.debateThreshold ?? state.scope?.thresholds.debate ?? 65;
  return state.overallScore >= threshold;
}
