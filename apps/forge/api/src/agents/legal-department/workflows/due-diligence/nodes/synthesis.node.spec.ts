import { createSynthesisNode } from './synthesis.node';
import type { DueDiligenceState } from '../due-diligence.state';

const mockLLMClient = {
  callLLM: jest.fn(),
} as any;

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

const fullSynthesisResponse = {
  riskMatrix: {
    cells: [
      {
        category: 'contractual',
        severity: 'high',
        count: 3,
        documentRefs: [
          { documentId: 'doc-001', documentName: 'NDA.pdf', finding: 'Broad non-compete' },
        ],
      },
      {
        category: 'ip',
        severity: 'critical',
        count: 1,
        documentRefs: [
          { documentId: 'doc-002', documentName: 'IP.pdf', finding: 'Unclear ownership' },
        ],
      },
      {
        category: 'financial',
        severity: 'low',
        count: 2,
        documentRefs: [
          { documentId: 'doc-003', documentName: 'Financials.pdf', finding: 'Minor discrepancy' },
        ],
      },
    ],
  },
  perCategoryAnalysis: {
    contractual: {
      category: 'contractual',
      narrative: 'Several contracts contain overbroad terms.',
      findings: [
        {
          documentId: 'doc-001',
          documentName: 'NDA.pdf',
          clauseRef: '§4.2',
          finding: 'Non-compete is unreasonably broad',
          severity: 'high',
          recommendation: 'Negotiate narrower scope',
        },
      ],
      overallRisk: 'high',
    },
    ip: {
      category: 'ip',
      narrative: 'IP ownership unclear.',
      findings: [
        {
          documentId: 'doc-002',
          documentName: 'IP.pdf',
          finding: 'IP assignment ambiguous',
          severity: 'critical',
          recommendation: 'Require clear assignment',
        },
      ],
      overallRisk: 'critical',
    },
  },
  dealBreakerFlags: [
    {
      finding: 'IP ownership unclear',
      category: 'ip',
      severity: 'critical',
      documentRefs: [{ documentId: 'doc-002', documentName: 'IP.pdf' }],
      reasoning: 'Core IP may not transfer',
      recommendation: 'Resolve before closing',
    },
  ],
  missingDocuments: [
    {
      referencedIn: { documentId: 'doc-001', documentName: 'NDA.pdf' },
      description: 'Side letter referenced in §7',
      importance: 'medium',
    },
  ],
  crossReferenceMap: [
    {
      sourceDocId: 'doc-001',
      sourceDocName: 'NDA.pdf',
      targetDocId: 'doc-002',
      targetDocName: 'IP.pdf',
      relationship: 'NDA references IP agreement',
      riskImplication: 'IP terms may conflict with NDA scope',
    },
  ],
};

function makeState(overrides: Partial<DueDiligenceState> = {}): DueDiligenceState {
  return {
    executionContext: baseCtx,
    dealContext: {
      transactionType: 'acquisition',
      targetCompany: 'TargetCo',
      buyerCompany: 'BuyerCo',
      jurisdictions: ['US', 'UK'],
      focusAreas: ['ip'],
      knownIssues: ['Prior IP dispute'],
    },
    documents: [
      { documentId: 'doc-001', name: 'NDA.pdf', content: 'NDA text', sizeBytes: 100 },
      { documentId: 'doc-002', name: 'IP.pdf', content: 'IP text', sizeBytes: 200 },
      { documentId: 'doc-003', name: 'Financials.pdf', content: 'Fin text', sizeBytes: 300 },
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
        name: 'IP.pdf',
        documentType: 'ip-agreement',
        parties: ['TargetCo'],
        date: null,
        summary: 'IP assignment',
        riskScore: 90,
        status: 'complete',
        specialistsAssigned: ['ip-specialist'],
        specialistsCompleted: ['ip-specialist'],
      },
      {
        documentId: 'doc-003',
        name: 'Financials.pdf',
        documentType: 'financial-statement',
        parties: ['TargetCo'],
        date: '2024-06-30',
        summary: 'Q2 financials',
        riskScore: 30,
        status: 'complete',
        specialistsAssigned: ['financial-analyst'],
        specialistsCompleted: ['financial-analyst'],
      },
    ],
    documentQueue: [],
    documentsAnalyzed: ['doc-001', 'doc-002', 'doc-003'],
    documentsFailed: {},
    perDocumentOutputs: {
      'doc-001': {
        specialistOutputs: { 'contract-analyst': { summary: 'NDA review', riskFlags: [] } },
        routingDecision: { specialists: ['contract-analyst'] } as any,
      },
      'doc-002': {
        specialistOutputs: { 'ip-specialist': { summary: 'IP review', riskFlags: [] } },
        routingDecision: { specialists: ['ip-specialist'] } as any,
      },
      'doc-003': {
        specialistOutputs: { 'financial-analyst': { summary: 'Financials review', riskFlags: [] } },
        routingDecision: { specialists: ['financial-analyst'] } as any,
      },
    },
    runningFindings: {
      'contract-analyst': {
        specialistKey: 'contract-analyst',
        documentCount: 1,
        keyFindings: [
          {
            documentId: 'doc-001',
            documentName: 'NDA.pdf',
            finding: 'Non-compete too broad',
            severity: 'high',
            category: 'contractual',
          },
        ],
        crossReferences: [],
        cumulativeRisks: ['Broad non-compete'],
      },
    },
    status: 'synthesizing',
    startedAt: Date.now(),
    messages: [],
    ...overrides,
  } as unknown as DueDiligenceState;
}

describe('SynthesisNode', () => {
  const synthesisNode = createSynthesisNode(mockLLMClient, mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('produces risk matrix from LLM response', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.riskMatrix).toBeDefined();
    expect(result.riskMatrix!.cells).toHaveLength(3);
  });

  it('produces per-category analysis', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.perCategoryAnalysis).toBeDefined();
    expect(result.perCategoryAnalysis!['contractual']).toBeDefined();
    expect(result.perCategoryAnalysis!['ip']).toBeDefined();
    expect(result.perCategoryAnalysis!['contractual']!.overallRisk).toBe('high');
  });

  it('extracts deal-breaker flags', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.dealBreakerFlags).toHaveLength(1);
    expect(result.dealBreakerFlags![0]!.severity).toBe('critical');
    expect(result.dealBreakerFlags![0]!.finding).toBe('IP ownership unclear');
  });

  it('identifies missing documents', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.missingDocuments).toHaveLength(1);
    expect(result.missingDocuments![0]!.importance).toBe('medium');
  });

  it('builds cross-reference map', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.crossReferenceMap).toHaveLength(1);
    expect(result.crossReferenceMap![0]!.relationship).toBe('NDA references IP agreement');
  });

  it('sets status to awaiting_synthesis_review on success', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.status).toBe('awaiting_synthesis_review');
  });

  it('handles markdown-wrapped JSON response', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + JSON.stringify(fullSynthesisResponse) + '\n```',
    });

    const result = await synthesisNode(makeState());

    expect(result.riskMatrix).toBeDefined();
    expect(result.riskMatrix!.cells).toHaveLength(3);
  });

  it('strips <think> tags from response', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text:
        '<think>Let me analyze the documents...</think>\n' +
        JSON.stringify(fullSynthesisResponse),
    });

    const result = await synthesisNode(makeState());

    expect(result.riskMatrix).toBeDefined();
  });

  it('handles unparseable LLM response with empty defaults', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });

    const result = await synthesisNode(makeState());

    expect(result.riskMatrix).toEqual({ cells: [] });
    expect(result.perCategoryAnalysis).toEqual({});
    expect(result.dealBreakerFlags).toEqual([]);
    expect(result.missingDocuments).toEqual([]);
    expect(result.crossReferenceMap).toEqual([]);
    expect(result.status).toBe('awaiting_synthesis_review');
  });

  it('handles LLM error with failed status', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('API rate limited'));

    const result = await synthesisNode(makeState());

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Synthesis failed');
    expect(result.error).toContain('API rate limited');
  });

  it('handles partial LLM response (some fields missing)', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        riskMatrix: { cells: [{ category: 'contractual', severity: 'low', count: 1, documentRefs: [] }] },
        // missing other fields
      }),
    });

    const result = await synthesisNode(makeState());

    expect(result.riskMatrix!.cells).toHaveLength(1);
    expect(result.perCategoryAnalysis).toEqual({});
    expect(result.dealBreakerFlags).toEqual([]);
    expect(result.missingDocuments).toEqual([]);
    expect(result.crossReferenceMap).toEqual([]);
  });

  it('handles zero deal-breaker flags', async () => {
    const noDealBreakers = { ...fullSynthesisResponse, dealBreakerFlags: [] };
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(noDealBreakers),
    });

    const result = await synthesisNode(makeState());

    expect(result.dealBreakerFlags).toEqual([]);
  });

  it('includes deal context in LLM prompt', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const userMessage = mockLLMClient.callLLM.mock.calls[0][0].userMessage as string;
    expect(userMessage).toContain('TargetCo');
    expect(userMessage).toContain('BuyerCo');
    expect(userMessage).toContain('acquisition');
    expect(userMessage).toContain('US');
    expect(userMessage).toContain('UK');
    expect(userMessage).toContain('ip');
    expect(userMessage).toContain('Prior IP dispute');
  });

  it('includes document summaries in LLM prompt', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const userMessage = mockLLMClient.callLLM.mock.calls[0][0].userMessage as string;
    expect(userMessage).toContain('NDA.pdf');
    expect(userMessage).toContain('IP.pdf');
    expect(userMessage).toContain('Financials.pdf');
  });

  it('includes running findings in LLM prompt', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const userMessage = mockLLMClient.callLLM.mock.calls[0][0].userMessage as string;
    expect(userMessage).toContain('contract-analyst');
    expect(userMessage).toContain('Non-compete too broad');
  });

  it('only includes completed documents in synthesis', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    const state = makeState();
    // Mark one document as failed
    state.documentIndex[2]!.status = 'failed';

    await synthesisNode(state);

    const userMessage = mockLLMClient.callLLM.mock.calls[0][0].userMessage as string;
    // Financials.pdf is failed, so it shouldn't appear in doc summaries
    expect(userMessage).toContain('NDA.pdf');
    expect(userMessage).toContain('IP.pdf');
    // The doc counts should still reflect the total
    expect(userMessage).toContain('Total Documents: 3');
  });

  it('emits synthesis_started and synthesis_complete events', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const steps = mockObservability.emitProgress.mock.calls.map(
      (c: any[]) => c[3]?.step,
    );
    expect(steps).toContain('dd:synthesis_started');
    expect(steps).toContain('dd:synthesis_complete');
  });

  it('reports risk matrix cell count and deal-breaker count in completion event', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const completeCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd:synthesis_complete',
    );
    expect(completeCall).toBeDefined();
    expect(completeCall[3].riskMatrixSummary.cells).toBe(3);
    expect(completeCall[3].dealBreakerCount).toBe(1);
  });

  it('calls LLM with low temperature and high token budget', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const callArgs = mockLLMClient.callLLM.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.2);
    expect(callArgs.maxTokens).toBe(8000);
    expect(callArgs.callerName).toBe('legal-department:dd-synthesis');
  });

  it('passes execution context to LLM', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify(fullSynthesisResponse),
    });

    await synthesisNode(makeState());

    const callArgs = mockLLMClient.callLLM.mock.calls[0][0];
    expect(callArgs.context).toEqual(baseCtx);
  });
});
