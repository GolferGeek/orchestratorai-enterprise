/**
 * Discovery Review — Graph Compilation Tests.
 *
 * These tests verify the graph compiles correctly and exposes the invoke() method.
 * Full end-to-end execution tests (with fixture documents) are in the Phase 1
 * graph integration spec — kept separate to avoid slow LLM calls in CI.
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

  it('graph runs end-to-end with fixture protocol and 3 pre-loaded documents', async () => {
    // LLM returns a valid classification for each of the 3 fixture documents
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

    const finalState = await graph.invoke(initialState, config);

    // Protocol is valid, documents pre-loaded: should reach 'completed'
    expect(finalState.status).toBe('completed');
    // All 3 documents should be classified or coded (Phase 2 runs coding after classify)
    expect(finalState.documentIndex).toHaveLength(fixtureDocuments.length);
    for (const entry of finalState.documentIndex as Array<{ status: string }>) {
      expect(['classified', 'coded']).toContain(entry.status);
    }
    // No errors
    expect(finalState.error).toBeUndefined();
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
