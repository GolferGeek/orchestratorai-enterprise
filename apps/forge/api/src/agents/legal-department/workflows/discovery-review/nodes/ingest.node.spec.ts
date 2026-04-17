import { createIngestNode } from './ingest.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { fixtureProtocol } from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as any;

const mockStorage = {
  downloadOriginal: jest.fn(),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-dr-001',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function makeBaseState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  return {
    executionContext: baseCtx,
    reviewProtocol: fixtureProtocol,
    documents: [],
    documentIndex: [],
    documentQueue: [],
    documentsCoded: [],
    documentsFailed: {},
    documentCodings: {},
    reviewBatches: [],
    batchDecisions: {},
    calibrationAdjustments: [],
    productionSet: [],
    privilegeLog: [],
    reviewStatistics: {
      totalDocuments: 0,
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
    status: 'ingesting',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  } as unknown as DiscoveryReviewState;
}

describe('IngestNode', () => {
  const ingestNode = createIngestNode(mockObservability, mockStorage);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pre-loaded documents path (tests / direct invocation)', () => {
    it('skips storage and builds index from pre-loaded documents', async () => {
      const state = makeBaseState({ documents: fixtureDocuments as any });
      const result = await ingestNode(state);

      expect(mockStorage.downloadOriginal).not.toHaveBeenCalled();
      expect(result.documentIndex).toHaveLength(fixtureDocuments.length);
      expect(result.documentQueue).toEqual(
        fixtureDocuments.map((d) => d.documentId),
      );
      expect(result.status).toBe('classifying');
    });

    it('sets totalDocuments in reviewStatistics', async () => {
      const state = makeBaseState({ documents: fixtureDocuments as any });
      const result = await ingestNode(state);
      expect(result.reviewStatistics?.totalDocuments).toBe(
        fixtureDocuments.length,
      );
    });

    it('initializes document index with ingested status', async () => {
      const state = makeBaseState({ documents: fixtureDocuments as any });
      const result = await ingestNode(state);
      for (const entry of result.documentIndex!) {
        expect(entry.status).toBe('ingested');
        expect(entry.documentType).toBe('unknown');
      }
    });

    it('emits dr:ingest_complete event', async () => {
      const state = makeBaseState({ documents: fixtureDocuments as any });
      await ingestNode(state);
      const calls = mockObservability.emitProgress.mock.calls;
      const ingestComplete = calls.find(
        (c: any[]) => c[3]?.step === 'dr:ingest_complete',
      );
      expect(ingestComplete).toBeDefined();
    });
  });

  describe('storage path (real job run)', () => {
    it('loads documents from storage and builds index', async () => {
      mockStorage.downloadOriginal.mockResolvedValue({
        data: Buffer.from('Document content here'),
        contentType: 'text/plain',
      });

      const state = makeBaseState({
        documentPaths: ['uploads/job-1/0-file.txt', 'uploads/job-1/1-file.txt'],
      } as any);
      const result = await ingestNode(state);

      expect(result.documents).toHaveLength(2);
      expect(result.documentIndex).toHaveLength(2);
      expect(result.status).toBe('classifying');
    });

    it('puts failed documents in documentsFailed without halting', async () => {
      mockStorage.downloadOriginal
        .mockResolvedValueOnce({
          data: Buffer.from('Good content'),
          contentType: 'text/plain',
        })
        .mockRejectedValueOnce(new Error('Storage read error'));

      const state = makeBaseState({
        documentPaths: ['uploads/job-1/0-good.txt', 'uploads/job-1/1-bad.txt'],
      } as any);
      const result = await ingestNode(state);

      expect(result.documents).toHaveLength(1);
      expect(Object.keys(result.documentsFailed!)).toHaveLength(1);
      const failedError = Object.values(result.documentsFailed!)[0];
      expect(failedError).toContain('Storage read error');
      // Status should still be classifying — one document succeeded
      expect(result.status).toBe('classifying');
    });

    it('fails when all documents fail to load', async () => {
      mockStorage.downloadOriginal.mockRejectedValue(new Error('Bucket error'));

      const state = makeBaseState({
        documentPaths: ['uploads/job-1/0-bad.txt'],
      } as any);
      const result = await ingestNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('All 1 documents failed to ingest');
    });

    it('fails with structured error when no document paths provided', async () => {
      const state = makeBaseState();
      const result = await ingestNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No documents provided');
    });

    it('emits dr:document_ingested per successful document', async () => {
      mockStorage.downloadOriginal.mockResolvedValue({
        data: Buffer.from('content'),
        contentType: 'text/plain',
      });

      const state = makeBaseState({
        documentPaths: ['uploads/job-1/0-doc.txt'],
      } as any);
      await ingestNode(state);

      const calls = mockObservability.emitProgress.mock.calls;
      const ingestedCalls = calls.filter(
        (c: any[]) => c[3]?.step === 'dr:document_ingested',
      );
      expect(ingestedCalls).toHaveLength(1);
    });
  });
});
