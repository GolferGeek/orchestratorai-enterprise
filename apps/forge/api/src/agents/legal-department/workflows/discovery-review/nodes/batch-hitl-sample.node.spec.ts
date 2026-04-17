/**
 * Unit tests for batch-hitl-sample.node.ts
 *
 * Verifies:
 *  - Passes through when no sample batch exists
 *  - Interrupts with correct payload (batchType: 'sample')
 *  - approveRemaining IS allowed
 *  - Correction count is included in post-review progress event
 *  - Records decision and marks batch completed
 */
import { createBatchHitlSampleNode } from './batch-hitl-sample.node';
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

function makeSampleBatch(ids: string[] = ['doc1']): ReviewBatch {
  return {
    batchId: 'batch-sample-1',
    batchType: 'sample',
    documentIds: ids,
    status: 'pending',
  };
}

function makeSampleCoding(id: string): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: 'not_relevant',
      confidence: 0.97,
      reasoning: 'No match',
      matchingCriteria: [],
    },
    privilege: {
      classification: 'not_privileged',
      confidence: 0.99,
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

describe('batch-hitl-sample.node', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes through immediately when no sample batch exists', async () => {
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);
    const result = await node(makeState([]));
    expect(result).toEqual({});
  });

  it('passes through when only non-sample batches exist', async () => {
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);
    const otherBatch: ReviewBatch = {
      batchId: 'b-priv',
      batchType: 'privilege',
      documentIds: ['doc1'],
      status: 'pending',
    };
    const result = await node(makeState([otherBatch]));
    expect(result).toEqual({});
  });

  it('interrupts with batchType "sample" payload', async () => {
    const { interrupt } = jest.requireMock('@langchain/langgraph');
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-sample-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeSampleBatch(['doc1']);
    const codings = { doc1: makeSampleCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);

    await node(makeState([batch], codings));

    expect(interrupt).toHaveBeenCalledWith({
      batchId: 'batch-sample-1',
      batchType: 'sample',
      documents: [codings['doc1']],
    });
  });

  it('allows approveRemaining without throwing', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-sample-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
      approveRemaining: true,
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeSampleBatch(['doc1']);
    const codings = { doc1: makeSampleCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);

    await expect(node(makeState([batch], codings))).resolves.toBeDefined();
  });

  it('records decision and marks batch completed', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-sample-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeSampleBatch(['doc1']);
    const codings = { doc1: makeSampleCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);

    const result = await node(makeState([batch], codings));

    expect(result.batchDecisions).toEqual({ 'batch-sample-1': decision });
    const updatedBatch = result.reviewBatches!.find(
      (b) => b.batchId === 'batch-sample-1',
    );
    expect(updatedBatch?.status).toBe('completed');
  });

  it('reports correctionCount in post-review progress event', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-sample-1',
      documentDecisions: [
        { documentId: 'doc1', action: 'correct', correctedCoding: {} as never },
        { documentId: 'doc2', action: 'approve' },
      ],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makeSampleBatch(['doc1', 'doc2']);
    const codings = {
      doc1: makeSampleCoding('doc1'),
      doc2: makeSampleCoding('doc2'),
    };
    const obs = makeObservability();
    const node = createBatchHitlSampleNode(obs as never);

    await node(makeState([batch], codings));

    const progressCalls = obs.emitProgress.mock.calls;
    const reviewedCall = progressCalls.find(
      ([, , msg]: [unknown, unknown, string]) =>
        msg.includes('Sample batch reviewed'),
    );
    expect(reviewedCall).toBeDefined();
    expect(reviewedCall[3]).toMatchObject({ correctionCount: 1 });
  });
});
