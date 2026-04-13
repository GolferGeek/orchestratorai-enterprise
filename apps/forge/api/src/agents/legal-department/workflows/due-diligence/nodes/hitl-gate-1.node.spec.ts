import { createHitlGate1Node } from './hitl-gate-1.node';
import type { DueDiligenceState } from '../due-diligence.state';

// Mock @langchain/langgraph interrupt
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(),
}));

import { interrupt } from '@langchain/langgraph';

const mockInterrupt = interrupt as jest.MockedFunction<typeof interrupt>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'u1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
};

function makeState(overrides: Partial<DueDiligenceState> = {}): DueDiligenceState {
  return {
    executionContext: baseCtx,
    dealContext: {
      transactionType: 'acquisition',
      targetCompany: 'TargetCo',
      buyerCompany: 'BuyerCo',
      jurisdictions: ['US'],
      focusAreas: ['ip', 'employment'],
      knownIssues: [],
    },
    documents: [
      { documentId: 'doc-001', name: 'NDA.pdf', content: 'text', sizeBytes: 100 },
      { documentId: 'doc-002', name: 'MSA.pdf', content: 'text', sizeBytes: 200 },
    ],
    documentIndex: [
      {
        documentId: 'doc-001',
        name: 'NDA.pdf',
        documentType: 'nda',
        parties: ['MegaCorp'],
        date: '2024-01-15',
        summary: 'An NDA',
        riskScore: 60,
        status: 'complete',
        specialistsAssigned: ['contract-analyst'],
        specialistsCompleted: ['contract-analyst'],
      },
      {
        documentId: 'doc-002',
        name: 'MSA.pdf',
        documentType: 'contract',
        parties: ['AcmeCo'],
        date: null,
        summary: 'A contract',
        riskScore: 45,
        status: 'complete',
        specialistsAssigned: ['contract-analyst'],
        specialistsCompleted: ['contract-analyst'],
      },
    ],
    documentQueue: [],
    documentsAnalyzed: ['doc-001', 'doc-002'],
    documentsFailed: {},
    perDocumentOutputs: {},
    runningFindings: {
      'contract-analyst': {
        specialistKey: 'contract-analyst',
        documentCount: 2,
        keyFindings: [
          {
            documentId: 'doc-001',
            documentName: 'NDA.pdf',
            finding: 'Non-compete clause too broad',
            severity: 'high',
            category: 'contractual',
          },
        ],
        crossReferences: [],
        cumulativeRisks: ['Broad non-compete'],
      },
    },
    status: 'awaiting_extraction_review',
    startedAt: Date.now(),
    messages: [],
    ...overrides,
  } as unknown as DueDiligenceState;
}

describe('HitlGate1Node', () => {
  const hitlGate1Node = createHitlGate1Node(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds review payload with gate=extraction', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.gate).toBe('extraction');
  });

  it('includes deal context in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.dealContext).toEqual(
      expect.objectContaining({
        transactionType: 'acquisition',
        targetCompany: 'TargetCo',
      }),
    );
  });

  it('includes document index in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.documentIndex).toHaveLength(2);
  });

  it('includes running findings in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.runningFindings).toBeDefined();
  });

  it('includes document counts in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.totalDocuments).toBe(2);
    expect(payloadArg.analyzed).toBe(2);
    expect(payloadArg.failed).toBe(0);
  });

  it('returns approve decision and sets status=synthesizing', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    const result = await hitlGate1Node(makeState());

    expect(result.hitlGate1Decision).toEqual({ decision: 'approve' });
    expect(result.status).toBe('synthesizing');
  });

  it('returns reject decision with feedback', async () => {
    mockInterrupt.mockReturnValue({
      decision: 'reject',
      feedback: 'Need deeper IP analysis',
    } as any);

    const result = await hitlGate1Node(makeState());

    expect(result.hitlGate1Decision).toEqual({
      decision: 'reject',
      feedback: 'Need deeper IP analysis',
    });
    expect(result.status).toBe('synthesizing');
  });

  it('returns modify decision with edited outputs', async () => {
    mockInterrupt.mockReturnValue({
      decision: 'modify',
      editedOutputs: { reclassify: { 'doc-001': 'employment-agreement' } },
      feedback: 'Reclassified NDA as employment agreement',
    } as any);

    const result = await hitlGate1Node(makeState());

    expect(result.hitlGate1Decision?.decision).toBe('modify');
  });

  it('emits progress at 75% before interrupt', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const startCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd_hitl_gate_1_start',
    );
    expect(startCall).toBeDefined();
    expect(startCall[3].progress).toBe(75);
    expect(startCall[3].reviewRequired).toBe(true);
  });

  it('emits completion progress with decision after resume', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate1Node(makeState());

    const completeCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd_hitl_gate_1_complete',
    );
    expect(completeCall).toBeDefined();
    expect(completeCall[3].progress).toBe(76);
    expect(completeCall[3].decision).toBe('approve');
  });

  it('includes failed document count when some docs failed', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    const state = makeState({
      documentsAnalyzed: ['doc-001'],
      documentsFailed: { 'doc-002': 'parse error' },
    });
    await hitlGate1Node(state);

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<string, unknown>;
    expect(payloadArg.analyzed).toBe(1);
    expect(payloadArg.failed).toBe(1);
  });
});
