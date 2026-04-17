import { createCodeDocumentNode } from './code-document.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { fixtureProtocol } from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLLMClient = { callLLM: jest.fn() } as any;
const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-codenode-spec',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  const docs = fixtureDocuments as DiscoveryReviewState['documents'];
  return {
    executionContext: baseCtx,
    reviewProtocol: fixtureProtocol,
    documents: docs,
    documentIndex: docs.map((d) => ({
      documentId: d.documentId,
      name: d.name,
      documentType: 'email',
      date: null,
      summary: 'A document.',
      status: 'classified' as const,
    })),
    documentQueue: [],
    currentDocumentId: 'doc-002',
    documentsCoded: [],
    documentsFailed: {},
    documentCodings: {},
    reviewBatches: [],
    batchDecisions: {},
    calibrationAdjustments: [],
    productionSet: [],
    privilegeLog: [],
    reviewStatistics: {
      totalDocuments: docs.length,
      totalCoded: 0,
      totalFailed: 0,
      relevanceBreakdown: {
        relevant: 0,
        not_relevant: 0,
        potentially_relevant: 0,
      },
      privilegeCount: 0,
      hotDocumentCount: 0,
      issueDistribution: {},
      humanCorrectionCount: 0,
      productionSetSize: 0,
    },
    status: 'coding',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  } as unknown as DiscoveryReviewState;
}

/**
 * Set up LLM mock for a successful coding cycle:
 *   call 1: relevance
 *   call 2: privilege
 *   calls 3-5: issue tags (fixtureProtocol has 3 tags)
 *   call 6: hot document
 */
function mockSuccessfulCodingCalls() {
  mockLLMClient.callLLM
    // relevance
    .mockResolvedValueOnce({
      text: '{"classification":"relevant","confidence":0.9,"reasoning":"Key contract.","matchingCriteria":["breach of contract"]}',
    })
    // privilege
    .mockResolvedValueOnce({
      text: '{"classification":"not_privileged","confidence":0.97,"privilegeType":"none","reasoning":"No attorney."}',
    })
    // issue tag 1
    .mockResolvedValueOnce({ text: '{"confidence":0.8}' })
    // issue tag 2
    .mockResolvedValueOnce({ text: '{"confidence":0.9}' })
    // issue tag 3
    .mockResolvedValueOnce({ text: '{"confidence":0.1}' })
    // hot document
    .mockResolvedValueOnce({
      text: '{"hotDocument":true,"hotDocumentReason":"IP clause is critical."}',
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CodeDocumentNode', () => {
  const codeDocumentNode = createCodeDocumentNode(
    mockLLMClient,
    mockObservability,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('success path', () => {
    it('writes DocumentCoding to documentCodings', async () => {
      mockSuccessfulCodingCalls();

      const result = await codeDocumentNode(makeState());

      expect(result.documentCodings).toBeDefined();
      expect(result.documentCodings!['doc-002']).toBeDefined();
      const coding = result.documentCodings!['doc-002']!;
      expect(coding.documentId).toBe('doc-002');
      expect(coding.relevance.classification).toBe('relevant');
      expect(coding.privilege.classification).toBe('not_privileged');
      expect(coding.issueTags).toHaveLength(3);
      expect(coding.hotDocument).toBe(true);
    });

    it('moves documentId to documentsCoded', async () => {
      mockSuccessfulCodingCalls();

      const result = await codeDocumentNode(
        makeState({ documentsCoded: ['doc-001'] }),
      );

      expect(result.documentsCoded).toContain('doc-001');
      expect(result.documentsCoded).toContain('doc-002');
    });

    it('updates documentIndex entry to coded status', async () => {
      mockSuccessfulCodingCalls();

      const result = await codeDocumentNode(makeState());

      const codedEntry = result.documentIndex!.find(
        (e) => e.documentId === 'doc-002',
      );
      expect(codedEntry!.status).toBe('coded');
    });

    it('clears currentDocumentId after successful coding', async () => {
      mockSuccessfulCodingCalls();

      const result = await codeDocumentNode(makeState());

      expect(result.currentDocumentId).toBeUndefined();
    });

    it('updates reviewStatistics after coding', async () => {
      mockSuccessfulCodingCalls();

      const result = await codeDocumentNode(makeState());

      const stats = result.reviewStatistics!;
      expect(stats.totalCoded).toBe(1);
      expect(stats.totalFailed).toBe(0);
      expect(stats.relevanceBreakdown.relevant).toBe(1);
      expect(stats.hotDocumentCount).toBe(1);
    });

    it('emits dr:document_coded event', async () => {
      mockSuccessfulCodingCalls();

      await codeDocumentNode(makeState());

      const calls = mockObservability.emitProgress.mock.calls as Array<
        [unknown, unknown, unknown, Record<string, unknown>]
      >;
      const codedEvent = calls.find((c) => c[3]?.step === 'dr:document_coded');
      expect(codedEvent).toBeDefined();
    });
  });

  describe('error path', () => {
    it('writes to documentsFailed when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const result = await codeDocumentNode(makeState());

      expect(result.documentsFailed).toBeDefined();
      expect(result.documentsFailed!['doc-002']).toContain('LLM timeout');
    });

    it('does NOT throw — continues after error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('Service unavailable'));

      await expect(codeDocumentNode(makeState())).resolves.not.toThrow();
    });

    it('updates documentIndex entry to failed status on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('Network error'));

      const result = await codeDocumentNode(makeState());

      const failedEntry = result.documentIndex!.find(
        (e) => e.documentId === 'doc-002',
      );
      expect(failedEntry!.status).toBe('failed');
      expect(failedEntry!.error).toContain('Network error');
    });

    it('increments totalFailed in reviewStatistics on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('Error'));

      const result = await codeDocumentNode(makeState());

      expect(result.reviewStatistics!.totalFailed).toBe(1);
      expect(result.reviewStatistics!.totalCoded).toBe(0);
    });

    it('clears currentDocumentId even on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('Error'));

      const result = await codeDocumentNode(makeState());

      expect(result.currentDocumentId).toBeUndefined();
    });

    it('logs to documentsFailed when currentDocumentId document is not in state.documents', async () => {
      const result = await codeDocumentNode(
        makeState({ currentDocumentId: 'doc-nonexistent' }),
      );

      expect(result.documentsFailed!['doc-nonexistent']).toContain('not found');
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });
  });

  describe('no-op when currentDocumentId is undefined', () => {
    it('returns empty object', async () => {
      const result = await codeDocumentNode(
        makeState({ currentDocumentId: undefined }),
      );

      expect(result).toEqual({});
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });
  });
});
