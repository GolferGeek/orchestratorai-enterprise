import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createQuestionAnalysisNode } from './question-analysis.node';
import type { LegalResearchState } from '../legal-research.state';

// Mock the file-system-dependent specialist-utils so tests don't hit disk
jest.mock('../../../nodes/specialist-utils', () => ({
  loadWorkflowMemory: jest.fn().mockResolvedValue(''),
  formatMemoryForPrompt: jest.fn().mockReturnValue(''),
  stripMarkdownFences: jest.fn((text: string) => text),
}));

// ── Mocks ───────────────────────────────────────────────────────────────

const mockLLMResponse = {
  restatedQuestion:
    'Does Delaware law permit single-member LLCs to elect S-corp taxation?',
  jurisdictions: ['Delaware', 'Federal'],
  initialSubQuestions: [
    { question: 'What are Delaware LLC formation requirements?', priority: 3 },
    { question: 'What are IRS S-corp election requirements?', priority: 2 },
    {
      question: 'Are there state-level S-corp analogues in Delaware?',
      priority: 1,
    },
  ],
  researchPlan:
    'Research Delaware LLC statutes, then federal tax election rules.',
};

const mockLLMClient = {
  callLLM: jest
    .fn()
    .mockResolvedValue({ text: JSON.stringify(mockLLMResponse) }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── State factory ────────────────────────────────────────────────────────

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-qa-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    messages: [],
    userMessage: 'Can a single-member LLC elect S-corp status in Delaware?',
    jurisdiction: 'Delaware',
    practiceArea: 'Business Law',
    keyFacts: 'Client is a single-member LLC formed in Delaware.',
    researchConfig: {
      maxDepth: 3,
      maxSubQuestionsPerLevel: 3,
      tokenBudget: null,
      timeBudgetMs: null,
    },
    researchTree: [],
    currentDepth: 0,
    pendingQuestions: [],
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

describe('QuestionAnalysisNode', () => {
  let questionAnalysisNode: ReturnType<typeof createQuestionAnalysisNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    questionAnalysisNode = createQuestionAnalysisNode(
      mockLLMClient,
      mockObservability,
    );
  });

  describe('happy path', () => {
    it('builds a research tree with a root node and child sub-questions', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      expect(result.researchTree).toBeDefined();
      expect(result.researchTree!.length).toBeGreaterThanOrEqual(2); // root + children
    });

    it('root node has parentId null, depth 0, status answered', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      const root = result.researchTree!.find((n) => n.parentId === null);
      expect(root).toBeDefined();
      expect(root!.depth).toBe(0);
      expect(root!.status).toBe('answered');
    });

    it('child nodes are all pending with depth 1', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      const children = result.researchTree!.filter((n) => n.parentId !== null);
      for (const child of children) {
        expect(child.depth).toBe(1);
        expect(child.status).toBe('pending');
      }
    });

    it('pendingQuestions contains IDs of all child nodes', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      const childIds = result
        .researchTree!.filter((n) => n.parentId !== null)
        .map((n) => n.id);

      expect(result.pendingQuestions).toEqual(expect.arrayContaining(childIds));
      expect(result.pendingQuestions!.length).toBe(childIds.length);
    });

    it('caps sub-questions to maxSubQuestionsPerLevel', async () => {
      // LLM returns 3 sub-questions; config allows only 2
      const state = createBaseState({
        researchConfig: {
          maxDepth: 3,
          maxSubQuestionsPerLevel: 2,
          tokenBudget: null,
          timeBudgetMs: null,
        },
      });
      const result = await questionAnalysisNode(state);

      const children = result.researchTree!.filter((n) => n.parentId !== null);
      expect(children.length).toBeLessThanOrEqual(2);
    });

    it('sorts sub-questions by priority descending (highest first)', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      // priority 3 → first child
      const children = result.researchTree!.filter((n) => n.parentId !== null);
      expect(children[0]!.question).toContain('Delaware LLC formation');
    });

    it('sets currentDepth to 1', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      expect(result.currentDepth).toBe(1);
    });

    it('root node stores the research plan as findings', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      const root = result.researchTree!.find((n) => n.parentId === null);
      expect(root!.findings).toBe(mockLLMResponse.researchPlan);
    });

    it('root node childIds lists all child node IDs', async () => {
      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      const root = result.researchTree!.find((n) => n.parentId === null);
      const children = result.researchTree!.filter((n) => n.parentId !== null);
      expect(root!.childIds).toEqual(children.map((c) => c.id));
    });

    it('emits two progress events (start and complete)', async () => {
      const state = createBaseState();
      await questionAnalysisNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
      expect(mockObservability.emitProgress.mock.calls[0]![2]).toContain(
        'Analyzing legal question',
      );
      expect(mockObservability.emitProgress.mock.calls[1]![2]).toContain(
        'sub-questions identified',
      );
    });
  });

  describe('error handling', () => {
    it('returns failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM timeout'));

      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM timeout');
    });

    it('returns failed status when LLM returns invalid JSON', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: 'not valid json {{{',
      });

      const state = createBaseState();
      const result = await questionAnalysisNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Question analysis');
    });

    it('emits emitFailed on LLM error', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Network error'));

      const state = createBaseState();
      await questionAnalysisNode(state);

      expect(mockObservability.emitFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('ExecutionContext flow', () => {
    it('passes executionContext to the LLM call', async () => {
      const state = createBaseState();
      await questionAnalysisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.context).toEqual(state.executionContext);
    });
  });
});
