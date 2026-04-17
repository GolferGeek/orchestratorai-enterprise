/**
 * Unit tests for build-batches.node.ts
 *
 * Verifies:
 *  - Batch ordering (privilege, low_confidence, hot_documents, sample)
 *  - Empty batches are skipped
 *  - Low-confidence batch sorted ascending by confidence
 *  - Sample fraction is ~5% of high-confidence not_relevant pool
 */
import { createBuildBatchesNode } from './build-batches.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type { DocumentCoding, ReviewProtocol } from '../discovery-review.types';

function makeObservability() {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn().mockResolvedValue(undefined),
  };
}

const BASE_CONTEXT = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const BASE_PROTOCOL: ReviewProtocol = {
  matterId: 'matter-1',
  matterName: 'Test Matter',
  relevanceCriteria: { claims: [], keyParties: [], keyTopics: [] },
  privilegeHolders: { attorneys: [], firms: [], inHouseCounsel: [] },
  issueTags: [],
  batchSize: 50,
  confidenceThreshold: 0.7,
  privilegeReviewRequired: true,
};

function makeCoding(
  id: string,
  opts: {
    relevance?: DocumentCoding['relevance'];
    privilege?: DocumentCoding['privilege'];
    hotDocument?: boolean;
  } = {},
): DocumentCoding {
  return {
    documentId: id,
    relevance: opts.relevance ?? {
      classification: 'relevant',
      confidence: 0.9,
      reasoning: '',
      matchingCriteria: [],
    },
    privilege: opts.privilege ?? {
      classification: 'not_privileged',
      confidence: 0.95,
      privilegeType: 'none',
      reasoning: '',
    },
    issueTags: [],
    hotDocument: opts.hotDocument ?? false,
  };
}

function makeState(
  codings: Record<string, DocumentCoding>,
  protocol: ReviewProtocol = BASE_PROTOCOL,
): DiscoveryReviewState {
  return {
    messages: [],
    executionContext: BASE_CONTEXT,
    reviewProtocol: protocol,
    documents: [],
    documentIndex: [],
    documentQueue: [],
    currentDocumentId: undefined,
    documentsCoded: [],
    documentsFailed: {},
    documentCodings: codings,
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
    status: 'coding',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
  } as unknown as DiscoveryReviewState;
}

describe('build-batches.node', () => {
  describe('privilege batch', () => {
    it('includes documents with classification privileged or potentially_privileged', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', {
          privilege: {
            classification: 'privileged',
            confidence: 0.99,
            privilegeType: 'attorney_client',
            reasoning: '',
          },
        }),
        doc2: makeCoding('doc2', {
          privilege: {
            classification: 'potentially_privileged',
            confidence: 0.6,
            privilegeType: 'work_product',
            reasoning: '',
          },
        }),
        doc3: makeCoding('doc3'), // not_privileged — excluded
      };

      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));

      const batches = result.reviewBatches!;
      const privBatch = batches.find((b) => b.batchType === 'privilege');
      expect(privBatch).toBeDefined();
      expect(privBatch!.documentIds).toHaveLength(2);
      expect(privBatch!.documentIds).toContain('doc1');
      expect(privBatch!.documentIds).toContain('doc2');
    });

    it('skips privilege batch when no privileged documents exist', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1'),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      expect(batches.find((b) => b.batchType === 'privilege')).toBeUndefined();
    });
  });

  describe('low_confidence_relevance batch', () => {
    it('includes non-relevant docs below confidenceThreshold, sorted ascending', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', {
          relevance: {
            classification: 'not_relevant',
            confidence: 0.5,
            reasoning: '',
            matchingCriteria: [],
          },
        }),
        doc2: makeCoding('doc2', {
          relevance: {
            classification: 'not_relevant',
            confidence: 0.3,
            reasoning: '',
            matchingCriteria: [],
          },
        }),
        doc3: makeCoding('doc3', {
          relevance: {
            classification: 'not_relevant',
            confidence: 0.8, // above threshold — excluded
            reasoning: '',
            matchingCriteria: [],
          },
        }),
        doc4: makeCoding('doc4', {
          relevance: {
            classification: 'relevant',
            confidence: 0.5, // relevant — excluded despite low confidence
            reasoning: '',
            matchingCriteria: [],
          },
        }),
      };

      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));

      const batches = result.reviewBatches!;
      const relBatch = batches.find(
        (b) => b.batchType === 'low_confidence_relevance',
      );
      expect(relBatch).toBeDefined();
      expect(relBatch!.documentIds).toHaveLength(2);
      // Sorted ascending by confidence: doc2 (0.3), doc1 (0.5)
      expect(relBatch!.documentIds[0]).toBe('doc2');
      expect(relBatch!.documentIds[1]).toBe('doc1');
    });

    it('skips low_confidence batch when all docs are above threshold', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', {
          relevance: {
            classification: 'relevant',
            confidence: 0.9,
            reasoning: '',
            matchingCriteria: [],
          },
        }),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      expect(
        batches.find((b) => b.batchType === 'low_confidence_relevance'),
      ).toBeUndefined();
    });
  });

  describe('hot_documents batch', () => {
    it('includes documents where hotDocument is true', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', { hotDocument: true }),
        doc2: makeCoding('doc2', { hotDocument: false }),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      const hotBatch = batches.find((b) => b.batchType === 'hot_documents');
      expect(hotBatch).toBeDefined();
      expect(hotBatch!.documentIds).toEqual(['doc1']);
    });

    it('skips hot_documents batch when no hot documents exist', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1'),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      expect(
        batches.find((b) => b.batchType === 'hot_documents'),
      ).toBeUndefined();
    });
  });

  describe('sample batch', () => {
    it('samples ~5% of high-confidence not_relevant documents', async () => {
      const codings: Record<string, DocumentCoding> = {};
      // Create 100 high-confidence not_relevant docs
      for (let i = 0; i < 100; i++) {
        const id = `doc${i}`;
        codings[id] = makeCoding(id, {
          relevance: {
            classification: 'not_relevant',
            confidence: 0.9,
            reasoning: '',
            matchingCriteria: [],
          },
        });
      }

      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      const sampleBatch = batches.find((b) => b.batchType === 'sample');
      expect(sampleBatch).toBeDefined();
      // Should be ~5% of 100 = 5
      expect(sampleBatch!.documentIds.length).toBeGreaterThanOrEqual(1);
      expect(sampleBatch!.documentIds.length).toBeLessThanOrEqual(10);
    });

    it('skips sample batch when no high-confidence not_relevant docs exist', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', {
          relevance: {
            classification: 'relevant',
            confidence: 0.95,
            reasoning: '',
            matchingCriteria: [],
          },
        }),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;
      expect(batches.find((b) => b.batchType === 'sample')).toBeUndefined();
    });
  });

  describe('batch ordering', () => {
    it('returns batches in priority order: privilege, low_confidence, hot_documents, sample', async () => {
      const codings: Record<string, DocumentCoding> = {};

      // Privileged doc
      codings['priv1'] = makeCoding('priv1', {
        privilege: {
          classification: 'privileged',
          confidence: 0.99,
          privilegeType: 'attorney_client',
          reasoning: '',
        },
      });

      // Low confidence not-relevant doc
      codings['lowconf1'] = makeCoding('lowconf1', {
        relevance: {
          classification: 'not_relevant',
          confidence: 0.4,
          reasoning: '',
          matchingCriteria: [],
        },
      });

      // Hot document
      codings['hot1'] = makeCoding('hot1', { hotDocument: true });

      // Enough high-confidence not_relevant docs for a sample
      for (let i = 0; i < 20; i++) {
        const id = `notrel${i}`;
        codings[id] = makeCoding(id, {
          relevance: {
            classification: 'not_relevant',
            confidence: 0.95,
            reasoning: '',
            matchingCriteria: [],
          },
        });
      }

      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      const batches = result.reviewBatches!;

      expect(batches.length).toBe(4);
      expect(batches[0]!.batchType).toBe('privilege');
      expect(batches[1]!.batchType).toBe('low_confidence_relevance');
      expect(batches[2]!.batchType).toBe('hot_documents');
      expect(batches[3]!.batchType).toBe('sample');
    });

    it('returns empty array when no documents qualify for any batch', async () => {
      const codings: Record<string, DocumentCoding> = {
        doc1: makeCoding('doc1', {
          relevance: {
            classification: 'relevant',
            confidence: 0.95,
            reasoning: '',
            matchingCriteria: [],
          },
        }),
      };
      const obs = makeObservability();
      const node = createBuildBatchesNode(obs as never);
      const result = await node(makeState(codings));
      expect(result.reviewBatches).toEqual([]);
    });
  });
});
