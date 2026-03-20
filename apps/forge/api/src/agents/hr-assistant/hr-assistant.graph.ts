import { StateGraph, END, CompiledStateGraph } from '@langchain/langgraph';
import {
  HrAssistantStateAnnotation,
  HrAssistantState,
  HrSource,
} from './hr-assistant.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { RagHttpClientService } from '../shared/services/rag-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const AGENT_SLUG = 'hr-assistant';
const COLLECTION_SLUG = 'hr-policy';
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.6;

const NO_RESULTS_MESSAGE =
  'I could not find relevant HR policy information. Please contact your HR representative directly.';

const SYSTEM_MESSAGE =
  'You are an HR Assistant. Answer questions about human resources policies, employee benefits, workplace guidelines, and company handbooks using the knowledge base. Always cite the source document when providing information. Be helpful and clear, but remind users to consult HR directly for sensitive or case-specific matters.';

/**
 * Create the HR Assistant graph.
 *
 * PATTERN_B: RAG Retrieve → LLM Call
 *
 * Flow:
 *   __start__ → initialize → retrieve → llm_call → END
 *                                ↓ (state.error set)
 *                         handle_error → END
 */
// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HrAssistantGraph = CompiledStateGraph<any, any, any>;

export async function createHrAssistantGraph(
  llmClient: LLMHttpClientService,
  ragClient: RagHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<HrAssistantGraph> {
  // Node: Initialize — validate ExecutionContext, emit started, set status
  async function initializeNode(
    state: HrAssistantState,
  ): Promise<Partial<HrAssistantState>> {
    const ctx = state.executionContext;

    if (!ctx.orgSlug) {
      throw new Error('ExecutionContext.orgSlug must not be empty');
    }
    if (!ctx.conversationId) {
      throw new Error('ExecutionContext.conversationId must not be empty');
    }

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting HR Assistant for question: ${state.userMessage}`,
    );

    return {
      status: 'running',
      startedAt: Date.now(),
    };
  }

  // Node: Retrieve — query the RAG collection and build context
  async function retrieveNode(
    state: HrAssistantState,
  ): Promise<Partial<HrAssistantState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Retrieving HR policy documents',
      { step: 'retrieve', progress: 30 },
    );

    let results;
    try {
      results = await ragClient.queryCollection({
        collectionSlug: COLLECTION_SLUG,
        orgSlug: ctx.orgSlug,
        query: state.userMessage,
        topK: TOP_K,
        similarityThreshold: SIMILARITY_THRESHOLD,
      });
    } catch (error) {
      return {
        error: `RAG retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }

    // If no results — return the configured no-results message and complete without LLM
    if (results.length === 0) {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        { result: NO_RESULTS_MESSAGE },
        Date.now() - state.startedAt,
      );

      return {
        result: NO_RESULTS_MESSAGE,
        sources: [],
        retrievedContext: '',
        status: 'completed',
      };
    }

    // Build the retrievedContext text block: one entry per result
    const retrievedContext = results
      .map((r) => `[Source: ${r.section || r.documentId}]\n${r.content}`)
      .join('\n\n');

    // Build the sources citation array
    const sources: HrSource[] = results.map((r) => ({
      score: r.score,
      excerpt: r.content,
      section: r.section || '',
      documentId: r.documentId,
    }));

    return {
      retrievedContext,
      sources,
      status: 'retrieving',
    };
  }

  // Node: LLM Call — generate the HR answer using retrieved context
  async function llmCallNode(
    state: HrAssistantState,
  ): Promise<Partial<HrAssistantState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating HR policy answer',
      { step: 'llm_call', progress: 70 },
    );

    const userMessage = `Question: ${state.userMessage}\n\nRelevant HR Policy Documents:\n${state.retrievedContext}\n\nPlease answer the question using the provided documents and cite your sources.`;

    let llmResponse;
    try {
      llmResponse = await llmClient.callLLM({
        context: ctx,
        systemMessage: SYSTEM_MESSAGE,
        userMessage,
        temperature: 0.3,
        maxTokens: 2000,
        callerName: AGENT_SLUG,
      });
    } catch (error) {
      return {
        error: `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      { result: llmResponse.text },
      Date.now() - state.startedAt,
    );

    return {
      result: llmResponse.text,
      status: 'completed',
    };
  }

  // Node: handle_error — emit failed event (name avoids conflict with state.error channel)
  async function handleErrorNode(
    state: HrAssistantState,
  ): Promise<Partial<HrAssistantState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
    };
  }

  // Build the graph
  const graph = new StateGraph(HrAssistantStateAnnotation)
    .addNode('initialize', initializeNode)
    .addNode('retrieve', retrieveNode)
    .addNode('llm_call', llmCallNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'initialize')
    .addEdge('initialize', 'retrieve')
    .addConditionalEdges('retrieve', (state) => {
      if (state.error) return 'handle_error';
      if (state.status === 'completed') return END;
      return 'llm_call';
    })
    .addConditionalEdges('llm_call', (state) => {
      if (state.error) return 'handle_error';
      return END;
    })
    .addEdge('handle_error', END);

  // Compile with checkpointer.
  // Cast to HrAssistantGraph to avoid TS2589 type depth limit.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as HrAssistantGraph;
  return compiled;
}
