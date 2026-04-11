import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import { createResearchNode } from './research.node';
import type {
  LegalResearchState,
  ResearchTreeNode,
} from '../legal-research.state';

// Mock the file-system-dependent specialist-utils
jest.mock('../../../nodes/specialist-utils', () => ({
  loadWorkflowMemory: jest.fn().mockResolvedValue(''),
  formatMemoryForPrompt: jest.fn().mockReturnValue(''),
  stripMarkdownFences: jest.fn((text: string) => text),
}));

// ── Mocks ───────────────────────────────────────────────────────────────

const mockResearchOutput = {
  findings: 'Delaware permits single-member LLCs. See 6 Del. C. § 18-101.',
  citations: [
    {
      text: '6 Del. C. § 18-101 permits single-member LLCs.',
      source: 'Delaware LLC Act',
      documentId: 'doc-001',
      chunkId: 'chunk-001',
      relevanceScore: 0.92,
    },
  ],
  newSubQuestions: ['What filing fees are required?'],
  confidence: 'high' as const,
};

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: JSON.stringify(mockResearchOutput),
    usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
  }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

const mockWorkflowRag = {
  getContext: jest
    .fn()
    .mockResolvedValue(
      '[Delaware LLC Act] 6 Del. C. § 18-101 permits single-member LLCs to be formed in Delaware.',
    ),
  smartContext: jest
    .fn()
    .mockResolvedValue(
      '\n\n---\nRelevant Reference Material:\n[Delaware LLC Act] 6 Del. C. § 18-101 permits single-member LLCs to be formed in Delaware.',
    ),
} as unknown as jest.Mocked<WorkflowRagService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  parentId: string | null,
  question: string,
  depth: number,
  status: ResearchTreeNode['status'] = 'pending',
): ResearchTreeNode {
  return { id, parentId, question, depth, status, childIds: [] };
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
      conversationId: 'conv-research-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    messages: [],
    userMessage: 'Can a single-member LLC elect S-corp status in Delaware?',
    jurisdiction: 'Delaware',
    practiceArea: 'Business Law',
    keyFacts: 'Client is a single-member LLC.',
    researchConfig: {
      maxDepth: 3,
      maxSubQuestionsPerLevel: 3,
      tokenBudget: null,
      timeBudgetMs: null,
    },
    researchTree: [
      makeNode(rootId, null, 'Root question', 0, 'answered'),
      makeNode(
        targetId,
        rootId,
        'What are Delaware LLC formation requirements?',
        1,
        'researching',
      ),
    ],
    currentDepth: 1,
    pendingQuestions: [],
    currentResearchTarget: targetId,
    tokenUsage: { input: 100, output: 50 },
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

describe('ResearchNode', () => {
  let researchNode: ReturnType<typeof createResearchNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    researchNode = createResearchNode(
      mockLLMClient,
      mockObservability,
      mockWorkflowRag,
    );
  });

  describe('happy path', () => {
    it('marks the target node as answered in the tree', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.status).toBe('answered');
    });

    it('stores findings on the target node', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.findings).toBe(mockResearchOutput.findings);
    });

    it('attaches citations with verified: true when source matches RAG', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.citations).toHaveLength(1);
      expect(target!.citations![0]!.verified).toBe(true);
    });

    it('stores confidence level on the target node', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.confidence).toBe('high');
    });

    it('stores new sub-questions in pendingQuestions', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      expect(result.pendingQuestions).toEqual([
        'What filing fees are required?',
      ]);
    });

    it('caps new sub-questions to maxSubQuestionsPerLevel', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: JSON.stringify({
          ...mockResearchOutput,
          newSubQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const state = createBaseState({
        researchConfig: {
          maxDepth: 3,
          maxSubQuestionsPerLevel: 2,
          tokenBudget: null,
          timeBudgetMs: null,
        },
      });
      const result = await researchNode(state);

      expect(result.pendingQuestions!.length).toBeLessThanOrEqual(2);
    });

    it('accumulates token usage correctly', async () => {
      const state = createBaseState();
      const result = await researchNode(state);

      expect(result.tokenUsage!.input).toBe(600); // 100 existing + 500 new
      expect(result.tokenUsage!.output).toBe(250); // 50 existing + 200 new
    });

    it('uses defaults when usage is not in LLM response', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: JSON.stringify(mockResearchOutput),
      });

      const state = createBaseState();
      const result = await researchNode(state);

      // Should not throw; usage defaults to 0
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage!.input).toBe(100);
    });

    it('fills missing citation fields with defaults', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: JSON.stringify({
          ...mockResearchOutput,
          citations: [{ text: 'A citation', source: 'Source A' }],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const state = createBaseState();
      const result = await researchNode(state);

      const target = result.researchTree!.find((n) => n.id === 'child-001');
      const citation = target!.citations![0]!;
      expect(citation.documentId).toBe('');
      expect(citation.chunkId).toBe('');
      expect(citation.relevanceScore).toBe(0.5);
    });

    it('emits a progress event on completion', async () => {
      const state = createBaseState();
      await researchNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
      const msg = mockObservability.emitProgress.mock.calls[0]![2];
      expect(msg).toContain('Research complete');
    });
  });

  describe('RAG integration', () => {
    it('calls WorkflowRagService.smartContext with the sub-question', async () => {
      const state = createBaseState();
      await researchNode(state);

      expect(mockWorkflowRag.smartContext).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'What are Delaware LLC formation requirements?',
          orgSlug: 'test-org',
        }),
        mockLLMClient,
      );
    });

    it('works without WorkflowRagService (no RAG)', async () => {
      const nodeWithoutRag = createResearchNode(
        mockLLMClient,
        mockObservability,
      );
      const state = createBaseState();
      const result = await nodeWithoutRag(state);

      expect(result.status).not.toBe('failed');
      expect(result.researchTree).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('returns failed status when currentResearchTarget is undefined', async () => {
      const state = createBaseState({ currentResearchTarget: undefined });
      const result = await researchNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No research target');
    });

    it('returns failed status when target node is not in the tree', async () => {
      const state = createBaseState({
        currentResearchTarget: 'nonexistent-node',
      });
      const result = await researchNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found in tree');
    });

    it('returns failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM timeout'));

      const state = createBaseState();
      const result = await researchNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM timeout');
    });

    it('returns failed status when LLM returns invalid JSON', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({ text: 'not-json' });

      const state = createBaseState();
      const result = await researchNode(state);

      expect(result.status).toBe('failed');
    });

    it('emits emitFailed on LLM error', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Network error'));

      const state = createBaseState();
      await researchNode(state);

      expect(mockObservability.emitFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('citation verification (Phase 2)', () => {
    it('marks citation as verified when source matches RAG document', async () => {
      // Default mock RAG returns '[Delaware LLC Act] ...'
      // Citation source is 'Delaware LLC Act' — should match
      const state = createBaseState();
      const result = await researchNode(state);
      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.citations![0]!.verified).toBe(true);
    });

    it('marks citation as unverified when source does not match RAG', async () => {
      // Return RAG context that doesn't contain the citation source
      mockWorkflowRag.smartContext.mockResolvedValueOnce(
        '[Some Other Document] Unrelated content about something else.',
      );
      const state = createBaseState();
      const result = await researchNode(state);
      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.citations![0]!.verified).toBe(false);
    });

    it('marks citation as unverified when no RAG context is available', async () => {
      mockWorkflowRag.smartContext.mockResolvedValueOnce('');
      const state = createBaseState();
      const result = await researchNode(state);
      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.citations![0]!.verified).toBe(false);
    });

    it('verifies by content overlap when source name does not match', async () => {
      // RAG contains the exact cited text but under a different source name
      mockWorkflowRag.smartContext.mockResolvedValueOnce(
        '[Different Source] 6 Del. C. § 18-101 permits single-member LLCs. This statute governs formation.',
      );
      const state = createBaseState();
      const result = await researchNode(state);
      const target = result.researchTree!.find((n) => n.id === 'child-001');
      // Citation text '6 Del. C. § 18-101 permits single-member LLCs.' appears in RAG context
      expect(target!.citations![0]!.verified).toBe(true);
    });

    it('marks all citations unverified when no WorkflowRag service', async () => {
      const nodeWithoutRag = createResearchNode(
        mockLLMClient,
        mockObservability,
      );
      const state = createBaseState();
      const result = await nodeWithoutRag(state);
      const target = result.researchTree!.find((n) => n.id === 'child-001');
      expect(target!.citations![0]!.verified).toBe(false);
    });
  });

  describe('ExecutionContext flow', () => {
    it('passes executionContext through to the LLM call', async () => {
      const state = createBaseState();
      await researchNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.context).toEqual(state.executionContext);
    });

    it('passes orgSlug from executionContext to RAG smartContext', async () => {
      const state = createBaseState();
      await researchNode(state);

      const ragArgs = mockWorkflowRag.smartContext.mock.calls[0]![0];
      expect(ragArgs.orgSlug).toBe('test-org');
    });
  });
});
