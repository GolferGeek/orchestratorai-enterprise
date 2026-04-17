import { createStartNode } from './start.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { fixtureProtocol } from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
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

const baseState: DiscoveryReviewState = {
  executionContext: baseCtx,
  reviewProtocol: fixtureProtocol,
  documents: fixtureDocuments,
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
  status: 'protocol_setup',
  error: undefined,
  startedAt: 0,
  completedAt: undefined,
  messages: [],
} as unknown as DiscoveryReviewState;

describe('StartNode', () => {
  const startNode = createStartNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets status to protocol_setup', async () => {
    const result = await startNode(baseState);
    expect(result.status).toBe('protocol_setup');
  });

  it('records startedAt timestamp', async () => {
    const before = Date.now();
    const result = await startNode(baseState);
    const after = Date.now();
    expect(result.startedAt).toBeGreaterThanOrEqual(before);
    expect(result.startedAt).toBeLessThanOrEqual(after);
  });

  it('emits dr:started SSE event', async () => {
    await startNode(baseState);
    const calls = mockObservability.emitProgress.mock.calls;
    const startCall = calls.find((c: any[]) => c[3]?.step === 'dr:started');
    expect(startCall).toBeDefined();
    expect(startCall![3].matterId).toBe(fixtureProtocol.matterId);
    expect(startCall![3].matterName).toBe(fixtureProtocol.matterName);
    expect(startCall![3].documentCount).toBe(fixtureDocuments.length);
  });

  it('adds a HumanMessage to messages array', async () => {
    const result = await startNode(baseState);
    expect(result.messages).toHaveLength(1);
    const msgs = result.messages as Array<{ content: string }>;
    const firstMsg = msgs[0];
    expect(firstMsg).toBeDefined();
    expect(firstMsg!.content).toContain(fixtureProtocol.matterName);
  });

  it('passes the full ExecutionContext to observability (not destructured)', async () => {
    await startNode(baseState);
    const firstArg = mockObservability.emitProgress.mock.calls[0][0];
    // Must be the whole context object, not individual fields
    expect(firstArg).toBe(baseCtx);
  });
});
