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

  // ── Specialist registry dispatch (DD Financial Analysis — Phase 2) ──

  describe('specialist registry dispatch', () => {
    function stateWithSingleDoc(
      documentType: string,
      content = 'synthetic document text',
    ): DueDiligenceState {
      return {
        ...baseState,
        documents: [
          {
            documentId: 'doc-fin',
            name: 'fixture.txt',
            content,
            sizeBytes: content.length,
          },
        ],
        documentIndex: [
          {
            documentId: 'doc-fin',
            name: 'fixture.txt',
            documentType,
            parties: [],
            date: null,
            summary: 'fixture',
            riskScore: null,
            status: 'classified',
            specialistsAssigned: [],
            specialistsCompleted: [],
          },
        ],
        documentQueue: ['doc-fin'],
      } as unknown as DueDiligenceState;
    }

    it('routes a balance_sheet doc to financial-statements AND working-capital specialists', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      const result = await analyzeNode(stateWithSingleDoc('balance_sheet'));

      const doc = result.documentIndex?.find((d) => d.documentId === 'doc-fin');
      expect(doc?.specialistsAssigned).toEqual([
        'financial-statements',
        'working-capital',
      ]);
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('routes a cap_table doc to the cap-table specialist with registry-built prompt', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"medium","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      await analyzeNode(stateWithSingleDoc('cap_table'));

      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
      const call = mockLLMClient.callLLM.mock.calls[0][0];
      expect(call.callerName).toBe('legal-department:dd-cap-table');
      // Prompt should be driven by the registry config, NOT the legacy
      // "cap-table law specialist" template.
      expect(call.systemMessage).toContain('cap-table analyst');
      expect(call.systemMessage).not.toContain('cap-table law specialist');
      expect(call.systemMessage).toContain('liquidation preferences');
    });

    it('stamps findings from registry-backed specialists with category = financial', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'high',
          riskFlags: [
            {
              name: 'Customer concentration',
              severity: 'high',
              description: 'Top 3 customers = 67% of revenue',
            },
          ],
          keyFindings: [],
          summary: 'concentrated revenue base',
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('profit_and_loss'));

      const runningFindings = result.runningFindings ?? {};
      const financialSpecialist =
        runningFindings['financial-statements'] ??
        runningFindings['revenue-concentration'];
      expect(financialSpecialist).toBeDefined();
      // Every finding carries the financial category (not the specialist key).
      for (const finding of financialSpecialist!.keyFindings) {
        expect(finding.category).toBe('financial');
      }
    });

    it('legal docs continue to use the generic `<key> law specialist` template', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      await analyzeNode(stateWithSingleDoc('contract'));

      const systemMessages = mockLLMClient.callLLM.mock.calls.map(
        (c: any[]) => c[0].systemMessage as string,
      );
      // `contract` dispatches to ['contract', 'compliance']; both are legal.
      for (const msg of systemMessages) {
        expect(msg).toMatch(/law specialist conducting due diligence/);
      }
    });

    it('stamps findings from legal specialists with the specialist-key category (legacy behavior preserved)', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'medium',
          riskFlags: [
            {
              name: 'Broad IP clause',
              severity: 'medium',
              description: 'IP X',
            },
          ],
          keyFindings: [],
          summary: 'ok',
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('ip_assignment'));

      const ipFindings = result.runningFindings?.['ip']?.keyFindings ?? [];
      expect(ipFindings.length).toBeGreaterThan(0);
      for (const f of ipFindings) {
        expect(f.category).toBe('ip'); // not 'financial'
      }
    });

    it('drops financial findings that lack a numeric quote and emits an observability event', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'medium',
          riskFlags: [],
          keyFindings: [
            {
              finding: 'Revenue concentration is 67% of FY2025 top-3 customers',
              severity: 'high',
              recommendation: 'Diversify.',
            },
            {
              finding: 'The company appears generally well-managed',
              severity: 'low',
              recommendation: 'No action.',
            },
          ],
          summary: 'mixed',
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('profit_and_loss'));

      const runningFindings = result.runningFindings ?? {};
      const allFindings = Object.values(runningFindings).flatMap(
        (f) => f.keyFindings,
      );
      // The one with a numeric quote survives.
      expect(allFindings.some((f) => f.finding.includes('67%'))).toBe(true);
      // The ungrounded one is dropped.
      expect(
        allFindings.some((f) =>
          f.finding.includes('appears generally well-managed'),
        ),
      ).toBe(false);
      // An observability event fires for the drop.
      const drops = mockObservability.emitProgress.mock.calls.filter(
        (c: any[]) => c[3]?.step === 'dd:finding-dropped-no-numeric',
      );
      expect(drops.length).toBeGreaterThanOrEqual(1);
      expect(drops[0][3].specialistKey).toMatch(
        /financial-statements|revenue-concentration/,
      );
      expect(drops[0][3].droppedText).toContain(
        'appears generally well-managed',
      );
    });

    it('preserves all findings from legal specialists regardless of numeric content', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'medium',
          riskFlags: [],
          keyFindings: [
            {
              finding: 'The agreement has an ambiguous indemnification clause',
              severity: 'medium',
              recommendation: 'Clarify.',
            },
          ],
          summary: 'ok',
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('contract'));

      const contractFindings =
        result.runningFindings?.['contract']?.keyFindings ?? [];
      // Legal specialists do not require numeric quotes.
      expect(contractFindings.length).toBeGreaterThanOrEqual(1);
      expect(
        contractFindings.some((f) =>
          f.finding.includes('ambiguous indemnification'),
        ),
      ).toBe(true);
      // No drop event fired.
      const drops = mockObservability.emitProgress.mock.calls.filter(
        (c: any[]) => c[3]?.step === 'dd:finding-dropped-no-numeric',
      );
      expect(drops).toHaveLength(0);
    });

    it('appends financialFocusAreas to registry-backed prompts when set', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      const stateWithFocus = {
        ...stateWithSingleDoc('cap_table'),
        dealContext: {
          ...baseState.dealContext,
          financialFocusAreas: ['debt covenants', 'revenue concentration'],
        },
      } as unknown as DueDiligenceState;

      await analyzeNode(stateWithFocus);

      const systemMessage = mockLLMClient.callLLM.mock.calls[0][0]
        .systemMessage as string;
      expect(systemMessage).toContain('Financial focus areas:');
      expect(systemMessage).toContain('debt covenants');
      expect(systemMessage).toContain('revenue concentration');
    });

    it('omits the financial focus areas block when the list is absent or empty', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      await analyzeNode(stateWithSingleDoc('cap_table'));

      const systemMessage = mockLLMClient.callLLM.mock.calls[0][0]
        .systemMessage as string;
      expect(systemMessage).not.toContain('Financial focus areas:');
    });

    it('does NOT append financialFocusAreas to legal prompts even when set', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      const stateWithFocus = {
        ...stateWithSingleDoc('contract'),
        dealContext: {
          ...baseState.dealContext,
          financialFocusAreas: ['debt covenants'],
        },
      } as unknown as DueDiligenceState;

      await analyzeNode(stateWithFocus);

      const systemMessages = mockLLMClient.callLLM.mock.calls.map(
        (c: any[]) => c[0].systemMessage as string,
      );
      for (const msg of systemMessages) {
        expect(msg).not.toContain('Financial focus areas:');
      }
    });

    it('drops malformed tabular output (columns=null, rows=null) and emits an observability event', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'medium',
          riskFlags: [],
          keyFindings: [
            {
              finding: 'Current Ratio is 1.82x',
              severity: 'medium',
              recommendation: 'monitor',
            },
          ],
          summary: 'ok',
          tabular: { columns: null, rows: null },
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('balance_sheet'));

      // The specialist output should NOT carry a tabular field after
      // validation — state must be clean for downstream panels.
      const perDoc = result.perDocumentOutputs?.['doc-fin'];
      const specialistOutputs = perDoc?.specialistOutputs ?? {};
      for (const out of Object.values(specialistOutputs)) {
        if (out && typeof out === 'object') {
          expect('tabular' in (out as Record<string, unknown>)).toBe(false);
        }
      }
      // Observability should record the drop with its malformed shape.
      const drops = mockObservability.emitProgress.mock.calls.filter(
        (c: any[]) => c[3]?.step === 'dd:tabular-dropped-malformed',
      );
      expect(drops.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves a well-formed tabular block with string columns and array rows', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          overallRisk: 'high',
          riskFlags: [],
          keyFindings: [
            {
              finding: 'Series A liquidation pref is 1.5x',
              severity: 'high',
              recommendation: 'factor into deal',
            },
          ],
          summary: 'ok',
          tabular: {
            columns: ['Class', 'Outstanding', 'Liquidation Pref'],
            rows: [
              ['Common', '4,200,000', 'N/A'],
              ['Series A', '2,400,000', '1.5x'],
            ],
          },
        }),
      });

      const result = await analyzeNode(stateWithSingleDoc('cap_table'));

      const perDoc = result.perDocumentOutputs?.['doc-fin'];
      const capTableOutput = perDoc?.specialistOutputs?.['cap-table'];
      expect(capTableOutput).toBeDefined();
      const obj = capTableOutput as Record<string, unknown>;
      expect(obj.tabular).toBeDefined();
      const tab = obj.tabular as { columns: string[]; rows: unknown[][] };
      expect(tab.columns).toEqual(['Class', 'Outstanding', 'Liquidation Pref']);
      expect(tab.rows).toHaveLength(2);
      const drops = mockObservability.emitProgress.mock.calls.filter(
        (c: any[]) => c[3]?.step === 'dd:tabular-dropped-malformed',
      );
      expect(drops).toHaveLength(0);
    });

    it('no longer routes the legacy financial_statement type — normalizes to fallback', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"overallRisk":"low","riskFlags":[],"keyFindings":[],"summary":"ok"}',
      });

      const result = await analyzeNode(
        stateWithSingleDoc('financial_statement'),
      );

      const doc = result.documentIndex?.find((d) => d.documentId === 'doc-fin');
      // The map has no `financial_statement` key anymore; dispatch falls back
      // via partial match or default to the generic `contract` specialist.
      expect(doc?.specialistsAssigned).toBeDefined();
      expect(doc?.specialistsAssigned).not.toContain('financial-statements');
      expect(doc?.specialistsAssigned).not.toContain('corporate');
    });
  });
});
