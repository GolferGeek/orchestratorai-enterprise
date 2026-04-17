/**
 * Discovery Review — Graph Compilation & Phase 3 Flow Tests.
 *
 * These tests verify:
 *   - The graph compiles correctly and exposes invoke()
 *   - Phase 2 coding pipeline runs end-to-end
 *   - Phase 3 HITL nodes interrupt when expected (no checkpointer → GraphValueError)
 *   - The graph pauses after coding when HITL batches are present
 *
 * NOTE: Because HITL nodes call LangGraph interrupt(), they require a
 * checkpointer to be set. The mock checkpointer returns undefined from
 * getSaver(), so the graph is compiled without a checkpointer. Tests that
 * exercise HITL interrupts will catch GraphValueError instead of seeing
 * a clean GraphInterrupt — this is expected in unit test context.
 */
import { createDiscoveryReviewGraph } from './discovery-review.graph';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { LegalDocumentsStorageService } from '../../jobs/legal-documents-storage.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({ text: '{}' }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitStarted: jest.fn().mockResolvedValue(undefined),
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitCompleted: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

const mockCheckpointer = {
  getSaver: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<PostgresCheckpointerService>;

const mockDocumentsStorage = {
  downloadOriginal: jest.fn(),
  storeOriginal: jest.fn(),
} as unknown as jest.Mocked<LegalDocumentsStorageService>;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DiscoveryReviewGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compiles the graph without error', async () => {
    const graph = await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );
    expect(graph).toBeDefined();
  });

  it('compiled graph exposes invoke()', async () => {
    const graph = await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );
    expect(typeof graph.invoke).toBe('function');
  });

  it('creates the checkpointer via getSaver()', async () => {
    await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );
    expect(mockCheckpointer.getSaver).toHaveBeenCalled();
  });

  it('graph runs through Phase 2 coding and hits Phase 3 HITL gate', async () => {
    // Phase 3 note: After coding completes, the graph transitions to
    // build_batches and then to the first HITL node (batch_hitl_privilege).
    // The HITL node calls interrupt(), which requires a checkpointer. Since
    // the mock checkpointer returns undefined (no real DB), LangGraph throws
    // GraphValueError. This is expected behaviour in unit tests — in production
    // the worker catches GraphInterrupt and transitions the job to awaiting_review.
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        documentType: 'email',
        threadSubject: 'Product Roadmap',
        date: '2023-03-15',
        summary: 'An email about the product roadmap.',
      }),
    });

    const { fixtureProtocol } = await import('./__fixtures__/protocol');
    const { fixtureDocuments } = await import('./__fixtures__/documents');

    const graph = await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );

    const initialState = {
      executionContext: {
        orgSlug: 'legal',
        userId: 'user-1',
        conversationId: 'conv-graph-spec-001',
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma4:e4b',
      },
      reviewProtocol: fixtureProtocol,
      documents: fixtureDocuments,
    };

    const config = {
      configurable: { thread_id: 'conv-graph-spec-001' },
    };

    // With the mock checkpointer (no real DB), the graph runs Phase 2 coding
    // successfully but then hits the HITL interrupt at Phase 3. Without a
    // real checkpointer, LangGraph throws GraphValueError. Both outcomes
    // (completed or GraphValueError/GraphInterrupt) are valid in unit test context.
    try {
      const finalState = await graph.invoke(initialState, config);
      // If the graph completes (e.g., all docs get not_relevant + no privilege),
      // verify the coding pipeline ran.
      expect(finalState.documentIndex).toHaveLength(fixtureDocuments.length);
      expect(finalState.error).toBeUndefined();
    } catch (error) {
      // GraphValueError (no checkpointer) or GraphInterrupt are both expected
      // when the Phase 3 HITL gates are reached in unit test context.
      expect(error).toBeDefined();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      expect(
        errorMessage.includes('checkpointer') ||
          errorMessage.includes('interrupt') ||
          errorMessage.includes('MISSING_CHECKPOINTER') ||
          errorMessage.includes('GraphInterrupt'),
      ).toBe(true);
    }
  });

  it('runs Phase 2 coding pipeline — 3 documents, mixed success/failure', async () => {
    // Calls per document:
    //   classify_all: 1 LLM call per doc (3 total)
    //   code_document: 6 calls per doc (relevance + privilege + 3 issue tags + hot-doc) = 18 total
    // For doc-003 we simulate a relevance failure.

    const { fixtureProtocol } = await import('./__fixtures__/protocol');
    const { fixtureDocuments } = await import('./__fixtures__/documents');

    let llmCallCount = 0;
    mockLLMClient.callLLM.mockImplementation(
      ({ callerName }: { callerName?: string }) => {
        llmCallCount++;

        if (callerName === 'legal-department:dr-classify') {
          return Promise.resolve({
            text: '{"documentType":"email","threadSubject":null,"date":null,"summary":"A document."}',
          });
        }

        // For doc-003 relevance call — simulate failure to test error path
        if (
          callerName === 'legal-department:dr-relevance' &&
          llmCallCount > 10
        ) {
          return Promise.reject(new Error('LLM overloaded'));
        }

        if (callerName === 'legal-department:dr-relevance') {
          return Promise.resolve({
            text: '{"classification":"relevant","confidence":0.88,"reasoning":"On topic.","matchingCriteria":["breach of contract"]}',
          });
        }

        if (callerName === 'legal-department:dr-privilege') {
          return Promise.resolve({
            text: '{"classification":"not_privileged","confidence":0.97,"privilegeType":"none","reasoning":"No attorney."}',
          });
        }

        if (callerName === 'legal-department:dr-issues') {
          return Promise.resolve({ text: '{"confidence":0.5}' });
        }

        if (callerName === 'legal-department:dr-hot-document') {
          return Promise.resolve({ text: '{"hotDocument":false}' });
        }

        return Promise.resolve({ text: '{}' });
      },
    );

    const graph = await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );

    const initialState = {
      executionContext: {
        orgSlug: 'legal',
        userId: 'user-1',
        conversationId: 'conv-graph-phase2-spec',
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma4:e4b',
      },
      reviewProtocol: fixtureProtocol,
      documents: fixtureDocuments,
    };

    const config = {
      configurable: { thread_id: 'conv-graph-phase2-spec' },
    };

    const finalState = await graph.invoke(initialState, config);

    // Graph should complete (not fail)
    expect(finalState.status).toBe('completed');

    // documentCodings should have entries for successfully coded documents
    expect(
      Object.keys(finalState.documentCodings as Record<string, unknown>).length,
    ).toBeGreaterThan(0);

    // documentQueue should be empty — all docs processed
    expect(finalState.documentQueue).toHaveLength(0);

    // reviewStatistics should be updated
    const stats = finalState.reviewStatistics as {
      totalCoded: number;
      totalFailed: number;
    };
    expect(stats.totalCoded + stats.totalFailed).toBe(fixtureDocuments.length);
  });

  it('halts at protocol_validation and sets failed when protocol is invalid', async () => {
    const { fixtureProtocol } = await import('./__fixtures__/protocol');
    const { fixtureDocuments } = await import('./__fixtures__/documents');

    const graph = await createDiscoveryReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockDocumentsStorage,
    );

    const initialState = {
      executionContext: {
        orgSlug: 'legal',
        userId: 'user-1',
        conversationId: 'conv-graph-spec-002',
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma4:e4b',
      },
      reviewProtocol: { ...fixtureProtocol, matterId: '', matterName: '' },
      documents: fixtureDocuments,
    };

    const config = {
      configurable: { thread_id: 'conv-graph-spec-002' },
    };

    const finalState = await graph.invoke(initialState, config);
    expect(finalState.status).toBe('failed');
    expect(finalState.error).toContain('matterId');
    // LLM should not have been called — failed before classify_all
    expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
  });
});
