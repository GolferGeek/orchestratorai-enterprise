/**
 * Unit tests for batch-hitl-privilege.node.ts
 *
 * Verifies:
 *  - Passes through immediately when no privilege batch exists
 *  - Interrupts with the correct payload
 *  - Throws when approveRemaining === true (privilege safety rule)
 *  - Records decision and marks batch completed on resume
 */
import { createBatchHitlPrivilegeNode } from './batch-hitl-privilege.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  ReviewBatch,
  BatchReviewDecisionPayload,
} from '../discovery-review.types';

// Mock LangGraph interrupt
const mockInterruptReturn = jest.fn();
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn((payload: unknown) => {
    return mockInterruptReturn(payload);
  }),
}));

function makeObservability() {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
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

function makePrivilegeBatch(ids: string[] = ['doc1', 'doc2']): ReviewBatch {
  return {
    batchId: 'batch-priv-1',
    batchType: 'privilege',
    documentIds: ids,
    status: 'pending',
  };
}

function makePrivilegeCoding(id: string): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: 'potentially_relevant',
      confidence: 0.6,
      reasoning: '',
      matchingCriteria: [],
    },
    privilege: {
      classification: 'privileged',
      confidence: 0.98,
      privilegeType: 'attorney_client',
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

describe('batch-hitl-privilege.node', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through immediately when no privilege batch exists', async () => {
    const obs = makeObservability();
    const node = createBatchHitlPrivilegeNode(obs as never);
    const result = await node(makeState([]));
    expect(result).toEqual({});
  });

  it('passes through immediately when only other batch types exist', async () => {
    const otherBatch: ReviewBatch = {
      batchId: 'batch-sample-1',
      batchType: 'sample',
      documentIds: ['doc1'],
      status: 'pending',
    };
    const obs = makeObservability();
    const node = createBatchHitlPrivilegeNode(obs as never);
    const result = await node(makeState([otherBatch]));
    expect(result).toEqual({});
  });

  it('calls interrupt with the privilege batch payload', async () => {
    const { interrupt } = jest.requireMock('@langchain/langgraph');

    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-priv-1',
      documentDecisions: [
        { documentId: 'doc1', action: 'approve' },
        { documentId: 'doc2', action: 'approve' },
      ],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makePrivilegeBatch(['doc1', 'doc2']);
    const codings = {
      doc1: makePrivilegeCoding('doc1'),
      doc2: makePrivilegeCoding('doc2'),
    };
    const obs = makeObservability();
    const node = createBatchHitlPrivilegeNode(obs as never);

    await node(makeState([batch], codings));

    expect(interrupt).toHaveBeenCalledWith({
      batchId: 'batch-priv-1',
      batchType: 'privilege',
      documents: [codings['doc1'], codings['doc2']],
    });
  });

  it('records decision and marks batch completed on resume', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-priv-1',
      documentDecisions: [
        { documentId: 'doc1', action: 'approve' },
        {
          documentId: 'doc2',
          action: 'correct',
          correctedCoding: {
            privilege: {
              classification: 'not_privileged',
              confidence: 0.95,
              privilegeType: 'none',
              reasoning: 'Re-examined',
            },
          },
        },
      ],
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makePrivilegeBatch(['doc1', 'doc2']);
    const codings = {
      doc1: makePrivilegeCoding('doc1'),
      doc2: makePrivilegeCoding('doc2'),
    };
    const obs = makeObservability();
    const node = createBatchHitlPrivilegeNode(obs as never);

    const result = await node(makeState([batch], codings));

    expect(result.batchDecisions).toEqual({ 'batch-priv-1': decision });
    const updatedBatch = result.reviewBatches!.find(
      (b) => b.batchId === 'batch-priv-1',
    );
    expect(updatedBatch?.status).toBe('completed');
  });

  it('throws when approveRemaining is true (privilege safety rule)', async () => {
    const decision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'batch-priv-1',
      documentDecisions: [{ documentId: 'doc1', action: 'approve' }],
      approveRemaining: true, // VIOLATION
    };
    mockInterruptReturn.mockReturnValue(decision);

    const batch = makePrivilegeBatch(['doc1']);
    const codings = { doc1: makePrivilegeCoding('doc1') };
    const obs = makeObservability();
    const node = createBatchHitlPrivilegeNode(obs as never);

    await expect(node(makeState([batch], codings))).rejects.toThrow(
      'Privilege batch does not allow approveRemaining',
    );
  });
});
