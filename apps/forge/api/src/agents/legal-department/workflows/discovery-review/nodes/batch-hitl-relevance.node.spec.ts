/**
 * Unit tests for batch-hitl-relevance.node.ts
 *
 * Verifies:
 *  - Passes through when no low_confidence_relevance batch exists
 *  - Interrupts with correct payload
 *  - approveRemaining IS allowed (no throw)
 *  - Records decision and marks batch completed
 */
import { createBatchHitlRelevanceNode } from './batch-hitl-relevance.node';
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

function makeLowConfBatch(ids: string[] = ['doc1']): ReviewBatch {
  return {
    batchId: 'batch-rel-1',
    batchType: 'low_confidence_relevance',
    documentIds: ids,
    status: 'pending',
  };
}

function makeLowConfCoding(id: string): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: 'not_relevant',
      confidence: 0.4,
      reasoning: '',
      matchingCriteria: [],
    },
    privilege: {
      classification: 'not_privileged',
      confidence: 0.96,
      privilegeType: 'none',
      reasoning: '',
    },
    issueTags: [],
    hotDocument: false,
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

describe('batch-hitl-relevance.node', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes through immediately when no low_confidence_relevance batch exists', async () => {
    const obs = makeObservability();
    const node = createBatchHitlRelevanceNode(obs as never);
    const result = await node(makeState([]));
    expect(result).toEqual({});
  });

  it('interrupts with the relevance batch payload', async () => {
    const { interrupt } = jest.requireMock('@langchain/langgraph');
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-rel-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeLowConfBatch(['doc1']);
    const codings = { doc1: makeLowConfCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlRelevanceNode(obs as never);

    await node(makeState([batch], codings));

    expect(interrupt).toHaveBeenCalledWith({
      batchId: 'batch-rel-1',
      batchType: 'low_confidence_relevance',
      documents: [codings['doc1']],
    });
  });

  it('allows approveRemaining without throwing (unlike privilege)', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-rel-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
      approveRemaining: true, // ALLOWED for relevance batches
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeLowConfBatch(['doc1']);
    const codings = { doc1: makeLowConfCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlRelevanceNode(obs as never);

    // Should NOT throw
    await expect(node(makeState([batch], codings))).resolves.toBeDefined();
  });

  it('records decision and marks batch completed', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-rel-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeLowConfBatch(['doc1']);
    const codings = { doc1: makeLowConfCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlRelevanceNode(obs as never);

    const result = await node(makeState([batch], codings));

    expect(result.batchDecisions).toEqual({ 'batch-rel-1': decision });
    const updatedBatch = result.reviewBatches!.find(
      (b) => b.batchId === 'batch-rel-1',
    );
    expect(updatedBatch?.status).toBe('completed');
  });
});
