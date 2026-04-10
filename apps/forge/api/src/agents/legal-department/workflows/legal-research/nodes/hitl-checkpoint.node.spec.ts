import { ObservabilityService } from '../../../../shared/services/observability.service';

// Mock @langchain/langgraph interrupt — tests inject decisions directly
let interruptReturnValue: unknown;
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(() => interruptReturnValue),
}));

import { createResearchHitlNode } from './hitl-checkpoint.node';
import type {
  LegalResearchState,
  ResearchTreeNode,
  Citation,
} from '../legal-research.state';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeVerifiedCitation(): Citation {
  return {
    text: 'A verified passage.',
    source: 'Delaware LLC Act',
    documentId: 'doc-001',
    chunkId: 'chunk-001',
    verified: true,
    relevanceScore: 0.9,
  };
}

function makeUnverifiedCitation(): Citation {
  return {
    text: 'An unverified passage.',
    source: 'External source',
    documentId: '',
    chunkId: '',
    verified: false,
    relevanceScore: 0.5,
  };
}

function makeNode(
  id: string,
  parentId: string | null,
  question: string,
  depth: number,
  status: ResearchTreeNode['status'] = 'answered',
  citations?: Citation[],
): ResearchTreeNode {
  return { id, parentId, question, depth, status, citations, childIds: [] };
}

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
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
    messages: [],
    userMessage: 'Can a single-member LLC elect S-corp status in Delaware?',
    jurisdiction: 'Delaware',
    practiceArea: 'Business Law',
    keyFacts: '',
    researchConfig: {
      maxDepth: 3,
      maxSubQuestionsPerLevel: 3,
      tokenBudget: null,
      timeBudgetMs: null,
    },
    researchTree: [
      makeNode('root-001', null, 'Root question', 0, 'answered', [
        makeVerifiedCitation(),
      ]),
      makeNode('child-001', 'root-001', 'Sub-question 1', 1, 'answered', [
        makeVerifiedCitation(),
      ]),
      makeNode('child-002', 'root-001', 'Sub-question 2', 1, 'answered', [
        makeUnverifiedCitation(),
      ]),
    ],
    currentDepth: 1,
    pendingQuestions: [],
    currentResearchTarget: undefined,
    tokenUsage: { input: 500, output: 200 },
    startedAt: Date.now(),
    memo: '# Draft Memo\n\nContent here...',
    report: undefined,
    status: 'processing',
    error: undefined,
    completedAt: undefined,
    hitlAction: undefined,
    ...overrides,
  } as unknown as LegalResearchState;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('LegalResearchHitlCheckpointNode', () => {
  let hitlNode: ReturnType<typeof createResearchHitlNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    hitlNode = createResearchHitlNode(mockObservability);
  });

  describe('approve decision', () => {
    it('returns empty state update on approve', async () => {
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result).toEqual({});
    });

    it('leaves hitlAction undefined on approve', async () => {
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.hitlAction).toBeUndefined();
    });
  });

  describe('deepen decision', () => {
    it('sets hitlAction.type to deepen', async () => {
      interruptReturnValue = {
        decision: 'deepen',
        targetNodeIds: ['child-001'],
        guidance: 'Focus on case law',
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.hitlAction?.type).toBe('deepen');
    });

    it('passes targetNodeIds through to hitlAction', async () => {
      interruptReturnValue = {
        decision: 'deepen',
        targetNodeIds: ['child-001', 'child-002'],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      if (result.hitlAction?.type === 'deepen') {
        expect(result.hitlAction.targetNodeIds).toEqual([
          'child-001',
          'child-002',
        ]);
      } else {
        fail('Expected hitlAction.type to be deepen');
      }
    });

    it('passes optional guidance through to hitlAction', async () => {
      interruptReturnValue = {
        decision: 'deepen',
        targetNodeIds: ['child-001'],
        guidance: 'Focus specifically on case law from 2020-2025',
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      if (result.hitlAction?.type === 'deepen') {
        expect(result.hitlAction.guidance).toBe(
          'Focus specifically on case law from 2020-2025',
        );
      }
    });

    it('works without guidance (undefined)', async () => {
      interruptReturnValue = {
        decision: 'deepen',
        targetNodeIds: ['child-001'],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      if (result.hitlAction?.type === 'deepen') {
        expect(result.hitlAction.guidance).toBeUndefined();
      }
    });
  });

  describe('redirect decision', () => {
    it('sets hitlAction.type to redirect', async () => {
      interruptReturnValue = {
        decision: 'redirect',
        targetNodeId: 'child-001',
        replacementQuestions: [
          'What does statute X say?',
          'What does regulation Y say?',
        ],
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result.hitlAction?.type).toBe('redirect');
    });

    it('passes targetNodeId and replacementQuestions through', async () => {
      const replacementQuestions = [
        'What does statute X say?',
        'What does regulation Y say?',
      ];
      interruptReturnValue = {
        decision: 'redirect',
        targetNodeId: 'child-001',
        replacementQuestions,
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      if (result.hitlAction?.type === 'redirect') {
        expect(result.hitlAction.targetNodeId).toBe('child-001');
        expect(result.hitlAction.replacementQuestions).toEqual(
          replacementQuestions,
        );
      } else {
        fail('Expected hitlAction.type to be redirect');
      }
    });
  });

  describe('reject / modify decision (fallback to approve)', () => {
    it('treats reject decision as approve (returns empty update)', async () => {
      interruptReturnValue = {
        decision: 'reject',
        feedback: 'The research is incomplete.',
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result).toEqual({});
    });

    it('treats modify decision as approve (returns empty update)', async () => {
      interruptReturnValue = {
        decision: 'modify',
        editedOutputs: { memo: 'Edited memo content' },
      };

      const state = createBaseState();
      const result = await hitlNode(state);

      expect(result).toEqual({});
    });
  });

  describe('interrupt payload', () => {
    it('passes memo to the interrupt payload', async () => {
      const { interrupt } = jest.requireMock('@langchain/langgraph');
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const payload = interrupt.mock.calls[0]![0];
      expect(payload.memo).toBe('# Draft Memo\n\nContent here...');
    });

    it('passes researchTree to the interrupt payload', async () => {
      const { interrupt } = jest.requireMock('@langchain/langgraph');
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const payload = interrupt.mock.calls[0]![0];
      expect(payload.researchTree).toHaveLength(3);
    });

    it('includes only unverified citations in the interrupt payload', async () => {
      const { interrupt } = jest.requireMock('@langchain/langgraph');
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const payload = interrupt.mock.calls[0]![0];
      // child-002 has one unverified citation; root and child-001 have verified ones
      expect(payload.unverifiedCitations).toHaveLength(1);
      expect(payload.unverifiedCitations[0].verified).toBe(false);
    });

    it('includes tokenUsage in the interrupt payload', async () => {
      const { interrupt } = jest.requireMock('@langchain/langgraph');
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const payload = interrupt.mock.calls[0]![0];
      expect(payload.tokenUsage).toEqual({ input: 500, output: 200 });
    });

    it('includes jurisdiction and practiceArea in the interrupt payload', async () => {
      const { interrupt } = jest.requireMock('@langchain/langgraph');
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const payload = interrupt.mock.calls[0]![0];
      expect(payload.jurisdiction).toBe('Delaware');
      expect(payload.practiceArea).toBe('Business Law');
    });
  });

  describe('observability', () => {
    it('emits two progress events (HITL start and decision received)', async () => {
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
      expect(mockObservability.emitProgress.mock.calls[0]![2]).toContain(
        'awaiting attorney review',
      );
      expect(mockObservability.emitProgress.mock.calls[1]![2]).toContain(
        'decision received',
      );
    });

    it('reports unverified citation count in start progress event metadata', async () => {
      interruptReturnValue = { decision: 'approve' };

      const state = createBaseState();
      await hitlNode(state);

      const startMeta = mockObservability.emitProgress.mock
        .calls[0]![3] as Record<string, unknown>;
      expect(startMeta.unverifiedCitationCount).toBe(1);
    });

    it('reports the decision string in completion progress event metadata', async () => {
      interruptReturnValue = {
        decision: 'deepen',
        targetNodeIds: ['child-001'],
      };

      const state = createBaseState();
      await hitlNode(state);

      const completeMeta = mockObservability.emitProgress.mock
        .calls[1]![3] as Record<string, unknown>;
      expect(completeMeta.decision).toBe('deepen');
    });
  });
});
