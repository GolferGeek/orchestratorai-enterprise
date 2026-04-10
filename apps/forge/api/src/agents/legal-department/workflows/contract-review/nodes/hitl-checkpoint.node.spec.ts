import { LegalDepartmentState } from '../../../legal-department.state';
import type {
  ClauseSynthesis,
  RedlineOutput,
} from '../../../legal-department.types';
import { ObservabilityService } from '../../../../shared/services/observability.service';

// Mock @langchain/langgraph interrupt — tests inject decisions directly
let interruptReturnValue: unknown;
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(() => interruptReturnValue),
}));

import { createContractReviewHitlNode } from './hitl-checkpoint.node';

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

function makeRedlineOutput(clauses: ClauseSynthesis[]): RedlineOutput {
  const breakdown = { critical: 0, high: 0, medium: 0, low: 0, acceptable: 0 };
  for (const c of clauses) breakdown[c.overallRisk]++;
  return {
    clauses,
    riskBreakdown: breakdown,
    totalClauses: clauses.length,
    flaggedClauses: clauses.filter((c) => c.overallRisk !== 'acceptable').length,
    overallRisk: clauses.some((c) => c.overallRisk === 'critical')
      ? 'critical'
      : clauses.some((c) => c.overallRisk === 'high')
        ? 'high'
        : 'medium',
  };
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  const clauses = [
    makeClause('s1-c1', 'high', 'Suggested replacement for s1-c1'),
    makeClause('s1-c2', 'medium', 'Suggested replacement for s1-c2'),
    makeClause('s2-c1', 'acceptable'),
  ];

  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-hitl-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    userMessage: 'Review contract',
    documents: [{ name: 'contract.pdf', content: 'text' }],
    documentsMetadata: [],
    messages: [],
    routingDecision: undefined,
    orchestration: {},
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
    redlineOutput: makeRedlineOutput(clauses),
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as unknown as LegalDepartmentState;
}

describe('ContractReviewHitlCheckpointNode', () => {
  let hitlNode: ReturnType<typeof createContractReviewHitlNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    hitlNode = createContractReviewHitlNode(mockObservability);
  });

  describe('per-clause decisions (ClauseReviewPayload)', () => {
    it('accepts all clauses — sets hitlApproved=true, preserves suggestedRedline', async () => {
      interruptReturnValue = {
        clauseDecisions: [
          { clauseId: 's1-c1', decision: 'accept' },
          { clauseId: 's1-c2', decision: 'accept' },
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.orchestration?.hitlApproved).toBe(true);
      expect(result.orchestration?.hitlDecision?.decision).toBe('approve');
      // suggestedRedline preserved on accept
      const s1c1 = result.redlineOutput?.clauses.find(
        (c) => c.clauseId === 's1-c1',
      );
      expect(s1c1?.suggestedRedline).toBe('Suggested replacement for s1-c1');
    });

    it('rejects a clause — removes suggestedRedline, sets hitlApproved=false', async () => {
      interruptReturnValue = {
        clauseDecisions: [
          { clauseId: 's1-c1', decision: 'reject' },
          { clauseId: 's1-c2', decision: 'accept' },
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.orchestration?.hitlApproved).toBe(false);
      expect(result.orchestration?.hitlDecision?.decision).toBe('reject');
      // Rejected clause should have suggestedRedline cleared
      const s1c1 = result.redlineOutput?.clauses.find(
        (c) => c.clauseId === 's1-c1',
      );
      expect(s1c1?.suggestedRedline).toBeUndefined();
      // Accepted clause keeps its suggestion
      const s1c2 = result.redlineOutput?.clauses.find(
        (c) => c.clauseId === 's1-c2',
      );
      expect(s1c2?.suggestedRedline).toBe('Suggested replacement for s1-c2');
    });

    it('modifies a clause — replaces suggestedRedline with reviewer text', async () => {
      const reviewerLanguage =
        'The Receiving Party shall maintain confidentiality for five (5) years.';

      interruptReturnValue = {
        clauseDecisions: [
          {
            clauseId: 's1-c1',
            decision: 'modify',
            modifiedLanguage: reviewerLanguage,
          },
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      const s1c1 = result.redlineOutput?.clauses.find(
        (c) => c.clauseId === 's1-c1',
      );
      expect(s1c1?.suggestedRedline).toBe(reviewerLanguage);
      // No rejections → approved
      expect(result.orchestration?.hitlApproved).toBe(true);
    });

    it('mixed decisions — reject + accept + modify', async () => {
      interruptReturnValue = {
        clauseDecisions: [
          { clauseId: 's1-c1', decision: 'reject' },
          { clauseId: 's1-c2', decision: 'accept' },
          {
            clauseId: 's2-c1',
            decision: 'modify',
            modifiedLanguage: 'Modified text.',
          },
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      // Has rejections → not approved
      expect(result.orchestration?.hitlApproved).toBe(false);
      // Feedback lists rejected clauseIds
      const decision = result.orchestration?.hitlDecision;
      expect(decision?.decision).toBe('reject');
      if (decision?.decision === 'reject') {
        expect(decision.feedback).toContain('s1-c1');
      }
    });

    it('records hitlApprovedAt timestamp', async () => {
      interruptReturnValue = {
        clauseDecisions: [{ clauseId: 's1-c1', decision: 'accept' }],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.orchestration?.hitlApprovedAt).toBeDefined();
      // Should be a valid ISO date string
      expect(
        new Date(result.orchestration!.hitlApprovedAt!).getTime(),
      ).not.toBeNaN();
    });

    it('ignores decisions for clauseIds not in the redlineOutput', async () => {
      interruptReturnValue = {
        clauseDecisions: [
          { clauseId: 'nonexistent-clause', decision: 'reject' },
          { clauseId: 's1-c1', decision: 'accept' },
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      // The nonexistent clauseId should not cause an error
      expect(result.orchestration).toBeDefined();
      // s1-c1 still accepted
      const s1c1 = result.redlineOutput?.clauses.find(
        (c) => c.clauseId === 's1-c1',
      );
      expect(s1c1?.suggestedRedline).toBe('Suggested replacement for s1-c1');
    });
  });

  describe('standard ReviewDecisionPayload', () => {
    it('approve decision sets hitlApproved=true', async () => {
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.orchestration?.hitlApproved).toBe(true);
      expect(result.orchestration?.hitlDecision?.decision).toBe('approve');
    });

    it('reject decision sets hitlApproved=false', async () => {
      interruptReturnValue = {
        decision: 'reject',
        feedback: 'Indemnification clause is still too broad.',
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.orchestration?.hitlApproved).toBe(false);
    });

    it('modify decision merges editedOutputs into specialistOutputs', async () => {
      const editedOutputs = {
        contract: [{ clauseId: 's1-c1', finding: 'Edited finding' }],
      };

      interruptReturnValue = {
        decision: 'modify',
        editedOutputs,
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.specialistOutputs).toBeDefined();
    });
  });

  describe('observability', () => {
    it('emits progress events for HITL start and completion', async () => {
      interruptReturnValue = {
        clauseDecisions: [{ clauseId: 's1-c1', decision: 'accept' }],
      };

      const state = createBaseState();
      await hitlNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
      const startCall = mockObservability.emitProgress.mock.calls[0];
      expect(startCall?.[2]).toContain('awaiting per-clause review');
      const completeCall = mockObservability.emitProgress.mock.calls[1];
      expect(completeCall?.[2]).toContain('decision received');
    });
  });
});
