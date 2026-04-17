import { createProtocolValidationNode } from './protocol-validation.node';
import type { DiscoveryReviewState } from '../discovery-review.state';
import {
  fixtureProtocol,
  fixtureMinimalProtocol,
} from '../__fixtures__/protocol';
import { fixtureDocuments } from '../__fixtures__/documents';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
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

function makeState(
  overrides: Partial<DiscoveryReviewState> = {},
): DiscoveryReviewState {
  return {
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
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  } as unknown as DiscoveryReviewState;
}

describe('ProtocolValidationNode', () => {
  const node = createProtocolValidationNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes a valid full protocol', async () => {
    const result = await node(makeState());
    expect(result.status).toBe('ingesting');
    expect(result.error).toBeUndefined();
  });

  it('passes a minimal valid protocol', async () => {
    const result = await node(
      makeState({ reviewProtocol: fixtureMinimalProtocol }),
    );
    expect(result.status).toBe('ingesting');
  });

  it('fails when matterId is empty', async () => {
    const state = makeState({
      reviewProtocol: { ...fixtureProtocol, matterId: '' },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('matterId is required');
  });

  it('fails when matterName is empty', async () => {
    const state = makeState({
      reviewProtocol: { ...fixtureProtocol, matterName: '' },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('matterName is required');
  });

  it('fails when claims is empty', async () => {
    const state = makeState({
      reviewProtocol: {
        ...fixtureProtocol,
        relevanceCriteria: { ...fixtureProtocol.relevanceCriteria, claims: [] },
      },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('claims must have at least one');
  });

  it('fails when privilegeReviewRequired=true and no attorneys listed', async () => {
    const state = makeState({
      reviewProtocol: {
        ...fixtureProtocol,
        privilegeReviewRequired: true,
        privilegeHolders: {
          attorneys: [],
          firms: [],
          inHouseCounsel: [],
        },
      },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('attorneys must have at least one');
  });

  it('passes when privilegeReviewRequired=false and no attorneys listed', async () => {
    const state = makeState({
      reviewProtocol: {
        ...fixtureProtocol,
        privilegeReviewRequired: false,
        privilegeHolders: {
          attorneys: [],
          firms: [],
          inHouseCounsel: [],
        },
      },
    });
    const result = await node(state);
    expect(result.status).toBe('ingesting');
  });

  it('fails when batchSize is 0', async () => {
    const state = makeState({
      reviewProtocol: { ...fixtureProtocol, batchSize: 0 },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('batchSize must be a positive integer');
  });

  it('fails when confidenceThreshold is out of range', async () => {
    const state = makeState({
      reviewProtocol: { ...fixtureProtocol, confidenceThreshold: 1.0 },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain(
      'confidenceThreshold must be between 0 and 1',
    );
  });

  it('collects multiple validation errors in a single message', async () => {
    const state = makeState({
      reviewProtocol: {
        ...fixtureProtocol,
        matterId: '',
        matterName: '',
        relevanceCriteria: { ...fixtureProtocol.relevanceCriteria, claims: [] },
      },
    });
    const result = await node(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('matterId');
    expect(result.error).toContain('matterName');
    expect(result.error).toContain('claims');
  });

  it('emits emitFailed when validation fails', async () => {
    const state = makeState({
      reviewProtocol: { ...fixtureProtocol, matterId: '' },
    });
    await node(state);
    expect(mockObservability.emitFailed).toHaveBeenCalledTimes(1);
    const call = mockObservability.emitFailed.mock.calls[0];
    expect(call[0]).toBe(baseCtx); // whole context passed, not destructured
  });

  it('emits completion progress event on success', async () => {
    await node(makeState());
    const calls = mockObservability.emitProgress.mock.calls;
    const doneCall = calls.find(
      (c: any[]) => c[3]?.step === 'dr_protocol_validation_complete',
    );
    expect(doneCall).toBeDefined();
    expect(doneCall![3].matterId).toBe(fixtureProtocol.matterId);
  });
});
