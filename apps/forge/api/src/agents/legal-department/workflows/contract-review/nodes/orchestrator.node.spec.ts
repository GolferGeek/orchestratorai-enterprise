import { createContractReviewOrchestratorNode } from './orchestrator.node';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { LegalDepartmentState } from '../../../legal-department.state';
import type { ContractReviewSpecialistMap } from './specialists';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-cr-orch',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    userMessage: 'Review contract',
    documents: [{ name: 'contract.pdf', content: 'text' }],
    documentsMetadata: [],
    messages: [],
    routingDecision: {
      specialist: 'contract',
      specialists: ['contract', 'compliance'],
      multiAgent: true,
      confidence: 0.9,
      reasoning: 'test',
      categories: ['contract'],
    },
    orchestration: {},
    specialistOutputs: {},
    outputMode: 'contract-review',
    clauseMap: {
      entries: [
        {
          clauseId: 's1-c1',
          sectionPath: '1',
          text: 'Clause text',
          definedTermsReferenced: [],
          sectionLevel: false,
          entryType: 'clause',
        },
      ],
      definedTerms: {},
      sectionCount: 1,
      clauseCount: 1,
    },
    redlineOutput: undefined,
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as unknown as LegalDepartmentState;
}

describe('ContractReviewOrchestratorNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes specialists and merges outputs', async () => {
    const specialists: ContractReviewSpecialistMap = {
      contract: jest.fn().mockResolvedValue({
        specialistOutputs: {
          contract: [
            {
              clauseId: 's1-c1',
              riskLevel: 'high',
              category: 'terms',
              finding: 'Issue',
              reasoning: 'Why',
            },
          ],
        },
      }),
      compliance: jest.fn().mockResolvedValue({
        specialistOutputs: { compliance: [] },
      }),
    };

    const node = createContractReviewOrchestratorNode(
      specialists,
      mockObservability,
    );
    const state = createBaseState();
    const result = await node(state);

    expect(specialists.contract).toHaveBeenCalledTimes(1);
    expect(specialists.compliance).toHaveBeenCalledTimes(1);
    expect(result.orchestration?.completed).toEqual(['contract', 'compliance']);
  });

  it('strips annotations with invalid clauseIds', async () => {
    const specialists: ContractReviewSpecialistMap = {
      contract: jest.fn().mockResolvedValue({
        specialistOutputs: {
          contract: [
            {
              clauseId: 's1-c1',
              riskLevel: 'high',
              category: 'terms',
              finding: 'Valid',
              reasoning: 'OK',
            },
            {
              clauseId: 'INVALID',
              riskLevel: 'low',
              category: 'terms',
              finding: 'Invalid ref',
              reasoning: 'Bad',
            },
          ],
        },
      }),
    };

    const node = createContractReviewOrchestratorNode(
      specialists,
      mockObservability,
    );
    const state = createBaseState({
      routingDecision: {
        specialist: 'contract',
        specialists: ['contract'],
        multiAgent: true,
        confidence: 0.9,
        reasoning: 'test',
        categories: ['contract'],
      },
    });
    const result = await node(state);

    const annotations = (result.specialistOutputs as Record<string, unknown>)
      .contract as unknown[];
    expect(annotations).toHaveLength(1);
    expect((annotations[0] as { clauseId: string }).clauseId).toBe('s1-c1');
  });

  it('handles specialist failure gracefully', async () => {
    const specialists: ContractReviewSpecialistMap = {
      contract: jest.fn().mockRejectedValue(new Error('LLM down')),
      compliance: jest.fn().mockResolvedValue({
        specialistOutputs: { compliance: [] },
      }),
    };

    const node = createContractReviewOrchestratorNode(
      specialists,
      mockObservability,
    );
    const state = createBaseState();
    const result = await node(state);

    expect(result.orchestration?.completed).toEqual(['compliance']);
    expect(result.orchestration?.failed).toEqual(['contract']);
  });

  it('partial re-run only analyzes rejected clauses', async () => {
    const specialists: ContractReviewSpecialistMap = {
      contract: jest.fn().mockResolvedValue({
        specialistOutputs: {
          contract: [
            {
              clauseId: 's2-c1',
              riskLevel: 'medium',
              category: 'terms',
              finding: 'Re-analyzed',
              reasoning: 'Updated',
            },
          ],
        },
      }),
    };

    const node = createContractReviewOrchestratorNode(
      specialists,
      mockObservability,
    );

    const state = createBaseState({
      routingDecision: {
        specialist: 'contract',
        specialists: ['contract'],
        multiAgent: true,
        confidence: 0.9,
        reasoning: 'test',
        categories: ['contract'],
      },
      clauseMap: {
        entries: [
          {
            clauseId: 's1-c1',
            sectionPath: '1',
            text: 'Accepted clause',
            definedTermsReferenced: [],
            sectionLevel: false,
            entryType: 'clause',
          },
          {
            clauseId: 's2-c1',
            sectionPath: '2',
            text: 'Rejected clause',
            definedTermsReferenced: [],
            sectionLevel: false,
            entryType: 'clause',
          },
        ],
        definedTerms: {},
        sectionCount: 2,
        clauseCount: 2,
      },
      orchestration: {
        hitlDecision: {
          decision: 'reject',
          feedback: 'Clauses rejected: s2-c1',
        },
      },
      specialistOutputs: {
        contract: [
          {
            clauseId: 's1-c1',
            riskLevel: 'low',
            category: 'terms',
            finding: 'Original accepted',
            reasoning: 'OK',
          },
          {
            clauseId: 's2-c1',
            riskLevel: 'high',
            category: 'terms',
            finding: 'Original rejected',
            reasoning: 'Bad',
          },
        ] as unknown as undefined,
      },
    });

    const result = await node(state);

    // The specialist should receive a filtered clause map
    const callState = (specialists.contract as jest.Mock).mock.calls[0][0];
    expect(callState.clauseMap.entries).toHaveLength(1);
    expect(callState.clauseMap.entries[0].clauseId).toBe('s2-c1');

    // Result should preserve s1-c1 (accepted) and replace s2-c1 (re-analyzed)
    const annotations = (result.specialistOutputs as Record<string, unknown>)
      .contract as Array<{ clauseId: string; finding: string }>;
    expect(annotations).toHaveLength(2);
    const s1 = annotations.find((a) => a.clauseId === 's1-c1');
    const s2 = annotations.find((a) => a.clauseId === 's2-c1');
    expect(s1?.finding).toBe('Original accepted');
    expect(s2?.finding).toBe('Re-analyzed');
  });
});
