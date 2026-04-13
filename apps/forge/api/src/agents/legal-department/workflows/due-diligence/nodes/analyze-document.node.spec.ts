import { createAnalyzeDocumentNode } from './analyze-document.node';
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
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const baseState: DueDiligenceState = {
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
      content: 'Non-Disclosure Agreement text...',
      sizeBytes: 100,
    },
    {
      documentId: 'doc-002',
      name: 'MSA.pdf',
      content: 'Master Service Agreement text...',
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
      riskScore: null,
      status: 'classified',
      specialistsAssigned: [],
      specialistsCompleted: [],
    },
    {
      documentId: 'doc-002',
      name: 'MSA.pdf',
      documentType: 'contract',
      parties: ['AcmeCo'],
      date: null,
      summary: 'A contract',
      riskScore: null,
      status: 'classified',
      specialistsAssigned: [],
      specialistsCompleted: [],
    },
  ],
  documentQueue: ['doc-001', 'doc-002'],
  documentsAnalyzed: [],
  documentsFailed: {},
  perDocumentOutputs: {},
  runningFindings: {},
  status: 'analyzing',
  startedAt: Date.now(),
  messages: [],
} as unknown as DueDiligenceState;

describe('AnalyzeDocumentNode', () => {
  const analyzeNode = createAnalyzeDocumentNode(
    mockLLMClient,
    mockObservability,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pops the first document from the queue', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        overallRisk: 'high',
        riskFlags: [
          {
            name: 'One-sided NDA',
            severity: 'high',
            description: 'NDA heavily favors discloser',
          },
        ],
        keyFindings: [],
        summary: 'Analyzed NDA',
      }),
    });

    const result = await analyzeNode(baseState);
    expect(result.documentQueue).toEqual(['doc-002']);
    expect(result.documentsAnalyzed).toContain('doc-001');
  });

  it('marks document as complete after analysis', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"overallRisk":"medium","riskFlags":[],"keyFindings":[],"summary":"ok"}',
    });

    const result = await analyzeNode(baseState);
    const doc = result.documentIndex?.find((d) => d.documentId === 'doc-001');
    expect(doc?.status).toBe('complete');
    expect(doc?.specialistsAssigned?.length).toBeGreaterThan(0);
    expect(doc?.specialistsCompleted?.length).toBeGreaterThan(0);
  });

  it('stores per-document outputs', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
    });

    const result = await analyzeNode(baseState);
    expect(result.perDocumentOutputs).toBeDefined();
    const docOutput = result.perDocumentOutputs!['doc-001'];
    expect(docOutput).toBeDefined();
    expect(docOutput!.routingDecision).toBeDefined();
  });

  it('extracts risk score from specialist output', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"overallRisk":"critical","riskFlags":[],"keyFindings":[],"summary":"bad"}',
    });

    const result = await analyzeNode(baseState);
    const doc = result.documentIndex?.find((d) => d.documentId === 'doc-001');
    expect(doc?.riskScore).toBe(90); // critical = 90
  });

  it('handles individual specialist failures without stopping document', async () => {
    // When individual specialists fail, the document still completes
    // (specialist errors are caught per-specialist, not per-document)
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM exploded'));

    const result = await analyzeNode(baseState);
    // Document completes (specialist errors are caught individually)
    expect(result.documentQueue).toEqual(['doc-002']);
    expect(result.documentsAnalyzed).toContain('doc-001');
    const doc = result.documentIndex?.find((d) => d.documentId === 'doc-001');
    expect(doc?.status).toBe('complete');
    // Specialist outputs contain error markers
    const output = result.perDocumentOutputs?.['doc-001'];
    expect(output).toBeDefined();
    const anySpecialistOutput = Object.values(
      output!.specialistOutputs,
    )[0] as Record<string, unknown>;
    expect(anySpecialistOutput?.error).toContain('LLM exploded');
  });

  it('returns empty when queue is empty', async () => {
    const emptyState = {
      ...baseState,
      documentQueue: [],
    } as unknown as DueDiligenceState;

    const result = await analyzeNode(emptyState);
    expect(result).toEqual({});
  });

  it('appends to running findings', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        overallRisk: 'high',
        riskFlags: [
          {
            name: 'Risk A',
            severity: 'high',
            description: 'A risky thing',
          },
        ],
        keyFindings: [],
        summary: 'ok',
      }),
    });

    const result = await analyzeNode(baseState);
    expect(Object.keys(result.runningFindings ?? {})).not.toHaveLength(0);
  });

  it('emits document_analysis_started and complete events', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
    });

    await analyzeNode(baseState);

    const steps = mockObservability.emitProgress.mock.calls.map(
      (c: any[]) => c[3]?.step,
    );
    expect(steps).toContain('dd:document_analysis_started');
    expect(steps).toContain('dd:document_analysis_complete');
  });
});
