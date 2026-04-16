import { LegalDepartmentState } from '../../../legal-department.state';
import type {
  ClauseAnnotation,
  ClauseMap,
  RedlineOutput,
} from '../../../legal-department.types';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createContractReviewSynthesisNode } from './synthesis.node';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: JSON.stringify({
      summary: 'Merged finding from multiple specialists.',
      suggestedRedline:
        'The Receiving Party shall hold confidential information in strict confidence for a period of three (3) years.',
    }),
  }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── Helpers ─────────────────────────────────────────────────────────────

function makeAnnotation(
  overrides: Partial<ClauseAnnotation> = {},
): ClauseAnnotation {
  return {
    clauseId: 's1-c1',
    riskLevel: 'medium',
    category: 'general',
    finding: 'A finding.',
    reasoning: 'Because.',
    ...overrides,
  };
}

function makeClauseMap(entries: ClauseMap['entries']): ClauseMap {
  return {
    entries,
    definedTerms: {},
    sectionCount: entries.filter((e) => e.entryType === 'section').length,
    clauseCount: entries.filter((e) => e.entryType === 'clause').length,
  };
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-synth-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    userMessage: 'Review this contract',
    documents: [{ name: 'contract.pdf', content: 'Contract text...' }],
    documentsMetadata: [],
    messages: [],
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    outputMode: 'contract-review',
    clauseMap: makeClauseMap([
      {
        clauseId: 's1-c1',
        sectionPath: '1',
        text: 'Confidentiality clause text',
        definedTermsReferenced: [],
        sectionLevel: false,
        entryType: 'clause',
      },
      {
        clauseId: 's1-c2',
        sectionPath: '1.2',
        text: 'Indemnification clause text',
        definedTermsReferenced: [],
        sectionLevel: false,
        entryType: 'clause',
      },
      {
        clauseId: 's2-c1',
        sectionPath: '2',
        text: 'Termination clause text',
        definedTermsReferenced: [],
        sectionLevel: false,
        entryType: 'clause',
      },
    ]),
    redlineOutput: undefined,
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as unknown as LegalDepartmentState;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ContractReviewSynthesisNode', () => {
  let synthesisNode: ReturnType<typeof createContractReviewSynthesisNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    synthesisNode = createContractReviewSynthesisNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('produces a RedlineOutput with one ClauseSynthesis per clause map entry', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({ clauseId: 's1-c1', riskLevel: 'high' }),
        ] as unknown as undefined,
        compliance: [
          makeAnnotation({ clauseId: 's2-c1', riskLevel: 'low' }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);

    expect(result.redlineOutput).toBeDefined();
    const redline = result.redlineOutput as RedlineOutput;
    // One synthesis entry per clause map entry
    expect(redline.clauses).toHaveLength(3);
    expect(redline.totalClauses).toBe(3);
  });

  it('computes overallRisk as the highest risk across annotations for a clause', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({
            clauseId: 's1-c1',
            riskLevel: 'medium',
            category: 'terms',
          }),
        ] as unknown as undefined,
        compliance: [
          makeAnnotation({
            clauseId: 's1-c1',
            riskLevel: 'critical',
            category: 'regulatory',
          }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;
    const s1c1 = redline.clauses.find((c) => c.clauseId === 's1-c1');

    expect(s1c1?.overallRisk).toBe('critical');
  });

  it('marks clauses with no annotations as acceptable', async () => {
    const state = createBaseState({
      specialistOutputs: {},
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;

    for (const clause of redline.clauses) {
      expect(clause.overallRisk).toBe('acceptable');
      expect(clause.summary).toContain('No issues');
    }
  });

  it('uses specialist finding directly when only one annotation exists', async () => {
    const finding = 'Broad indemnification exposes unlimited liability.';
    const suggested = 'Limit indemnification to direct damages only.';

    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({
            clauseId: 's1-c2',
            riskLevel: 'high',
            finding,
            suggestedLanguage: suggested,
          }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;
    const s1c2 = redline.clauses.find((c) => c.clauseId === 's1-c2');

    expect(s1c2?.summary).toBe(finding);
    expect(s1c2?.suggestedRedline).toBe(suggested);
    // No LLM merge needed — should not call the LLM
    expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
  });

  it('calls LLM to merge when multiple specialists annotate the same clause', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({
            clauseId: 's1-c1',
            riskLevel: 'high',
            finding: 'Contract terms issue.',
          }),
        ] as unknown as undefined,
        compliance: [
          makeAnnotation({
            clauseId: 's1-c1',
            riskLevel: 'medium',
            finding: 'Regulatory concern.',
          }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;
    const s1c1 = redline.clauses.find((c) => c.clauseId === 's1-c1');

    // LLM merge should have been called
    expect(mockLLMClient.callLLM).toHaveBeenCalled();
    expect(s1c1?.summary).toBe('Merged finding from multiple specialists.');
  });

  it('computes risk breakdown totals correctly', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({ clauseId: 's1-c1', riskLevel: 'critical' }),
          makeAnnotation({ clauseId: 's1-c2', riskLevel: 'high' }),
          makeAnnotation({ clauseId: 's2-c1', riskLevel: 'low' }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;

    expect(redline.riskBreakdown.critical).toBe(1);
    expect(redline.riskBreakdown.high).toBe(1);
    expect(redline.riskBreakdown.low).toBe(1);
    expect(redline.riskBreakdown.medium).toBe(0);
    expect(redline.riskBreakdown.acceptable).toBe(0);
  });

  it('sets document-level overallRisk to the highest clause risk', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({ clauseId: 's1-c1', riskLevel: 'low' }),
          makeAnnotation({ clauseId: 's1-c2', riskLevel: 'high' }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;

    expect(redline.overallRisk).toBe('high');
  });

  it('counts flaggedClauses as those with risk above acceptable', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({ clauseId: 's1-c1', riskLevel: 'high' }),
          makeAnnotation({ clauseId: 's1-c2', riskLevel: 'medium' }),
          // s2-c1 has no annotations → acceptable
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;

    expect(redline.flaggedClauses).toBe(2);
    expect(redline.totalClauses).toBe(3);
  });

  it('populates orchestration.synthesis with key findings from high/critical annotations', async () => {
    const state = createBaseState({
      specialistOutputs: {
        contract: [
          makeAnnotation({
            clauseId: 's1-c1',
            riskLevel: 'critical',
            category: 'indemnification',
            finding: 'Unlimited liability exposure.',
          }),
          makeAnnotation({
            clauseId: 's1-c2',
            riskLevel: 'low',
            category: 'terms',
            finding: 'Standard term.',
          }),
        ] as unknown as undefined,
      },
    });

    const result = await synthesisNode(state);
    const synthesis = result.orchestration?.synthesis;

    expect(synthesis).toBeDefined();
    expect(synthesis?.keyFindings).toHaveLength(1);
    expect(synthesis?.keyFindings[0]?.specialist).toBe('indemnification');
    expect(synthesis?.keyFindings[0]?.severity).toBe('critical');
  });

  it('fails with clear error when clauseMap is missing', async () => {
    const state = createBaseState({ clauseMap: undefined });

    const result = await synthesisNode(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('No clause map');
  });

  it('preserves originalText from the clause map entry', async () => {
    const state = createBaseState({
      specialistOutputs: {},
    });

    const result = await synthesisNode(state);
    const redline = result.redlineOutput as RedlineOutput;

    expect(redline.clauses[0]?.originalText).toBe(
      'Confidentiality clause text',
    );
    expect(redline.clauses[1]?.originalText).toBe(
      'Indemnification clause text',
    );
    expect(redline.clauses[2]?.originalText).toBe('Termination clause text');
  });

  it('risk hierarchy: critical > high > medium > low > acceptable', async () => {
    // Test each transition in the risk hierarchy
    const pairs: Array<
      [
        ClauseAnnotation['riskLevel'],
        ClauseAnnotation['riskLevel'],
        ClauseAnnotation['riskLevel'],
      ]
    > = [
      ['high', 'critical', 'critical'],
      ['low', 'high', 'high'],
      ['acceptable', 'medium', 'medium'],
      ['acceptable', 'low', 'low'],
    ];

    for (const [r1, r2, expected] of pairs) {
      jest.clearAllMocks();
      const node = createContractReviewSynthesisNode(
        mockLLMClient,
        mockObservability,
      );

      const singleClauseMap = makeClauseMap([
        {
          clauseId: 's1-c1',
          sectionPath: '1',
          text: 'Test clause',
          definedTermsReferenced: [],
          sectionLevel: false,
          entryType: 'clause',
        },
      ]);

      const state = createBaseState({
        clauseMap: singleClauseMap,
        specialistOutputs: {
          contract: [
            makeAnnotation({ clauseId: 's1-c1', riskLevel: r1 }),
          ] as unknown as undefined,
          compliance: [
            makeAnnotation({ clauseId: 's1-c1', riskLevel: r2 }),
          ] as unknown as undefined,
        },
      });

      const result = await node(state);
      const redline = result.redlineOutput as RedlineOutput;
      expect(redline.clauses[0]?.overallRisk).toBe(expected);
    }
  });
});
