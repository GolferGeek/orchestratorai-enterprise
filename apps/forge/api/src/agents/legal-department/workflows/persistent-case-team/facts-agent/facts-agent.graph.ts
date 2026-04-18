import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  FactsAgentStateAnnotation,
  type FactsAgentState,
} from './facts-agent.state';
import { createFactsStartNode } from './nodes/start.node';
import { createExtractEntitiesNode } from './nodes/extract-entities.node';
import { createExtractTimelineNode } from './nodes/extract-timeline.node';
import { createUpdateKnowledgeNode } from './nodes/update-knowledge.node';
import { createFactsCompleteNode } from './nodes/complete.node';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';
import type { LegalDocumentsStorageService } from '../../../jobs/legal-documents-storage.service';
import type { MatterRepository } from '../../../matter/matter.repository';

// Using state-specific generics. The `as unknown as FactsAgentGraph` cast in
// createFactsAgentGraph avoids TS2589 (type instantiation excessively deep)
// caused by LangGraph's deeply nested conditional types.
export type FactsAgentGraph = CompiledStateGraph<
  FactsAgentState,
  Partial<FactsAgentState>,
  string
>;

function isFailed(state: FactsAgentState): boolean {
  return state.status === 'failed';
}

export async function createFactsAgentGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  storage: LegalDocumentsStorageService,
  matterRepo: MatterRepository,
): Promise<FactsAgentGraph> {
  const startNode = createFactsStartNode(storage, observability);
  const extractEntitiesNode = createExtractEntitiesNode(
    llmClient,
    observability,
    matterRepo,
  );
  const extractTimelineNode = createExtractTimelineNode(
    llmClient,
    observability,
    matterRepo,
  );
  const updateKnowledgeNode = createUpdateKnowledgeNode(
    observability,
    matterRepo,
  );
  const completeNode = createFactsCompleteNode(observability);

  function handleErrorNode(_state: FactsAgentState): Partial<FactsAgentState> {
    return { status: 'failed' };
  }

  const graph = new StateGraph(FactsAgentStateAnnotation)
    .addNode('start', startNode)
    .addNode('extract_entities', extractEntitiesNode)
    .addNode('extract_timeline', extractTimelineNode)
    .addNode('update_knowledge', updateKnowledgeNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', (s) =>
      isFailed(s) ? 'handle_error' : 'extract_entities',
    )
    .addConditionalEdges('extract_entities', (s) =>
      isFailed(s) ? 'handle_error' : 'extract_timeline',
    )
    .addConditionalEdges('extract_timeline', (s) =>
      isFailed(s) ? 'handle_error' : 'update_knowledge',
    )
    .addConditionalEdges('update_knowledge', (s) =>
      isFailed(s) ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  // Cast via unknown to avoid TS2589 type depth limit.
  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as FactsAgentGraph;
}
