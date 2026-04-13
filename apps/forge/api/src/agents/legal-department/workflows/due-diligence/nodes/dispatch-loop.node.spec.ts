import { createDispatchLoopNode } from './dispatch-loop.node';
import type { DueDiligenceState } from '../due-diligence.state';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'u1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function makeState(overrides: Partial<DueDiligenceState> = {}): DueDiligenceState {
  return {
    executionContext: baseCtx,
    dealContext: {
      transactionType: 'acquisition',
      targetCompany: 'TargetCo',
      buyerCompany: 'BuyerCo',
      jurisdictions: ['US'],
      focusAreas: [],
      knownIssues: [],
    },
    documents: [
      { documentId: 'doc-001', name: 'NDA.pdf', content: 'text', sizeBytes: 100 },
      { documentId: 'doc-002', name: 'MSA.pdf', content: 'text', sizeBytes: 200 },
      { documentId: 'doc-003', name: 'LOI.pdf', content: 'text', sizeBytes: 300 },
    ],
    documentIndex: [],
    documentQueue: ['doc-002', 'doc-003'],
    documentsAnalyzed: ['doc-001'],
    documentsFailed: {},
    perDocumentOutputs: {},
    runningFindings: {},
    status: 'analyzing',
    startedAt: Date.now(),
    messages: [],
    ...overrides,
  } as unknown as DueDiligenceState;
}

describe('DispatchLoopNode', () => {
  const dispatchLoopNode = createDispatchLoopNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty partial (signals next document via graph edge)', async () => {
    const result = await dispatchLoopNode(makeState());
    expect(result).toEqual({});
  });

  it('emits progress with correct document count', async () => {
    await dispatchLoopNode(makeState());

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseCtx,
      'conv-1',
      expect.stringContaining('document 2 of 3'),
      expect.objectContaining({
        remaining: 2,
        analyzed: 1,
        failed: 0,
      }),
    );
  });

  it('calculates progress proportional to completed documents (10-75% range)', async () => {
    // 1 of 3 completed => 10 + round((1/3)*65) = 10 + 22 = 32
    await dispatchLoopNode(makeState());

    const progressArg = mockObservability.emitProgress.mock.calls[0][3];
    expect(progressArg.progress).toBe(32);
  });

  it('progress at 0 completed = 10%', async () => {
    const state = makeState({
      documentsAnalyzed: [],
      documentQueue: ['doc-001', 'doc-002', 'doc-003'],
    });
    await dispatchLoopNode(state);

    const progressArg = mockObservability.emitProgress.mock.calls[0][3];
    expect(progressArg.progress).toBe(10);
  });

  it('progress at all completed = 75%', async () => {
    const state = makeState({
      documentsAnalyzed: ['doc-001', 'doc-002', 'doc-003'],
      documentQueue: [],
    });
    await dispatchLoopNode(state);

    const progressArg = mockObservability.emitProgress.mock.calls[0][3];
    expect(progressArg.progress).toBe(75);
  });

  it('counts failed documents toward completed for progress', async () => {
    // 1 analyzed + 1 failed = 2 of 3 completed => 10 + round((2/3)*65) = 10 + 43 = 53
    const state = makeState({
      documentsAnalyzed: ['doc-001'],
      documentsFailed: { 'doc-002': 'parse error' },
      documentQueue: ['doc-003'],
    });
    await dispatchLoopNode(state);

    const progressArg = mockObservability.emitProgress.mock.calls[0][3];
    expect(progressArg.progress).toBe(53);
  });

  it('emits step name with document position', async () => {
    await dispatchLoopNode(makeState());

    const stepArg = mockObservability.emitProgress.mock.calls[0][3];
    expect(stepArg.step).toBe('analyzing_doc_2_of_3');
  });

  it('handles single-document case', async () => {
    const state = makeState({
      documents: [{ documentId: 'doc-001', name: 'a.pdf', content: 'x', sizeBytes: 10 }],
      documentQueue: ['doc-001'],
      documentsAnalyzed: [],
    });
    await dispatchLoopNode(state);

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseCtx,
      'conv-1',
      expect.stringContaining('document 1 of 1'),
      expect.objectContaining({ remaining: 1, analyzed: 0, failed: 0 }),
    );
  });
});
