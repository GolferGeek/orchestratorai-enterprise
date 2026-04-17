/**
 * Unit tests for calibration-check.node.ts
 *
 * Verifies:
 *  - Skips calibration when no sample batch
 *  - Skips calibration when sample decision has no corrections
 *  - Detects patterns at or above PATTERN_THRESHOLD (3)
 *  - No false positives below threshold
 *  - Returns correct CalibrationAdjustment shape
 */
import { createCalibrationCheckNode } from './calibration-check.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  ReviewBatch,
  BatchReviewDecisionPayload,
} from '../discovery-review.types';

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

function makeNotRelevantCoding(id: string): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: 'not_relevant',
      confidence: 0.9,
      reasoning: '',
      matchingCriteria: [],
    },
    privilege: {
      classification: 'not_privileged',
      confidence: 0.97,
      privilegeType: 'none',
      reasoning: '',
    },
    issueTags: [],
    hotDocument: false,
  };
}

function makeState(opts: {
  sampleBatch?: ReviewBatch;
  sampleDecision?: BatchReviewDecisionPayload;
  codings?: Record<string, DocumentCoding>;
}): DiscoveryReviewState {
  const batches: ReviewBatch[] = opts.sampleBatch ? [opts.sampleBatch] : [];
  const batchDecisions: Record<string, BatchReviewDecisionPayload> = {};
  if (opts.sampleBatch && opts.sampleDecision) {
    batchDecisions[opts.sampleBatch.batchId] = opts.sampleDecision;
  }
  const codings = opts.codings ?? {};

  return {
    messages: [],
    executionContext: BASE_CONTEXT,
    reviewBatches: batches,
    batchDecisions,
    documentCodings: codings,
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
    status: 'awaiting_sample_review',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
  } as unknown as DiscoveryReviewState;
}

describe('calibration-check.node', () => {
  it('skips when no sample batch exists', async () => {
    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    const result = await node(makeState({}));
    expect(result.calibrationAdjustments).toBeUndefined();
    expect(result.status).toBe('calibrating');
  });

  it('skips when sample batch has no corrections (all approved)', async () => {
    const sampleBatch: ReviewBatch = {
      batchId: 'sample-1',
      batchType: 'sample',
      documentIds: ['doc1', 'doc2'],
      status: 'completed',
    };
    const sampleDecision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'sample-1',
      documentDecisions: [
        { documentId: 'doc1', action: 'approve' },
        { documentId: 'doc2', action: 'approve' },
      ],
    };
    const codings = {
      doc1: makeNotRelevantCoding('doc1'),
      doc2: makeNotRelevantCoding('doc2'),
    };

    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    const result = await node(
      makeState({ sampleBatch, sampleDecision, codings }),
    );

    // No calibration adjustments since no corrections
    expect(result.calibrationAdjustments).toEqual([]);
    expect(result.status).toBe('calibrating');
  });

  it('detects a systematic relevance correction pattern at threshold (3)', async () => {
    const sampleBatch: ReviewBatch = {
      batchId: 'sample-1',
      batchType: 'sample',
      documentIds: ['doc1', 'doc2', 'doc3'],
      status: 'completed',
    };

    const codings: Record<string, DocumentCoding> = {
      doc1: makeNotRelevantCoding('doc1'),
      doc2: makeNotRelevantCoding('doc2'),
      doc3: makeNotRelevantCoding('doc3'),
    };

    // All 3 documents corrected from not_relevant → relevant
    const sampleDecision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'sample-1',
      documentDecisions: [
        {
          documentId: 'doc1',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        {
          documentId: 'doc2',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        {
          documentId: 'doc3',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
      ],
    };

    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    const result = await node(
      makeState({ sampleBatch, sampleDecision, codings }),
    );

    expect(result.calibrationAdjustments).toHaveLength(1);
    const adj = result.calibrationAdjustments![0]!;
    expect(adj.fromClassification).toBe('not_relevant');
    expect(adj.toClassification).toBe('relevant');
    expect(adj.count).toBe(3);
    expect(adj.type).toContain('not_relevant');
    expect(adj.type).toContain('relevant');
  });

  it('does not flag patterns below threshold (only 2 corrections)', async () => {
    const sampleBatch: ReviewBatch = {
      batchId: 'sample-1',
      batchType: 'sample',
      documentIds: ['doc1', 'doc2', 'doc3'],
      status: 'completed',
    };

    const codings: Record<string, DocumentCoding> = {
      doc1: makeNotRelevantCoding('doc1'),
      doc2: makeNotRelevantCoding('doc2'),
      doc3: makeNotRelevantCoding('doc3'),
    };

    // Only 2 corrections — below threshold of 3
    const sampleDecision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'sample-1',
      documentDecisions: [
        {
          documentId: 'doc1',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        {
          documentId: 'doc2',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        { documentId: 'doc3', action: 'approve' },
      ],
    };

    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    const result = await node(
      makeState({ sampleBatch, sampleDecision, codings }),
    );

    // 2 corrections < threshold of 3 → no adjustments
    expect(result.calibrationAdjustments).toEqual([]);
  });

  it('emits dr:calibration_applied when adjustments detected', async () => {
    const sampleBatch: ReviewBatch = {
      batchId: 'sample-1',
      batchType: 'sample',
      documentIds: ['d1', 'd2', 'd3'],
      status: 'completed',
    };
    const codings: Record<string, DocumentCoding> = {
      d1: makeNotRelevantCoding('d1'),
      d2: makeNotRelevantCoding('d2'),
      d3: makeNotRelevantCoding('d3'),
    };
    const sampleDecision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'sample-1',
      documentDecisions: [
        {
          documentId: 'd1',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        {
          documentId: 'd2',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
        {
          documentId: 'd3',
          action: 'correct',
          correctedCoding: {
            relevance: { classification: 'relevant' } as never,
          },
        },
      ],
    };

    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    await node(makeState({ sampleBatch, sampleDecision, codings }));

    const progressCalls = obs.emitProgress.mock.calls;
    const appliedCall = progressCalls.find((args: unknown[]) => {
      const meta = args[3] as Record<string, unknown>;
      return meta?.step === 'dr:calibration_applied';
    });
    expect(appliedCall).toBeDefined();
  });

  it('emits dr:calibration_skipped when no pattern detected', async () => {
    const sampleBatch: ReviewBatch = {
      batchId: 'sample-1',
      batchType: 'sample',
      documentIds: ['d1'],
      status: 'completed',
    };
    const codings = { d1: makeNotRelevantCoding('d1') };
    const sampleDecision: BatchReviewDecisionPayload = {
      decision: 'batch_review',
      batchId: 'sample-1',
      documentDecisions: [{ documentId: 'd1', action: 'approve' }],
    };

    const obs = makeObservability();
    const node = createCalibrationCheckNode(obs as never);
    await node(makeState({ sampleBatch, sampleDecision, codings }));

    const progressCalls = obs.emitProgress.mock.calls;
    const skippedCall = progressCalls.find((args: unknown[]) => {
      const meta = args[3] as Record<string, unknown>;
      return meta?.step === 'dr:calibration_skipped';
    });
    expect(skippedCall).toBeDefined();
  });
});
