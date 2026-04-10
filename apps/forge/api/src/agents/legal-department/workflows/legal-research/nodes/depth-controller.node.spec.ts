import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createDepthControllerNode } from './depth-controller.node';
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
  status: ResearchTreeNode['status'] = 'answered',
  confidence?: ResearchTreeNode['confidence'],
  childIds: string[] = [],
): ResearchTreeNode {
  return { id, parentId, question, depth, status, confidence, childIds };
}

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
  const rootId = 'root-001';
  const targetId = 'child-001';

  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-depth-test',
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
      makeNode(rootId, null, 'Root question', 0, 'answered', undefined, [
        targetId,
      ]),
      makeNode(
        targetId,
        rootId,
        'What are LLC requirements?',
        1,
        'answered',
        'medium',
      ),
    ],
    currentDepth: 1,
    pendingQuestions: ['What filing fees apply?', 'What is the annual report?'],
    currentResearchTarget: targetId,
    tokenUsage: { input: 200, output: 100 },
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

describe('DepthControllerNode', () => {
  let depthControllerNode: ReturnType<typeof createDepthControllerNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    depthControllerNode = createDepthControllerNode(mockObservability);
  });

  describe('routing to continue research', () => {
    it('adds new sub-questions as nodes in the tree', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      // Should have 2 new nodes (from pendingQuestions)
      const newNodes = result.researchTree!.filter(
        (n) =>
          n.question === 'What filing fees apply?' ||
          n.question === 'What is the annual report?',
      );
      expect(newNodes).toHaveLength(2);
    });

    it('sets new nodes to pending status', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      const newNodes = result.researchTree!.filter(
        (n) =>
          n.question === 'What filing fees apply?' ||
          n.question === 'What is the annual report?',
      );
      for (const node of newNodes) {
        expect(node.status).toBe('pending');
      }
    });

    it('sets new nodes depth to currentDepth + 1', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      const newNodes = result.researchTree!.filter((n) => n.depth === 2);
      expect(newNodes.length).toBeGreaterThan(0);
    });

    it('puts new node IDs into pendingQuestions', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions!.length).toBe(2);
      // IDs should reference nodes in the tree
      for (const id of result.pendingQuestions!) {
        const node = result.researchTree!.find((n) => n.id === id);
        expect(node).toBeDefined();
      }
    });

    it('increments currentDepth', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      expect(result.currentDepth).toBe(2);
    });

    it('clears currentResearchTarget', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      expect(result.currentResearchTarget).toBeUndefined();
    });

    it('deduplicates new sub-questions that already exist in the tree', async () => {
      const state = createBaseState({
        pendingQuestions: ['What are LLC requirements?', 'New unique question'],
      });
      const result = await depthControllerNode(state);

      // 'What are LLC requirements?' already in tree — should be deduped
      const dupeNodes = result.researchTree!.filter(
        (n) => n.question === 'What are LLC requirements?',
      );
      expect(dupeNodes).toHaveLength(1); // only original
    });

    it('attaches new nodes as children of the current target in the tree', async () => {
      const state = createBaseState();
      const result = await depthControllerNode(state);

      const targetNode = result.researchTree!.find((n) => n.id === 'child-001');
      expect(targetNode!.childIds.length).toBeGreaterThan(0);
    });
  });

  describe('routing to synthesis', () => {
    it('routes to synthesis when no new sub-questions', async () => {
      const state = createBaseState({ pendingQuestions: [] });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions).toEqual([]);
      expect(result.currentResearchTarget).toBeUndefined();
    });

    it('routes to synthesis when maxDepth exceeded', async () => {
      const state = createBaseState({
        researchConfig: {
          maxDepth: 1,
          maxSubQuestionsPerLevel: 3,
          tokenBudget: null,
          timeBudgetMs: null,
        },
        // target is at depth 1, maxDepth is 1 → exceeded
        researchTree: [
          makeNode('root-001', null, 'Root', 0, 'answered', undefined, [
            'child-001',
          ]),
          makeNode(
            'child-001',
            'root-001',
            'Sub-question',
            1,
            'answered',
            'medium',
          ),
        ],
      });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions).toEqual([]);
    });

    it('marks remaining pending nodes as skipped when depth exceeded', async () => {
      const pendingId = 'pending-existing-001';
      const state = createBaseState({
        researchConfig: {
          maxDepth: 1,
          maxSubQuestionsPerLevel: 3,
          tokenBudget: null,
          timeBudgetMs: null,
        },
        researchTree: [
          makeNode('root-001', null, 'Root', 0, 'answered', undefined, [
            'child-001',
            pendingId,
          ]),
          makeNode(
            'child-001',
            'root-001',
            'Sub-question',
            1,
            'answered',
            'medium',
          ),
          makeNode(pendingId, 'root-001', 'Still pending', 1, 'pending'),
        ],
        pendingQuestions: ['New sub-Q from research'],
      });
      const result = await depthControllerNode(state);

      const skippedNode = result.researchTree!.find((n) => n.id === pendingId);
      expect(skippedNode!.status).toBe('skipped');
    });

    it('routes to synthesis when token budget exceeded', async () => {
      const state = createBaseState({
        researchConfig: {
          maxDepth: 10,
          maxSubQuestionsPerLevel: 5,
          tokenBudget: 100,
          timeBudgetMs: null,
        },
        tokenUsage: { input: 90, output: 20 }, // 110 > 100 budget
      });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions).toEqual([]);
    });

    it('routes to synthesis when high confidence and no new sub-questions', async () => {
      const state = createBaseState({
        pendingQuestions: [],
        researchTree: [
          makeNode('root-001', null, 'Root', 0, 'answered', undefined, [
            'child-001',
          ]),
          makeNode(
            'child-001',
            'root-001',
            'Sub-question',
            1,
            'answered',
            'high',
          ),
        ],
      });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions).toEqual([]);
    });

    it('emits a progress event indicating synthesis routing', async () => {
      const state = createBaseState({ pendingQuestions: [] });
      await depthControllerNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
      const msg = mockObservability.emitProgress.mock.calls[0]![2];
      expect(msg).toContain('synthesis');
    });
  });

  describe('deepen HITL action', () => {
    it('adds a deepen sub-question under each target node', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Focus on case law',
        },
      });
      const result = await depthControllerNode(state);

      const deepenNodes = result.researchTree!.filter(
        (n) => n.parentId === 'child-001',
      );
      expect(deepenNodes).toHaveLength(1);
      expect(deepenNodes[0]!.question).toContain('Further research on');
    });

    it('includes guidance in the deepen question text', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Focus on case law',
        },
      });
      const result = await depthControllerNode(state);

      const deepenNode = result.researchTree!.find(
        (n) => n.parentId === 'child-001',
      );
      expect(deepenNode!.question).toContain('Focus on case law');
    });

    it('creates a deepen question without guidance text when not provided', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
        },
      });
      const result = await depthControllerNode(state);

      const deepenNode = result.researchTree!.find(
        (n) => n.parentId === 'child-001',
      );
      expect(deepenNode!.question).toContain('Further research on');
      expect(deepenNode!.question).not.toContain('undefined');
    });

    it('puts new deepen node IDs in pendingQuestions', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Focus on statutes',
        },
      });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions!.length).toBe(1);
    });

    it('handles multiple target nodes in a single deepen action', async () => {
      const state = createBaseState({
        researchTree: [
          makeNode('root-001', null, 'Root', 0, 'answered', undefined, [
            'child-001',
            'child-002',
          ]),
          makeNode('child-001', 'root-001', 'Sub-Q 1', 1, 'answered', 'low'),
          makeNode('child-002', 'root-001', 'Sub-Q 2', 1, 'answered', 'low'),
        ],
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001', 'child-002'],
          guidance: 'Need more depth',
        },
      });
      const result = await depthControllerNode(state);

      expect(result.pendingQuestions!.length).toBe(2);
    });

    it('clears hitlAction after deepen', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
        },
      });
      const result = await depthControllerNode(state);

      expect(result.hitlAction).toBeUndefined();
    });

    it('emits a progress event about deepening', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
        },
      });
      await depthControllerNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
      const msg = mockObservability.emitProgress.mock.calls[0]![2];
      expect(msg).toContain('Deepen');
    });

    it('new deepen nodes have pending status', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Focus on statutes',
        },
      });
      const result = await depthControllerNode(state);

      const deepenNode = result.researchTree!.find(
        (n) => n.parentId === 'child-001',
      );
      expect(deepenNode!.status).toBe('pending');
    });

    it('new deepen nodes have depth equal to target depth plus one', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
        },
      });
      // child-001 is at depth 1 in createBaseState
      const result = await depthControllerNode(state);

      const deepenNode = result.researchTree!.find(
        (n) => n.parentId === 'child-001',
      );
      expect(deepenNode!.depth).toBe(2);
    });

    it('target node childIds includes the new deepen node', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Review recent case law',
        },
      });
      const result = await depthControllerNode(state);

      const targetNode = result.researchTree!.find((n) => n.id === 'child-001');
      expect(targetNode!.childIds).toHaveLength(1);

      const deepenNode = result.researchTree!.find(
        (n) => n.id === targetNode!.childIds[0],
      );
      expect(deepenNode).toBeDefined();
      expect(deepenNode!.question).toContain('Further research on');
    });

    it('each target node gets its own child entry after multi-target deepen', async () => {
      const state = createBaseState({
        researchTree: [
          makeNode('root-001', null, 'Root', 0, 'answered', undefined, [
            'child-001',
            'child-002',
          ]),
          makeNode('child-001', 'root-001', 'Sub-Q 1', 1, 'answered', 'low'),
          makeNode('child-002', 'root-001', 'Sub-Q 2', 1, 'answered', 'low'),
        ],
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001', 'child-002'],
          guidance: 'Need more depth',
        },
      });
      const result = await depthControllerNode(state);

      const child1 = result.researchTree!.find((n) => n.id === 'child-001');
      const child2 = result.researchTree!.find((n) => n.id === 'child-002');
      expect(child1!.childIds).toHaveLength(1);
      expect(child2!.childIds).toHaveLength(1);
      // Each target's child should be distinct
      expect(child1!.childIds[0]).not.toBe(child2!.childIds[0]);
    });

    it('deepen produces pendingQuestions that route toward research_dispatcher (non-empty)', async () => {
      // After a deepen action the pendingQuestions list must be non-empty so that
      // the depth_controller conditional edge selects research_dispatcher, not synthesis.
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['child-001'],
          guidance: 'Deeper statutory analysis',
        },
      });
      const result = await depthControllerNode(state);

      // The graph routes to research_dispatcher when pendingQuestions.length > 0
      expect(result.pendingQuestions!.length).toBeGreaterThan(0);
    });

    it('skips unknown target node IDs gracefully without adding nodes', async () => {
      const state = createBaseState({
        hitlAction: {
          type: 'deepen',
          targetNodeIds: ['nonexistent-node'],
          guidance: 'some guidance',
        },
      });
      const originalTreeLength = state.researchTree.length;
      const result = await depthControllerNode(state);

      // No new nodes should have been added for the unknown target
      expect(result.researchTree!.length).toBe(originalTreeLength);
      expect(result.pendingQuestions).toHaveLength(0);
    });
  });
});
