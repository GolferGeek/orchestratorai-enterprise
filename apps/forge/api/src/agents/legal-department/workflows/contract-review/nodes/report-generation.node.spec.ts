import { LegalDepartmentState } from '../../../legal-department.state';
import type {
  ClauseSynthesis,
  RedlineOutput,
} from '../../../legal-department.types';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createContractReviewReportNode } from './report-generation.node';

const MOCK_REPORT = `# Contract Review — Risk Assessment

## Executive Summary
This contract contains 2 high-risk clauses requiring attention.

## Risk Overview
| Risk Level | Clauses | Percentage |
|------------|---------|------------|
| High       | 1       | 33%        |
| Medium     | 1       | 33%        |
| Acceptable | 1       | 33%        |

## Recommendations
1. **Renegotiate indemnification**: Limit to direct damages.`;

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({ text: MOCK_REPORT }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

function makeClause(
  id: string,
  risk: ClauseSynthesis['overallRisk'],
  suggestedRedline?: string,
): ClauseSynthesis {
  return {
    clauseId: id,
    originalText: `Original text of ${id}`,
    overallRisk: risk,
    annotations: [],
    suggestedRedline,
    summary: `Summary for ${id}`,
  };
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  const clauses = [
    makeClause('s1-c1', 'high', 'Limit indemnification to direct damages.'),
    makeClause('s1-c2', 'medium'),
    makeClause('s2-c1', 'acceptable'),
  ];

  const redlineOutput: RedlineOutput = {
    clauses,
    riskBreakdown: { critical: 0, high: 1, medium: 1, low: 0, acceptable: 1 },
    totalClauses: 3,
    flaggedClauses: 2,
    overallRisk: 'high',
  };

  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-report-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    userMessage: 'Review this contract',
    documents: [{ name: 'contract.pdf', content: 'Full contract text...' }],
    documentsMetadata: [
      {
        documentType: { type: 'contract', confidence: 0.95 },
        parties: {
          contractingParties: [
            { name: 'Acme Corp', role: 'buyer' },
            { name: 'Widget Inc', role: 'seller' },
          ],
        },
        dates: {
          primaryDate: {
            normalizedDate: '2025-01-15',
            originalFormat: 'January 15, 2025',
            type: 'effective',
          },
        },
      },
    ],
    messages: [],
    routingDecision: undefined,
    orchestration: {
      synthesis: {
        executiveSummary: 'Two flagged clauses.',
        keyFindings: [],
        overallRisk: { level: 'high', description: 'High risk', factors: [] },
        recommendations: [],
        confidence: 0.85,
      },
    },
    specialistOutputs: {},
    outputMode: 'contract-review',
    clauseMap: {
      entries: [
        { clauseId: 's1-c1', sectionPath: '1', text: 'text', definedTermsReferenced: [], sectionLevel: false, entryType: 'clause' as const },
        { clauseId: 's1-c2', sectionPath: '1.2', text: 'text', definedTermsReferenced: [], sectionLevel: false, entryType: 'clause' as const },
        { clauseId: 's2-c1', sectionPath: '2', text: 'text', definedTermsReferenced: [], sectionLevel: false, entryType: 'clause' as const },
      ],
      definedTerms: {},
      sectionCount: 2,
      clauseCount: 3,
    },
    redlineOutput,
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as unknown as LegalDepartmentState;
}

describe('ContractReviewReportGenerationNode', () => {
  let reportNode: ReturnType<typeof createContractReviewReportNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    reportNode = createContractReviewReportNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('generates a markdown risk assessment report', async () => {
    const state = createBaseState();
    const result = await reportNode(state);

    expect(result.response).toBeDefined();
    expect(result.response).toContain('Risk Assessment');
    expect(result.status).not.toBe('failed');
  });

  it('passes risk breakdown to the LLM prompt', async () => {
    const state = createBaseState();
    await reportNode(state);

    const callArgs = mockLLMClient.callLLM.mock.calls[0];
    const userMessageStr = callArgs?.[0]?.userMessage ?? '';

    expect(userMessageStr).toContain('High: 1');
    expect(userMessageStr).toContain('Flagged: 2');
  });

  it('includes flagged clauses with their risk levels in the prompt', async () => {
    const state = createBaseState();
    await reportNode(state);

    const callArgs = mockLLMClient.callLLM.mock.calls[0];
    const userMessageStr = callArgs?.[0]?.userMessage ?? '';

    expect(userMessageStr).toContain('s1-c1');
    expect(userMessageStr).toContain('HIGH');
  });

  it('includes document name and party information in the prompt', async () => {
    const state = createBaseState();
    await reportNode(state);

    const callArgs = mockLLMClient.callLLM.mock.calls[0];
    const userMessageStr = callArgs?.[0]?.userMessage ?? '';

    expect(userMessageStr).toContain('contract.pdf');
    expect(userMessageStr).toContain('Acme Corp');
    expect(userMessageStr).toContain('Widget Inc');
  });

  it('fails with clear error when redlineOutput is missing', async () => {
    const state = createBaseState({ redlineOutput: undefined });
    const result = await reportNode(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('No redline output');
  });

  it('trims the LLM response', async () => {
    mockLLMClient.callLLM.mockResolvedValueOnce({
      text: '  \n# Report\nContent\n  ',
    });

    const state = createBaseState();
    const result = await reportNode(state);

    expect(result.response).toBe('# Report\nContent');
  });

  it('emits progress events for report generation', async () => {
    const state = createBaseState();
    await reportNode(state);

    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
    const startCall = mockObservability.emitProgress.mock.calls[0];
    expect(startCall?.[2]).toContain('Generating risk assessment');
    const completeCall = mockObservability.emitProgress.mock.calls[1];
    expect(completeCall?.[2]).toContain('Complete');
  });

  it('emits failure event on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

    const state = createBaseState();
    const result = await reportNode(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('LLM unavailable');
    expect(mockObservability.emitFailed).toHaveBeenCalled();
  });

  it('includes suggested redline text for flagged clauses', async () => {
    const state = createBaseState();
    await reportNode(state);

    const callArgs = mockLLMClient.callLLM.mock.calls[0];
    const userMessageStr = callArgs?.[0]?.userMessage ?? '';

    expect(userMessageStr).toContain('Limit indemnification to direct damages');
  });

  it('handles contract with no flagged clauses', async () => {
    const cleanRedline: RedlineOutput = {
      clauses: [makeClause('s1-c1', 'acceptable')],
      riskBreakdown: { critical: 0, high: 0, medium: 0, low: 0, acceptable: 1 },
      totalClauses: 1,
      flaggedClauses: 0,
      overallRisk: 'acceptable',
    };

    const state = createBaseState({ redlineOutput: cleanRedline });
    const result = await reportNode(state);

    // Should still produce a report even with no issues
    expect(result.response).toBeDefined();
    expect(result.status).not.toBe('failed');
  });
});
