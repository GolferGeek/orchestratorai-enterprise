/**
 * Unit tests for generate-production-set.node.ts
 *
 * Verifies:
 *  - Production set includes only relevant + not_privileged docs
 *  - Privilege log includes all privileged/potentially_privileged docs
 *  - Reviewer corrections are applied before building production set
 *  - Failed documents are never included in the production set
 *  - Final reviewStatistics are accurate
 *  - Emits dr:production_set_ready SSE event
 */
import { createGenerateProductionSetNode } from './generate-production-set.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  DocumentIndexEntry,
  BatchReviewDecisionPayload,
  ReviewBatch,
} from '../discovery-review.types';

function makeObservability() {
  return { emitProgress: jest.fn().mockResolvedValue(undefined) };
}

const BASE_CONTEXT = {
  orgSlug: 'test-org',
  userId: 'reviewer-1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function makeCoding(
  id: string,
  opts: {
    relevance?: 'relevant' | 'not_relevant' | 'potentially_relevant';
    privilege?: 'not_privileged' | 'potentially_privileged' | 'privileged';
    hotDocument?: boolean;
  } = {},
): DocumentCoding {
  return {
    documentId: id,
    relevance: {
      classification: opts.relevance ?? 'relevant',
      confidence: 0.9,
      reasoning: `relevance reasoning for ${id}`,
      matchingCriteria: ['claim1'],
    },
    privilege: {
      classification: opts.privilege ?? 'not_privileged',
      confidence: opts.privilege === 'not_privileged' ? 0.97 : 0.6,
      privilegeType:
        opts.privilege === 'not_privileged' ? 'none' : 'attorney_client',
      reasoning: `privilege reasoning for ${id}`,
    },
    issueTags: [{ tagId: 'T1', confidence: 0.8 }],
    hotDocument: opts.hotDocument ?? false,
    hotDocumentReason: opts.hotDocument ? `hot reason for ${id}` : undefined,
  };
}

function makeIndexEntry(id: string, name = `${id}.txt`): DocumentIndexEntry {
  return {
    documentId: id,
    name,
    documentType: 'email',
    summary: `Summary of ${id}`,
    status: 'coded',
  };
}

function makeState(opts: {
  documentsCoded?: string[];
  documentsFailed?: Record<string, string>;
  documentCodings?: Record<string, DocumentCoding>;
  documentIndex?: DocumentIndexEntry[];
  batchDecisions?: Record<string, BatchReviewDecisionPayload>;
  reviewBatches?: ReviewBatch[];
}): DiscoveryReviewState {
  return {
    messages: [],
    executionContext: BASE_CONTEXT,
    reviewProtocol: {
      matterId: 'M1',
      matterName: 'Test Matter',
      relevanceCriteria: { claims: ['breach'], keyParties: [], keyTopics: [] },
      privilegeHolders: { attorneys: ['atty1'], firms: [], inHouseCounsel: [] },
      issueTags: [{ tagId: 'T1', tagName: 'Breach', description: '' }],
      batchSize: 50,
      confidenceThreshold: 0.7,
      privilegeReviewRequired: true,
    },
    documents: [
      { documentId: 'd1', name: 'd1.txt', content: '', sizeBytes: 100 },
    ],
    documentIndex: opts.documentIndex ?? [],
    documentQueue: [],
    currentDocumentId: undefined,
    documentsCoded: opts.documentsCoded ?? [],
    documentsFailed: opts.documentsFailed ?? {},
    documentCodings: opts.documentCodings ?? {},
    reviewBatches: opts.reviewBatches ?? [],
    batchDecisions: opts.batchDecisions ?? {},
    calibrationAdjustments: [],
    productionSet: [],
    privilegeLog: [],
    reviewStatistics: {} as never,
    status: 'calibrating',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
  } as unknown as DiscoveryReviewState;
}

describe('generate-production-set.node', () => {
  it('includes only relevant + not_privileged docs in production set', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
      d2: makeCoding('d2', {
        relevance: 'not_relevant',
        privilege: 'not_privileged',
      }),
      d3: makeCoding('d3', {
        relevance: 'relevant',
        privilege: 'potentially_privileged',
      }),
      d4: makeCoding('d4', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
    };

    const result = await node(
      makeState({
        documentsCoded: ['d1', 'd2', 'd3', 'd4'],
        documentCodings: codings,
      }),
    );

    expect(result.productionSet).toEqual(expect.arrayContaining(['d1', 'd4']));
    expect(result.productionSet).not.toContain('d2');
    expect(result.productionSet).not.toContain('d3');
    expect(result.productionSet).toHaveLength(2);
  });

  it('builds privilege log for privileged and potentially_privileged docs', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', { relevance: 'relevant', privilege: 'privileged' }),
      d2: makeCoding('d2', {
        relevance: 'relevant',
        privilege: 'potentially_privileged',
      }),
      d3: makeCoding('d3', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
    };
    const index = [
      makeIndexEntry('d1', 'contract.pdf'),
      makeIndexEntry('d2', 'email.eml'),
      makeIndexEntry('d3', 'memo.txt'),
    ];

    const result = await node(
      makeState({
        documentsCoded: ['d1', 'd2', 'd3'],
        documentCodings: codings,
        documentIndex: index,
      }),
    );

    expect(result.privilegeLog).toHaveLength(2);
    const ids = result.privilegeLog!.map((e) => e.documentId);
    expect(ids).toContain('d1');
    expect(ids).toContain('d2');

    const d1Entry = result.privilegeLog!.find((e) => e.documentId === 'd1')!;
    expect(d1Entry.documentName).toBe('contract.pdf');
    expect(d1Entry.privilegeType).toBe('attorney_client');
    expect(d1Entry.privilegeBasis).toContain('d1');
  });

  it('applies reviewer corrections before building production set', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    // d1 was originally not_relevant; reviewer corrected to relevant
    const codings = {
      d1: makeCoding('d1', {
        relevance: 'not_relevant',
        privilege: 'not_privileged',
      }),
      d2: makeCoding('d2', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
    };

    const batchDecisions: Record<string, BatchReviewDecisionPayload> = {
      'batch-1': {
        decision: 'batch_review',
        batchId: 'batch-1',
        documentDecisions: [
          {
            documentId: 'd1',
            action: 'correct',
            correctedCoding: {
              relevance: {
                classification: 'relevant',
                confidence: 0.85,
                reasoning: 'reviewer says relevant',
                matchingCriteria: ['claim1'],
              },
            },
          },
        ],
      },
    };

    const result = await node(
      makeState({
        documentsCoded: ['d1', 'd2'],
        documentCodings: codings,
        batchDecisions,
      }),
    );

    expect(result.productionSet).toContain('d1');
    expect(result.productionSet).toContain('d2');
    expect(result.productionSet).toHaveLength(2);
  });

  it('excludes failed documents from the production set', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
    };

    const result = await node(
      makeState({
        documentsCoded: ['d1'],
        documentsFailed: { d2: 'coding error' },
        documentCodings: codings,
      }),
    );

    // d2 is in documentsFailed — not in documentsCoded — so never evaluated
    expect(result.productionSet).toEqual(['d1']);
  });

  it('computes final reviewStatistics accurately', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', {
        relevance: 'relevant',
        privilege: 'not_privileged',
        hotDocument: true,
      }),
      d2: makeCoding('d2', {
        relevance: 'not_relevant',
        privilege: 'not_privileged',
      }),
      d3: makeCoding('d3', {
        relevance: 'potentially_relevant',
        privilege: 'not_privileged',
      }),
      d4: makeCoding('d4', {
        relevance: 'relevant',
        privilege: 'potentially_privileged',
      }),
    };

    const batchDecisions: Record<string, BatchReviewDecisionPayload> = {
      b1: {
        decision: 'batch_review',
        batchId: 'b1',
        documentDecisions: [
          {
            documentId: 'd4',
            action: 'correct',
            correctedCoding: {
              privilege: {
                classification: 'not_privileged',
                confidence: 0.98,
                privilegeType: 'none',
                reasoning: 'not priv',
              },
            },
          },
        ],
      },
    };

    const result = await node(
      makeState({
        documentsCoded: ['d1', 'd2', 'd3', 'd4'],
        documentsFailed: { d5: 'error' },
        documentCodings: codings,
        batchDecisions,
        documentIndex: [
          makeIndexEntry('d1'),
          makeIndexEntry('d2'),
          makeIndexEntry('d3'),
          makeIndexEntry('d4'),
        ],
      }),
    );

    const stats = result.reviewStatistics!;
    expect(stats.totalDocuments).toBe(1); // state.documents.length = 1 (from makeState)
    expect(stats.totalCoded).toBe(4);
    expect(stats.totalFailed).toBe(1);
    expect(stats.relevanceBreakdown.relevant).toBe(2); // d1 + d4 (after correction)
    expect(stats.relevanceBreakdown.not_relevant).toBe(1);
    expect(stats.relevanceBreakdown.potentially_relevant).toBe(1);
    expect(stats.privilegeCount).toBe(0); // d4 was corrected to not_privileged
    expect(stats.hotDocumentCount).toBe(1);
    expect(stats.humanCorrectionCount).toBe(1);
    expect(stats.productionSetSize).toBe(result.productionSet!.length);
  });

  it('sets reviewerId on privilege log entries that were reviewer-touched', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', {
        relevance: 'relevant',
        privilege: 'potentially_privileged',
      }),
      d2: makeCoding('d2', { relevance: 'relevant', privilege: 'privileged' }),
    };

    const batchDecisions: Record<string, BatchReviewDecisionPayload> = {
      'priv-batch': {
        decision: 'batch_review',
        batchId: 'priv-batch',
        documentDecisions: [
          { documentId: 'd1', action: 'approve' }, // reviewed but kept privilege
        ],
      },
    };

    const result = await node(
      makeState({
        documentsCoded: ['d1', 'd2'],
        documentCodings: codings,
        batchDecisions,
        documentIndex: [makeIndexEntry('d1'), makeIndexEntry('d2')],
      }),
    );

    const d1Entry = result.privilegeLog!.find((e) => e.documentId === 'd1')!;
    const d2Entry = result.privilegeLog!.find((e) => e.documentId === 'd2')!;

    // d1 was in the batch decision → reviewerId set
    expect(d1Entry.reviewerId).toBe('reviewer-1');
    // d2 was NOT in any batch decision → no reviewerId
    expect(d2Entry.reviewerId).toBeUndefined();
  });

  it('emits dr:production_set_ready SSE event', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const codings = {
      d1: makeCoding('d1', {
        relevance: 'relevant',
        privilege: 'not_privileged',
      }),
    };

    await node(
      makeState({
        documentsCoded: ['d1'],
        documentCodings: codings,
      }),
    );

    const calls = obs.emitProgress.mock.calls;
    const readyCall = calls.find((args: unknown[]) => {
      const meta = args[3] as Record<string, unknown>;
      return meta?.step === 'dr:production_set_ready';
    });
    expect(readyCall).toBeDefined();
    const meta = readyCall[3] as Record<string, unknown>;
    expect(meta.documentCount).toBe(1);
    expect(meta.privilegeCount).toBe(0);
  });

  it('sets status to generating_production_set', async () => {
    const obs = makeObservability();
    const node = createGenerateProductionSetNode(obs as never);

    const result = await node(makeState({ documentsCoded: [] }));
    expect(result.status).toBe('generating_production_set');
  });
});
