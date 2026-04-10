import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createSynthesisNode } from './synthesis.node';
import type {
  LegalResearchState,
  ResearchTreeNode,
  Citation,
} from '../legal-research.state';

// Mock the file-system-dependent specialist-utils
jest.mock('../../../nodes/specialist-utils', () => ({
  loadWorkflowMemory: jest.fn().mockResolvedValue(''),
  formatMemoryForPrompt: jest.fn().mockReturnValue(''),
  stripMarkdownFences: jest.fn((text: string) => text),
}));

// ── Mocks ───────────────────────────────────────────────────────────────

const MOCK_MEMO = `# Legal Research Memorandum

## Issues Presented
1. Can a Delaware single-member LLC elect S-corp status?

## Brief Answers
1. Yes, with proper IRS form 2553 filing.

## Discussion
### Issue 1
Analysis here...`;

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: MOCK_MEMO,
    usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
  }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    text: 'A cited passage from the statute.',
    source: 'Delaware LLC Act § 18-101',
    documentId: 'doc-001',
    chunkId: 'chunk-001',
    verified: true,
    relevanceScore: 0.9,
    ...overrides,
  };
}

function makeNode(
  id: string,
  parentId: string | null,
  question: string,
  depth: number,
  status: ResearchTreeNode['status'],
  confidence?: ResearchTreeNode['confidence'],
  findings?: string,
  citations?: Citation[],
  childIds: string[] = [],
): ResearchTreeNode {
  return {
    id,
    parentId,
    question,
    depth,
    status,
    confidence,
    findings,
    citations,
    childIds,
  };
}

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-synthesis-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    messages: [],
    userMessage: 'Can a single-member LLC elect S-corp status in Delaware?',
    jurisdiction: 'Delaware',
    practiceArea: 'Business Law',
    keyFacts: 'Client formed in Delaware.',
    researchConfig: {
      maxDepth: 3,
      maxSubQuestionsPerLevel: 3,
      tokenBudget: null,
      timeBudgetMs: null,
    },
    researchTree: [
      makeNode(
        'root-001',
        null,
        'S-corp election for LLC in Delaware',
        0,
        'answered',
        undefined,
        'Research plan',
        undefined,
        ['child-001', 'child-002'],
      ),
      makeNode(
        'child-001',
        'root-001',
        'Delaware LLC formation requirements',
        1,
        'answered',
        'high',
        'Delaware permits LLCs via 6 Del. C. § 18-101.',
        [makeCitation()],
        [],
      ),
      makeNode(
        'child-002',
        'root-001',
        'IRS S-corp election requirements',
        1,
        'answered',
        'medium',
        'IRS Form 2553 must be filed within 75 days.',
        [
          makeCitation({
            source: 'IRS Publication 589',
            documentId: 'doc-002',
          }),
        ],
        [],
      ),
    ],
    currentDepth: 1,
    pendingQuestions: [],
    currentResearchTarget: undefined,
    tokenUsage: { input: 500, output: 200 },
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

describe('SynthesisNode', () => {
  let synthesisNode: ReturnType<typeof createSynthesisNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    synthesisNode = createSynthesisNode(mockLLMClient, mockObservability);
  });

  describe('happy path', () => {
    it('sets memo from LLM response', async () => {
      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.memo).toBeDefined();
      expect(result.memo).toContain('Legal Research Memorandum');
    });

    it('trims whitespace from the LLM response', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: '  \n' + MOCK_MEMO + '\n  ',
        usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      });

      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.memo!.startsWith('# Legal Research')).toBe(true);
      expect(result.memo!.endsWith('...')).toBe(true);
    });

    it('accumulates token usage', async () => {
      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.tokenUsage!.input).toBe(1500); // 500 existing + 1000 new
      expect(result.tokenUsage!.output).toBe(700); // 200 existing + 500 new
    });

    it('uses token usage defaults when not in LLM response', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({ text: MOCK_MEMO });

      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.tokenUsage!.input).toBe(500); // unchanged
      expect(result.tokenUsage!.output).toBe(200);
    });

    it('emits two progress events (start and complete)', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
      expect(mockObservability.emitProgress.mock.calls[0]![2]).toContain(
        'Synthesizing',
      );
      expect(mockObservability.emitProgress.mock.calls[1]![2]).toContain(
        'complete',
      );
    });
  });

  describe('prompt construction', () => {
    it('includes the original user question in the prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain(
        'Can a single-member LLC elect S-corp status',
      );
    });

    it('includes jurisdiction and practice area in the prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('Delaware');
      expect(callArgs.userMessage).toContain('Business Law');
    });

    it('includes research tree nodes in the prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain(
        'Delaware LLC formation requirements',
      );
    });

    it('counts unique document IDs for scope statement', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      // doc-001 from child-001, doc-002 from child-002 → 2 unique docs
      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('2');
    });

    it('includes skipped node count in research stats', async () => {
      const state = createBaseState({
        researchTree: [
          makeNode(
            'root-001',
            null,
            'Root',
            0,
            'answered',
            undefined,
            undefined,
            undefined,
            ['child-001', 'child-002'],
          ),
          makeNode(
            'child-001',
            'root-001',
            'Q1',
            1,
            'answered',
            'high',
            'Findings',
          ),
          makeNode('child-002', 'root-001', 'Q2', 1, 'skipped'),
        ],
      });
      await synthesisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('skipped');
    });
  });

  describe('error handling', () => {
    it('returns failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM unavailable');
    });

    it('emits emitFailed on LLM error', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Network error'));

      const state = createBaseState();
      await synthesisNode(state);

      expect(mockObservability.emitFailed).toHaveBeenCalledTimes(1);
    });

    it('error message is prefixed with Synthesis:', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Timeout'));

      const state = createBaseState();
      const result = await synthesisNode(state);

      expect(result.error).toContain('Synthesis:');
    });
  });

  describe('ExecutionContext flow', () => {
    it('passes executionContext to the LLM call', async () => {
      const state = createBaseState();
      await synthesisNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.context).toEqual(state.executionContext);
    });
  });
});
