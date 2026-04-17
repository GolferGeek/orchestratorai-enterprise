/**
 * Unit tests for batch-hitl-hot-docs.node.ts
 *
 * Verifies:
 *  - Passes through when no hot_documents batch exists
 *  - Interrupts with correct payload
 *  - approveRemaining IS allowed (unlike privilege)
 *  - flagSeniorReview count is reported correctly
 *  - Records decision and marks batch completed
 */
import { createBatchHitlHotDocsNode } from './batch-hitl-hot-docs.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  ReviewBatch,
  BatchReviewDecisionPayload,
} from '../discovery-review.types';

const mockInterruptReturn = jest.fn();
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn((_payload: unknown) => mockInterruptReturn(_payload)),
}));

function makeObservability() {
  return { emitProgress: jest.fn().mockResolvedValue(undefined) };
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

function makeHotDocBatch(ids: string[] = ['doc1']): ReviewBatch {
  return {
    batchId: 'batch-hot-1',
    batchType: 'hot_documents',
    documentIds: ids,
    status: 'pending',
  };
}

function makeHotCoding(id: string): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: 'relevant',
      confidence: 0.98,
      reasoning: 'Matches key claim',
      matchingCriteria: [],
    },
    privilege: {
      classification: 'not_privileged',
      confidence: 0.98,
      privilegeType: 'none',
      reasoning: '',
    },
    issueTags: [],
    hotDocument: true,
    hotDocumentReason: 'Contains board minutes',
  };
}

function makeState(
  batches: ReviewBatch[],
  codings: Record<string, DocumentCoding> = {},
): DiscoveryReviewState {
  return {
    messages: [],
    executionContext: BASE_CONTEXT,
    reviewBatches: batches,
    documentCodings: codings,
    batchDecisions: {},
    reviewProtocol: {} as never,
    documents: [],
    documentIndex: [],
    documentQueue: [],
    currentDocumentId: undefined,
    documentsCoded: [],
    documentsFailed: {},
    calibrationAdjustments: [],
    productionSet: [],
    privilegeLog: [],
    reviewStatistics: {} as never,
    status: 'building_batches',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
  } as unknown as DiscoveryReviewState;
}

describe('batch-hitl-hot-docs.node', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes through immediately when no hot_documents batch exists', async () => {
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);
    const result = await node(makeState([]));
    expect(result).toEqual({});
  });

  it('passes through when only non-hot batches exist', async () => {
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);
    const otherBatch: ReviewBatch = {
      batchId: 'b-priv',
      batchType: 'privilege',
      documentIds: ['doc1'],
      status: 'pending',
    };
    const result = await node(makeState([otherBatch]));
    expect(result).toEqual({});
  });

  it('interrupts with the hot_documents batch payload', async () => {
    const { interrupt } = jest.requireMock('@langchain/langgraph');
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-hot-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeHotDocBatch(['doc1']);
    const codings = { doc1: makeHotCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);

    await node(makeState([batch], codings));

    expect(interrupt).toHaveBeenCalledWith({
      batchId: 'batch-hot-1',
      batchType: 'hot_documents',
      documents: [codings['doc1']],
    });
  });

  it('allows approveRemaining without throwing (unlike privilege)', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-hot-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
      approveRemaining: true,
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeHotDocBatch(['doc1']);
    const codings = { doc1: makeHotCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);

    await expect(node(makeState([batch], codings))).resolves.toBeDefined();
  });

  it('records decision and marks batch completed', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-hot-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeHotDocBatch(['doc1']);
    const codings = { doc1: makeHotCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);

    const result = await node(makeState([batch], codings));

    expect(result.batchDecisions).toEqual({ 'batch-hot-1': decision });
    const updatedBatch = result.reviewBatches!.find(
      (b) => b.batchId === 'batch-hot-1',
    );
    expect(updatedBatch?.status).toBe('completed');
  });

  it('reports seniorFlagCount from flagSeniorReview decisions', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-hot-1',
      documentDecisions: [
        { documentId: 'doc1', action: 'approve', flagSeniorReview: true },
        { documentId: 'doc2', action: 'approve', flagSeniorReview: false },
      ],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeHotDocBatch(['doc1', 'doc2']);
    const codings = {
      doc1: makeHotCoding('doc1'),
      doc2: makeHotCoding('doc2'),
    };
    const obs = makeObservability();
    const node = createBatchHitlHotDocsNode(obs as never);

    await node(makeState([batch], codings));

    const progressCalls = obs.emitProgress.mock.calls;
    const reviewedCall = progressCalls.find(
      ([, , msg]: [unknown, unknown, string]) =>
        msg.includes('Hot documents batch reviewed'),
    );
    expect(reviewedCall).toBeDefined();
    expect(reviewedCall[3]).toMatchObject({ seniorFlagCount: 1 });
  });
});
