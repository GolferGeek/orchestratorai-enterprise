import { createReportGenerationNode } from './report-generation.node';
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

function makeState(overrides: Partial<DueDiligenceState> = {}): DueDiligenceState {
  return {
    executionContext: baseCtx,
    dealContext: {
      transactionType: 'acquisition',
      targetCompany: 'TargetCo',
      buyerCompany: 'BuyerCo',
      dealValueRange: '$50M-$75M',
      jurisdictions: ['US', 'UK'],
      focusAreas: ['ip'],
      knownIssues: [],
    },
    documents: [
      { documentId: 'doc-001', name: 'NDA.pdf', content: 'NDA text', sizeBytes: 100 },
      { documentId: 'doc-002', name: 'IP.pdf', content: 'IP text', sizeBytes: 200 },
    ],
    documentIndex: [
      {
        documentId: 'doc-001',
        name: 'NDA.pdf',
        documentType: 'nda',
        parties: ['MegaCorp', 'TargetCo'],
        date: '2024-01-15',
        summary: 'An NDA between parties',
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
        summary: 'IP assignment agreement',
        riskScore: 90,
        status: 'complete',
        specialistsAssigned: ['ip-specialist'],
        specialistsCompleted: ['ip-specialist'],
      },
    ],
    documentQueue: [],
    documentsAnalyzed: ['doc-001', 'doc-002'],
    documentsFailed: {},
    perDocumentOutputs: {
      'doc-001': {
        specialistOutputs: {
          'contract-analyst': {
            summary: 'NDA has broad non-compete',
            riskFlags: [
              { name: 'Non-compete', severity: 'high', description: 'Too broad' },
            ],
          },
        },
        routingDecision: { specialists: ['contract-analyst'] } as any,
      },
      'doc-002': {
        specialistOutputs: {
          'ip-specialist': {
            summary: 'IP ownership unclear',
            riskFlags: [
              { name: 'IP assignment', severity: 'critical', description: 'Ambiguous clause' },
            ],
          },
        },
        routingDecision: { specialists: ['ip-specialist'] } as any,
      },
    },
    runningFindings: {},
    riskMatrix: {
      cells: [
        {
          category: 'contractual' as const,
          severity: 'high' as const,
          count: 1,
          documentRefs: [{ documentId: 'doc-001', documentName: 'NDA.pdf', finding: 'Broad non-compete' }],
        },
        {
          category: 'ip' as const,
          severity: 'critical' as const,
          count: 1,
          documentRefs: [{ documentId: 'doc-002', documentName: 'IP.pdf', finding: 'Unclear ownership' }],
        },
      ],
    },
    perCategoryAnalysis: {
      contractual: {
        category: 'contractual',
        narrative: 'Contracts contain overbroad non-compete clauses.',
        findings: [
          {
            documentId: 'doc-001',
            documentName: 'NDA.pdf',
            clauseRef: '§4.2',
            finding: 'Non-compete unreasonably broad',
            severity: 'high' as const,
            recommendation: 'Negotiate narrower scope',
          },
        ],
        overallRisk: 'high' as const,
      },
      ip: {
        category: 'ip',
        narrative: 'IP ownership unclear in assignment.',
        findings: [
          {
            documentId: 'doc-002',
            documentName: 'IP.pdf',
            finding: 'Assignment clause ambiguous',
            severity: 'critical' as const,
            recommendation: 'Require clear assignment',
          },
        ],
        overallRisk: 'critical' as const,
      },
    },
    dealBreakerFlags: [
      {
        finding: 'IP ownership unclear',
        category: 'ip',
        severity: 'critical' as const,
        documentRefs: [{ documentId: 'doc-002', documentName: 'IP.pdf' }],
        reasoning: 'Core IP may not transfer',
        recommendation: 'Resolve before closing',
      },
    ],
    missingDocuments: [
      {
        referencedIn: { documentId: 'doc-001', documentName: 'NDA.pdf' },
        description: 'Side letter from §7',
        importance: 'medium' as const,
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
    status: 'generating_report',
    startedAt: Date.now(),
    messages: [],
    ...overrides,
  } as unknown as DueDiligenceState;
}

describe('ReportGenerationNode', () => {
  const reportNode = createReportGenerationNode(mockLLMClient, mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Report Structure ─────────────────────────────────────────────

  it('generates a complete report with all sections', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: 'This executive summary covers the acquisition of TargetCo...',
    });

    const result = await reportNode(makeState());

    expect(result.report).toBeDefined();
    expect(result.report).toContain('# Due Diligence Report');
    expect(result.report).toContain('## 1. Executive Summary');
    expect(result.report).toContain('## 2. Risk Matrix');
    expect(result.report).toContain('## 3. Detailed Analysis by Category');
    expect(result.report).toContain('## 4. Document Index');
    expect(result.report).toContain('## 5. Cross-Reference Map');
    expect(result.report).toContain('## 6. Missing Documents');
    expect(result.report).toContain('## 7. Appendix: Per-Document Annotations');
  });

  it('includes deal context in report header', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Executive summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('acquisition');
    expect(result.report).toContain('TargetCo');
    expect(result.report).toContain('BuyerCo');
    expect(result.report).toContain('$50M-$75M');
    expect(result.report).toContain('US, UK');
  });

  it('includes document count in header', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('Documents:** 2 (2 analyzed, 0 failed)');
  });

  // ── Risk Matrix Section ──────────────────────────────────────────

  it('renders risk matrix as markdown table', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('| Category | Critical | High | Medium | Low |');
    expect(result.report).toContain('| contractual |');
    expect(result.report).toContain('| ip |');
  });

  it('renders all 7 categories in risk matrix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    const categories = ['contractual', 'ip', 'employment', 'regulatory', 'financial', 'corporate', 'environmental'];
    for (const cat of categories) {
      expect(result.report).toContain(`| ${cat} |`);
    }
  });

  it('shows correct counts per severity in risk matrix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    // contractual: 0 critical, 1 high, 0 medium, 0 low
    expect(result.report).toMatch(/\| contractual \| 0 \| 1 \| 0 \| 0 \|/);
    // ip: 1 critical, 0 high, 0 medium, 0 low
    expect(result.report).toMatch(/\| ip \| 1 \| 0 \| 0 \| 0 \|/);
  });

  it('handles empty risk matrix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState({ riskMatrix: { cells: [] } }));

    expect(result.report).toContain('*No risk matrix data available.*');
  });

  it('handles undefined risk matrix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState({ riskMatrix: undefined }));

    expect(result.report).toContain('*No risk matrix data available.*');
  });

  // ── Deal Breakers ────────────────────────────────────────────────

  it('includes deal-breaker flags', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('### Deal Breakers');
    expect(result.report).toContain('IP ownership unclear');
    expect(result.report).toContain('Core IP may not transfer');
    expect(result.report).toContain('Resolve before closing');
  });

  it('omits deal-breaker section when empty', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState({ dealBreakerFlags: [] }));

    expect(result.report).not.toContain('### Deal Breakers');
  });

  // ── Per-Category Analysis ────────────────────────────────────────

  it('includes per-category analysis with narratives', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('### Contractual');
    expect(result.report).toContain('**Overall Risk:** high');
    expect(result.report).toContain('overbroad non-compete');
    expect(result.report).toContain('### Ip');
    expect(result.report).toContain('**Overall Risk:** critical');
  });

  it('includes category findings with severity tags', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('[HIGH]');
    expect(result.report).toContain('[CRITICAL]');
    expect(result.report).toContain('Negotiate narrower scope');
  });

  // ── Document Index Section ───────────────────────────────────────

  it('renders document index table', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('| # | Document | Type | Risk Score | Status |');
    expect(result.report).toContain('| 1 | NDA.pdf | nda | 60 | complete |');
    expect(result.report).toContain('| 2 | IP.pdf | ip-agreement | 90 | complete |');
  });

  it('includes failed documents section when applicable', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const state = makeState();
    state.documentIndex.push({
      documentId: 'doc-003',
      name: 'Bad.pdf',
      documentType: 'unknown',
      parties: [],
      date: null,
      summary: '',
      riskScore: null,
      status: 'failed',
      error: 'Could not parse PDF',
      specialistsAssigned: [],
      specialistsCompleted: [],
    });

    const result = await reportNode(state);

    expect(result.report).toContain('### Failed Documents');
    expect(result.report).toContain('Bad.pdf');
    expect(result.report).toContain('Could not parse PDF');
  });

  // ── Cross-Reference Map ──────────────────────────────────────────

  it('renders cross-reference map', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('NDA.pdf → IP.pdf: NDA references IP agreement');
    expect(result.report).toContain('IP terms may conflict with NDA scope');
  });

  it('handles empty cross-reference map', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState({ crossReferenceMap: [] }));

    expect(result.report).toContain('*No cross-references identified.*');
  });

  // ── Missing Documents ────────────────────────────────────────────

  it('includes missing documents section', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('## 6. Missing Documents');
    expect(result.report).toContain('[MEDIUM]');
    expect(result.report).toContain('Side letter from §7');
    expect(result.report).toContain('referenced in NDA.pdf');
  });

  it('omits missing documents section when empty', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState({ missingDocuments: [] }));

    expect(result.report).not.toContain('## 6. Missing Documents');
  });

  // ── Appendix ─────────────────────────────────────────────────────

  it('includes per-document annotations in appendix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('### NDA.pdf');
    expect(result.report).toContain('**Type:** nda');
    expect(result.report).toContain('MegaCorp, TargetCo');
    expect(result.report).toContain('NDA has broad non-compete');
    expect(result.report).toContain('contract-analyst specialist');
  });

  it('includes specialist risk flags in appendix', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.report).toContain('[HIGH]');
    expect(result.report).toContain('Non-compete');
    expect(result.report).toContain('[CRITICAL]');
    expect(result.report).toContain('IP assignment');
  });

  // ── Executive Summary ────────────────────────────────────────────

  it('replaces placeholder with LLM-generated executive summary', async () => {
    const execSummary = 'The acquisition of TargetCo presents significant IP risks...';
    mockLLMClient.callLLM.mockResolvedValue({ text: execSummary });

    const result = await reportNode(makeState());

    expect(result.report).toContain(execSummary);
    expect(result.report).not.toContain('[Generated executive summary]');
  });

  it('falls back to static executive summary when LLM fails', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));

    const result = await reportNode(makeState());

    expect(result.report).toBeDefined();
    expect(result.report).toContain('analyzed 2 of 2 documents');
    expect(result.report).toContain('acquisition');
    expect(result.report).toContain('TargetCo');
    expect(result.report).toContain('1 deal-breaker risk');
  });

  it('fallback mentions failed document count when some fail', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));

    const state = makeState({
      documentsFailed: { 'doc-003': 'parse error' },
    });

    const result = await reportNode(state);

    expect(result.report).toContain('1 document(s) could not be analyzed');
  });

  it('fallback reports zero deal-breakers correctly', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));

    const result = await reportNode(makeState({ dealBreakerFlags: [] }));

    expect(result.report).toContain('No deal-breaker risks were identified');
  });

  // ── Status and Error Handling ────────────────────────────────────

  it('sets status to completed on success', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const result = await reportNode(makeState());

    expect(result.status).toBe('completed');
  });

  it('sets status to failed on assembly error', async () => {
    // Force an error by breaking state in a way that makes assembleReport throw
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    const state = makeState();
    // Simulate a broken dealContext that would cause TypeError
    (state as any).dealContext = null;

    const result = await reportNode(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Report generation failed');
  });

  // ── Observability ────────────────────────────────────────────────

  it('emits progress events', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    await reportNode(makeState());

    const steps = mockObservability.emitProgress.mock.calls.map(
      (c: any[]) => c[3]?.step,
    );
    expect(steps).toContain('dd_report_generation');
    expect(steps).toContain('dd:report_generated');
  });

  it('emits progress at 87% start and 95% complete', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    await reportNode(makeState());

    const startCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd_report_generation',
    );
    expect(startCall[3].progress).toBe(87);

    const completeCall = mockObservability.emitProgress.mock.calls.find(
      (c: any[]) => c[3]?.step === 'dd:report_generated',
    );
    expect(completeCall[3].progress).toBe(95);
  });

  it('calls LLM for executive summary with correct params', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'Summary.' });

    await reportNode(makeState());

    const callArgs = mockLLMClient.callLLM.mock.calls[0][0];
    expect(callArgs.callerName).toBe('legal-department:dd-exec-summary');
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.maxTokens).toBe(2000);
    expect(callArgs.context).toEqual(baseCtx);
  });
});
