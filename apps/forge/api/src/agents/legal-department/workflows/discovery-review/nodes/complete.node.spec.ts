/**
 * Unit tests for complete.node.ts
 *
 * Verifies:
 *  - Sets status to 'completed'
 *  - Sets completedAt timestamp
 *  - Calls observability.emitCompleted with production set metrics
 */
import { createCompleteNode } from './complete.node';
import type { DiscoveryReviewState } from '../discovery-review.state';

function makeObservability() {
  return { emitCompleted: jest.fn().mockResolvedValue(undefined) };
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

function makeState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  return {
    messages: [],
    executionContext: BASE_CONTEXT,
    reviewProtocol: {} as never,
    documents: [
      { documentId: 'd1', name: 'd1.txt', content: '', sizeBytes: 100 },
      { documentId: 'd2', name: 'd2.txt', content: '', sizeBytes: 100 },
    ],
    documentIndex: [],
    documentQueue: [],
    currentDocumentId: undefined,
    documentsCoded: ['d1', 'd2'],
    documentsFailed: { d3: 'timeout' },
    documentCodings: {},
    reviewBatches: [
      {
        batchId: 'b1',
        batchType: 'privilege',
        documentIds: ['d1'],
        status: 'completed',
      },
    ],
    batchDecisions: {},
    calibrationAdjustments: [],
    productionSet: ['d1'],
    privilegeLog: [],
    reviewStatistics: {} as never,
    status: 'generating_production_set',
    error: undefined,
    startedAt: Date.now() - 5000,
    completedAt: undefined,
    ...overrides,
  } as unknown as DiscoveryReviewState;
}

describe('complete.node', () => {
  it('sets status to completed', async () => {
    const obs = makeObservability();
    const node = createCompleteNode(obs as never);
    const result = await node(makeState());
    expect(result.status).toBe('completed');
  });

  it('sets completedAt timestamp', async () => {
    const obs = makeObservability();
    const node = createCompleteNode(obs as never);
    const before = Date.now();
    const result = await node(makeState());
    const after = Date.now();
    expect(result.completedAt).toBeGreaterThanOrEqual(before);
    expect(result.completedAt).toBeLessThanOrEqual(after);
  });

  it('calls emitCompleted with production set size and privilege count', async () => {
    const obs = makeObservability();
    const node = createCompleteNode(obs as never);
    await node(
      makeState({
        productionSet: ['d1', 'd2'],
        privilegeLog: [
          {
            documentId: 'd3',
            documentName: 'd3.pdf',
            privilegeType: 'attorney_client',
            privilegeBasis: 'atty-client comm',
          },
        ],
      }),
    );

    expect(obs.emitCompleted).toHaveBeenCalledTimes(1);
    const callArgs = obs.emitCompleted.mock.calls[0] as unknown[];
    const metrics = callArgs[2] as Record<string, unknown>;
    expect(metrics.productionSetSize).toBe(2);
    expect(metrics.privilegeCount).toBe(1);
  });

  it('includes coded, failed, and batches reviewed in emitCompleted metrics', async () => {
    const obs = makeObservability();
    const node = createCompleteNode(obs as never);
    await node(makeState());

    const metrics = obs.emitCompleted.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(metrics.coded).toBe(2);
    expect(metrics.failed).toBe(1);
    expect(metrics.batchesReviewed).toBe(1);
  });
});
