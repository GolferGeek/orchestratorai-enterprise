import { createHitlGate2Node } from './hitl-gate-2.node';
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

const sampleRiskMatrix = {
  cells: [
    {
      category: 'contractual' as const,
      severity: 'high' as const,
      count: 3,
      documentRefs: [
        {
          documentId: 'doc-001',
          documentName: 'NDA.pdf',
          finding: 'Broad non-compete',
        },
      ],
    },
    {
      category: 'ip' as const,
      severity: 'critical' as const,
      count: 1,
      documentRefs: [
        {
          documentId: 'doc-002',
          documentName: 'IP-Agreement.pdf',
          finding: 'IP ownership unclear',
        },
      ],
    },
  ],
};

const sampleDealBreakers = [
  {
    finding: 'IP ownership unclear',
    category: 'ip',
    severity: 'critical' as const,
    documentRefs: [{ documentId: 'doc-002', documentName: 'IP-Agreement.pdf' }],
    reasoning: 'IP assignment clause is ambiguous',
    recommendation: 'Require revised IP assignment before closing',
  },
];

const sampleCategoryAnalysis = {
  contractual: {
    category: 'contractual',
    narrative: 'Several contracts have broad non-compete clauses.',
    findings: [],
    overallRisk: 'high' as const,
  },
};

function makeState(
  overrides: Partial<DueDiligenceState> = {},
): DueDiligenceState {
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
      {
        documentId: 'doc-001',
        name: 'NDA.pdf',
        content: 'text',
        sizeBytes: 100,
      },
      {
        documentId: 'doc-002',
        name: 'IP-Agreement.pdf',
        content: 'text',
        sizeBytes: 200,
      },
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
        specialistsAssigned: [],
        specialistsCompleted: [],
      },
      {
        documentId: 'doc-002',
        name: 'IP-Agreement.pdf',
        documentType: 'ip-agreement',
        parties: ['TargetCo'],
        date: null,
        summary: 'IP assignment',
        riskScore: 90,
        status: 'complete',
        specialistsAssigned: [],
        specialistsCompleted: [],
      },
    ],
    documentQueue: [],
    documentsAnalyzed: ['doc-001', 'doc-002'],
    documentsFailed: {},
    perDocumentOutputs: {},
    runningFindings: {},
    riskMatrix: sampleRiskMatrix,
    dealBreakerFlags: sampleDealBreakers,
    perCategoryAnalysis: sampleCategoryAnalysis,
    missingDocuments: [
      {
        referencedIn: { documentId: 'doc-001', documentName: 'NDA.pdf' },
        description: 'Referenced side letter not found',
        importance: 'medium' as const,
      },
    ],
    crossReferenceMap: [
      {
        sourceDocId: 'doc-001',
        sourceDocName: 'NDA.pdf',
        targetDocId: 'doc-002',
        targetDocName: 'IP-Agreement.pdf',
        relationship: 'NDA references IP agreement',
      },
    ],
    status: 'awaiting_synthesis_review',
    startedAt: Date.now(),
    messages: [],
    ...overrides,
  } as unknown as DueDiligenceState;
}

describe('HitlGate2Node', () => {
  const hitlGate2Node = createHitlGate2Node(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds review payload with gate=synthesis', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.gate).toBe('synthesis');
  });

  it('includes risk matrix in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.riskMatrix).toEqual(sampleRiskMatrix);
  });

  it('includes deal-breaker flags in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.dealBreakerFlags).toHaveLength(1);
    expect((payloadArg.dealBreakerFlags as any[])[0].finding).toBe(
      'IP ownership unclear',
    );
  });

  it('includes per-category analysis in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.perCategoryAnalysis).toEqual(sampleCategoryAnalysis);
  });

  it('includes missing documents in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.missingDocuments).toHaveLength(1);
  });

  it('includes cross-reference map in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.crossReferenceMap).toHaveLength(1);
  });

  it('includes document index in review payload', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const payloadArg = mockInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payloadArg.documentIndex).toHaveLength(2);
  });

  it('returns approve decision and sets status=generating_report', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    const result = await hitlGate2Node(makeState());

    expect(result.hitlGate2Decision).toEqual({ decision: 'approve' });
    expect(result.status).toBe('generating_report');
  });

  it('returns reject decision with feedback', async () => {
    mockInterrupt.mockReturnValue({
      decision: 'reject',
      feedback: 'Risk matrix underestimates regulatory exposure',
    } as any);

    const result = await hitlGate2Node(makeState());

    expect(result.hitlGate2Decision).toEqual({
      decision: 'reject',
      feedback: 'Risk matrix underestimates regulatory exposure',
    });
    expect(result.status).toBe('generating_report');
  });

  it('returns modify decision with edited outputs', async () => {
    mockInterrupt.mockReturnValue({
      decision: 'modify',
      editedOutputs: { riskOverride: { 'doc-001': 'critical' } },
      feedback: 'Elevated NDA risk to critical',
    } as any);

    const result = await hitlGate2Node(makeState());

    expect(result.hitlGate2Decision?.decision).toBe('modify');
  });

  it('emits progress at 85% before interrupt', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const startCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd_hitl_gate_2_start',
    );
    expect(startCall).toBeDefined();
    expect(startCall[3].progress).toBe(85);
    expect(startCall[3].reviewRequired).toBe(true);
  });

  it('emits completion progress with decision after resume', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    await hitlGate2Node(makeState());

    const completeCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd_hitl_gate_2_complete',
    );
    expect(completeCall).toBeDefined();
    expect(completeCall[3].progress).toBe(86);
    expect(completeCall[3].decision).toBe('approve');
  });

  it('handles empty synthesis outputs gracefully', async () => {
    mockInterrupt.mockReturnValue({ decision: 'approve' } as any);

    const state = makeState({
      riskMatrix: undefined,
      dealBreakerFlags: undefined,
      perCategoryAnalysis: undefined,
      missingDocuments: undefined,
      crossReferenceMap: undefined,
    });

    const result = await hitlGate2Node(state);
    expect(result.hitlGate2Decision).toEqual({ decision: 'approve' });
    expect(result.status).toBe('generating_report');
  });
});
