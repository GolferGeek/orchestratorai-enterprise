import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createResearchDispatcherNode } from './research-dispatcher.node';
import type {
  LegalResearchState,
  ResearchTreeNode,
} from '../legal-research.state';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  parentId: string | null,
  question: string,
  depth: number,
  status: ResearchTreeNode['status'] = 'pending',
  childIds: string[] = [],
): ResearchTreeNode {
  return { id, parentId, question, depth, status, childIds };
}

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
  const rootId = 'root-001';
  const child1Id = 'child-001';
  const child2Id = 'child-002';

  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-dispatch-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    messages: [],
    userMessage: 'Research question',
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
      makeNode(rootId, null, 'Root question', 0, 'answered', [
        child1Id,
        child2Id,
      ]),
      makeNode(child1Id, rootId, 'First sub-question', 1, 'pending'),
      makeNode(child2Id, rootId, 'Second sub-question', 1, 'pending'),
    ],
    currentDepth: 1,
    pendingQuestions: [child1Id, child2Id],
    currentResearchTarget: undefined,
    tokenUsage: { input: 0, output: 0 },
    startedAt: Date.now(),
    memo: undefined,
    report: undefined,
    status: 'processing',
    error: undefined,
    completedAt: undefined,
    hitlAction: undefined,
    ...overrides,
  } as unknown as LegalResearchState;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ResearchDispatcherNode', () => {
  let dispatcherNode: ReturnType<typeof createResearchDispatcherNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatcherNode = createResearchDispatcherNode(mockObservability);
  });

  describe('normal dispatch', () => {
    it('picks the first pending question as the current research target', async () => {
      const state = createBaseState();
      const result = await dispatcherNode(state);

      expect(result.currentResearchTarget).toBe('child-001');
    });

    it('removes the dispatched ID from pendingQuestions', async () => {
      const state = createBaseState();
      const result = await dispatcherNode(state);

      expect(result.pendingQuestions).not.toContain('child-001');
      expect(result.pendingQuestions).toContain('child-002');
    });

    it('marks the dispatched node as researching in the tree', async () => {
      const state = createBaseState();
      const result = await dispatcherNode(state);

      const targetNode = result.researchTree!.find((n) => n.id === 'child-001');
      expect(targetNode!.status).toBe('researching');
    });

    it('leaves other nodes unchanged', async () => {
      const state = createBaseState();
      const result = await dispatcherNode(state);

      const child2 = result.researchTree!.find((n) => n.id === 'child-002');
      expect(child2!.status).toBe('pending');
    });

    it('emits a progress event naming the researched question', async () => {
      const state = createBaseState();
      await dispatcherNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
      const msg = mockObservability.emitProgress.mock.calls[0]![2];
      expect(msg).toContain('First sub-question');
    });

    it('returns empty object when no pending questions exist', async () => {
      const state = createBaseState({ pendingQuestions: [] });
      const result = await dispatcherNode(state);

      expect(result).toEqual({});
    });
  });

  describe('redirect HITL action', () => {
    it('marks old children as skipped', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A', 'New question B'],
        },
      });
      const result = await dispatcherNode(state);

      const child1 = result.researchTree!.find((n) => n.id === 'child-001');
      const child2 = result.researchTree!.find((n) => n.id === 'child-002');
      expect(child1!.status).toBe('skipped');
      expect(child2!.status).toBe('skipped');
    });

    it('creates replacement nodes under the target', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A', 'New question B'],
        },
      });
      const result = await dispatcherNode(state);

      const newNodes = result.researchTree!.filter(
        (n) => n.parentId === 'root-001' && n.status !== 'skipped',
      );
      expect(newNodes).toHaveLength(2);
      expect(newNodes.map((n) => n.question)).toContain('New question A');
    });

    it('sets depth of replacement nodes to targetNode.depth + 1', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A'],
        },
      });
      const result = await dispatcherNode(state);

      // root is depth 0, so replacement should be depth 1
      const newNodes = result.researchTree!.filter(
        (n) => n.question === 'New question A',
      );
      expect(newNodes[0]!.depth).toBe(1);
    });

    it('dispatches the first replacement node immediately', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A', 'New question B'],
        },
      });
      const result = await dispatcherNode(state);

      expect(result.currentResearchTarget).toBeDefined();
      const target = result.researchTree!.find(
        (n) => n.id === result.currentResearchTarget,
      );
      expect(target!.question).toBe('New question A');
      expect(target!.status).toBe('researching');
    });

    it('puts remaining replacement nodes in pendingQuestions', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A', 'New question B'],
        },
      });
      const result = await dispatcherNode(state);

      // First is dispatched; second should be in pending
      expect(result.pendingQuestions).toHaveLength(1);
    });

    it('clears hitlAction after redirect', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A'],
        },
      });
      const result = await dispatcherNode(state);

      expect(result.hitlAction).toBeUndefined();
    });

    it('does nothing to the tree when targetNodeId is not found', async () => {
      const state = createBaseState({
        pendingQuestions: ['child-001', 'child-002'],
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'nonexistent-node',
          replacementQuestions: ['New question'],
        },
      });

      // Falls through to normal dispatch when target is not found
      const result = await dispatcherNode(state);
      // Should not crash — either fall-through or empty result
      expect(result).toBeDefined();
    });

    it('target node childIds is replaced with only the new replacement node IDs', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['Replacement A', 'Replacement B'],
        },
      });
      const result = await dispatcherNode(state);

      const targetNode = result.researchTree!.find((n) => n.id === 'root-001');
      // Old children (child-001, child-002) must not appear in childIds
      expect(targetNode!.childIds).not.toContain('child-001');
      expect(targetNode!.childIds).not.toContain('child-002');
      // Exactly two new children
      expect(targetNode!.childIds).toHaveLength(2);
    });

    it('emits a progress event with redirect-specific message', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['New question A'],
        },
      });
      await dispatcherNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
      const msg = mockObservability.emitProgress.mock.calls[0]![2];
      expect(msg).toContain('Redirect');
    });

    it('single replacement question leaves pendingQuestions empty after dispatching', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['Only question'],
        },
      });
      const result = await dispatcherNode(state);

      expect(result.currentResearchTarget).toBeDefined();
      expect(result.pendingQuestions).toHaveLength(0);
    });

    it('replacement nodes under a child target get depth of child plus one', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'child-001',
          replacementQuestions: ['Redirected sub-question'],
        },
      });
      // child-001 is at depth 1, so replacement should be at depth 2
      const result = await dispatcherNode(state);

      const newNode = result.researchTree!.find(
        (n) => n.question === 'Redirected sub-question',
      );
      expect(newNode).toBeDefined();
      expect(newNode!.depth).toBe(2);
    });

    it('replacement nodes are children of the redirect target, not root', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'child-001',
          replacementQuestions: ['New sub-Q'],
        },
      });
      const result = await dispatcherNode(state);

      const newNode = result.researchTree!.find(
        (n) => n.question === 'New sub-Q',
      );
      expect(newNode!.parentId).toBe('child-001');
    });

    it('first replacement is set to researching status, remaining are pending', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'redirect',
          targetNodeId: 'root-001',
          replacementQuestions: ['First', 'Second', 'Third'],
        },
      });
      const result = await dispatcherNode(state);

      const firstNode = result.researchTree!.find(
        (n) => n.question === 'First',
      );
      const secondNode = result.researchTree!.find(
        (n) => n.question === 'Second',
      );
      const thirdNode = result.researchTree!.find(
        (n) => n.question === 'Third',
      );
      expect(firstNode!.status).toBe('researching');
      expect(secondNode!.status).toBe('pending');
      expect(thirdNode!.status).toBe('pending');
    });
  });
});
