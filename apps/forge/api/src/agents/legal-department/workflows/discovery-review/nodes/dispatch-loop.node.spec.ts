import {
  createDispatchLoopNode,
  dispatchLoopRouter,
} from './dispatch-loop.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { fixtureProtocol } from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

function makeState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  const docs = fixtureDocuments as DiscoveryReviewState['documents'];
  return {
    executionContext: {
      orgSlug: 'legal',
      userId: 'user-1',
      conversationId: 'conv-dr-dispatch',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:e4b',
    },
    reviewProtocol: fixtureProtocol,
    documents: docs,
    documentIndex: docs.map((d) => ({
      documentId: d.documentId,
      name: d.name,
      documentType: 'unknown',
      date: null,
      summary: '',
      status: 'classified' as const,
    })),
    documentQueue: docs.map((d) => d.documentId),
    currentDocumentId: undefined,
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

const dispatchLoopNode = createDispatchLoopNode();

describe('DispatchLoopNode', () => {
  it('pops first item from queue and sets currentDocumentId', () => {
    const state = makeState({
      documentQueue: ['doc-001', 'doc-002', 'doc-003'],
    });
    const result = dispatchLoopNode(state);

    expect(result.currentDocumentId).toBe('doc-001');
    expect(result.documentQueue).toEqual(['doc-002', 'doc-003']);
  });

  it('removes only the first item — leaving remainder intact', () => {
    const state = makeState({ documentQueue: ['doc-A', 'doc-B'] });
    const result = dispatchLoopNode(state);

    expect(result.documentQueue).toHaveLength(1);
    expect(result.documentQueue![0]).toBe('doc-B');
  });

  it('returns empty queue and currentDocumentId set when single item remains', () => {
    const state = makeState({ documentQueue: ['doc-only'] });
    const result = dispatchLoopNode(state);

    expect(result.currentDocumentId).toBe('doc-only');
    expect(result.documentQueue).toEqual([]);
  });

  it('returns no-op when queue is empty', () => {
    const state = makeState({
      documentQueue: [],
      currentDocumentId: undefined,
    });
    const result = dispatchLoopNode(state);

    // Node returns empty object — routing handles the empty-queue case
    expect(result.currentDocumentId).toBeUndefined();
    expect(result.documentQueue).toBeUndefined();
  });
});

describe('dispatchLoopRouter', () => {
  it('routes to code_document when currentDocumentId is set', () => {
    const state = makeState({ currentDocumentId: 'doc-001' });
    expect(dispatchLoopRouter(state)).toBe('code_document');
  });

  it('routes to complete when currentDocumentId is undefined', () => {
    const state = makeState({ currentDocumentId: undefined });
    expect(dispatchLoopRouter(state)).toBe('complete');
  });

  it('routes to complete even if queue still has items but currentDocumentId cleared', () => {
    // This guards against stale state scenarios.
    const state = makeState({
      documentQueue: ['doc-001'],
      currentDocumentId: undefined,
    });
    expect(dispatchLoopRouter(state)).toBe('complete');
  });
});
