import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  DocumentsAgentStateAnnotation,
  type DocumentsAgentState,
} from './documents-agent.state';
import { createDocsStartNode } from './nodes/start.node';
import { createClassifyDocumentNode } from './nodes/classify-document.node';
import { createExtractMetadataNode } from './nodes/extract-metadata.node';
import { createUpdateIndexNode } from './nodes/update-index.node';
import { createDocsCompleteNode } from './nodes/complete.node';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';
import type { LegalDocumentsStorageService } from '../../../jobs/legal-documents-storage.service';
import type { MatterRepository } from '../../../matter/matter.repository';

// Using state-specific generics. The `as unknown as DocumentsAgentGraph` cast
// avoids TS2589 (type instantiation excessively deep) from LangGraph internals.
export type DocumentsAgentGraph = CompiledStateGraph<
  DocumentsAgentState,
  Partial<DocumentsAgentState>,
  string
>;

function isFailed(state: DocumentsAgentState): boolean {
  return state.status === 'failed';
}

export async function createDocumentsAgentGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  storage: LegalDocumentsStorageService,
  matterRepo: MatterRepository,
): Promise<DocumentsAgentGraph> {
  const startNode = createDocsStartNode(storage, observability);
  const classifyNode = createClassifyDocumentNode(
    llmClient,
    observability,
    matterRepo,
  );
  const extractMetadataNode = createExtractMetadataNode(
    llmClient,
    observability,
    matterRepo,
  );
  const updateIndexNode = createUpdateIndexNode(observability, matterRepo);
  const completeNode = createDocsCompleteNode(observability);

  function handleErrorNode(
    _state: DocumentsAgentState,
  ): Partial<DocumentsAgentState> {
    return { status: 'failed' };
  }

  const graph = new StateGraph(DocumentsAgentStateAnnotation)
    .addNode('start', startNode)
    .addNode('classify_document', classifyNode)
    .addNode('extract_metadata', extractMetadataNode)
    .addNode('update_index', updateIndexNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addConditionalEdges('start', (s) =>
      isFailed(s) ? 'handle_error' : 'classify_document',
    )
    .addConditionalEdges('classify_document', (s) =>
      isFailed(s) ? 'handle_error' : 'extract_metadata',
    )
    .addConditionalEdges('extract_metadata', (s) =>
      isFailed(s) ? 'handle_error' : 'update_index',
    )
    .addConditionalEdges('update_index', (s) =>
      isFailed(s) ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  // Cast via unknown to avoid TS2589 type depth limit.
  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DocumentsAgentGraph;
}
