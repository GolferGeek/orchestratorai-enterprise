import { END, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { WorkUnitService } from '../shared/work-units';
import { createCheckNode } from './nodes/check.node';
import { createCoachNode } from './nodes/coach.node';
import { createGateNode, routeAfterGate } from './nodes/gate.node';
import { createLoadNode } from './nodes/load.node';
import { createPickNode } from './nodes/pick.node';
import { createStandingsNode } from './nodes/standings.node';
import { createWriteNode } from './nodes/write.node';
import type { SwarmStoreService } from './swarm-store.service';
import { SwarmStateAnnotation } from './swarm.state';

/**
 * Marketing swarm:
 *
 *   load -> write -> check -> gate -+-> coach -> rewrite -> check (loop, up to maxEditCycles)
 *                                   +-> rank -> pick (human) -> END
 *
 * Writers write; Jev scores facets; editors' gates, the standings and the
 * winner rule are code; the coach only explains.
 */
export function createSwarmGraph(deps: { units: WorkUnitService; store: SwarmStoreService; checkpointer: BaseCheckpointSaver }) {
  return new StateGraph(SwarmStateAnnotation)
    .addNode('load', createLoadNode({ store: deps.store }))
    .addNode('write', createWriteNode({ units: deps.units, revise: false }))
    .addNode('check', createCheckNode({ units: deps.units }))
    .addNode('gate', createGateNode())
    .addNode('coach', createCoachNode({ units: deps.units }))
    .addNode('rewrite', createWriteNode({ units: deps.units, revise: true }))
    .addNode('rank', createStandingsNode())
    .addNode('pick', createPickNode({ units: deps.units }))
    .addEdge('__start__', 'load')
    .addEdge('load', 'write')
    .addEdge('write', 'check')
    .addEdge('check', 'gate')
    .addConditionalEdges('gate', routeAfterGate, { coach: 'coach', standings: 'rank' })
    .addEdge('coach', 'rewrite')
    .addEdge('rewrite', 'check')
    .addEdge('rank', 'pick')
    .addEdge('pick', END)
    .compile({ checkpointer: deps.checkpointer });
}
