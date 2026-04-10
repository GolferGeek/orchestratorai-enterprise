import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { createReportGenerationNode } from './report-generation.node';
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

const MOCK_REPORT = `# Legal Research Memorandum

**Date:** April 10, 2026
**Re:** S-Corp Election for Delaware Single-Member LLC
**Jurisdiction:** Delaware

---

## I. Issues Presented
1. Can a Delaware single-member LLC elect S-corp taxation?

## II. Brief Answers
1. Yes, subject to IRS Form 2553 requirements.

## III. Discussion
### A. Delaware LLC Formation
Analysis with citations...

## IV. Conclusion
The LLC may make the S-corp election.

## V. Limitations and Open Questions
Scope limited to documents in the knowledge base.

---
*This memorandum was prepared using AI-assisted legal research.*`;

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: MOCK_REPORT,
    usage: { promptTokens: 1500, completionTokens: 600, totalTokens: 2100 },
  }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  parentId: string | null,
  question: string,
  depth: number,
  status: ResearchTreeNode['status'] = 'answered',
): ResearchTreeNode {
  return { id, parentId, question, depth, status, childIds: [] };
}

function createBaseState(
  overrides: Partial<LegalResearchState> = {},
): LegalResearchState {
  const DRAFT_MEMO = `# Legal Research Memorandum

## Issues Presented
1. Can a Delaware single-member LLC elect S-corp status?

## Brief Answers
1. Yes, with Form 2553.

## Discussion
Analysis...`;

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
    researchTree: [
      makeNode('root-001', null, 'S-corp election question', 0),
      makeNode('child-001', 'root-001', 'Delaware LLC requirements', 1),
      makeNode('child-002', 'root-001', 'IRS S-corp election', 1),
    ],
    currentDepth: 1,
    pendingQuestions: [],
    currentResearchTarget: undefined,
    tokenUsage: { input: 1000, output: 400 },
    startedAt: Date.now(),
    memo: DRAFT_MEMO,
    report: undefined,
    status: 'processing',
    error: undefined,
    completedAt: undefined,
    hitlAction: undefined,
    ...overrides,
  } as unknown as LegalResearchState;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ReportGenerationNode', () => {
  let reportGenerationNode: ReturnType<typeof createReportGenerationNode>;

  beforeEach(() => {
    jest.clearAllMocks();
    reportGenerationNode = createReportGenerationNode(
      mockLLMClient,
      mockObservability,
    );
  });

  describe('happy path', () => {
    it('sets report from LLM response', async () => {
      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.report).toBeDefined();
      expect(result.report).toContain('Legal Research Memorandum');
    });

    it('trims whitespace from the LLM response', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: '  \n# Legal Research Memorandum\nContent\n  ',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.report!.startsWith('# Legal Research')).toBe(true);
      expect(result.report!.endsWith('Content')).toBe(true);
    });

    it('accumulates token usage', async () => {
      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.tokenUsage!.input).toBe(2500); // 1000 existing + 1500 new
      expect(result.tokenUsage!.output).toBe(1000); // 400 existing + 600 new
    });

    it('uses token usage defaults when not in LLM response', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({ text: MOCK_REPORT });

      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.tokenUsage!.input).toBe(1000); // unchanged
      expect(result.tokenUsage!.output).toBe(400);
    });

    it('emits two progress events (start and complete)', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
      expect(mockObservability.emitProgress.mock.calls[0]![2]).toContain(
        'Generating final legal research report',
      );
      expect(mockObservability.emitProgress.mock.calls[1]![2]).toContain(
        'Final report generated',
      );
    });
  });

  describe('prompt construction', () => {
    it('includes the original question in the prompt', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain(
        'Can a single-member LLC elect S-corp status',
      );
    });

    it('includes jurisdiction in the prompt', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('Delaware');
    });

    it('includes the draft memo content in the prompt', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('DRAFT MEMORANDUM');
      expect(callArgs.userMessage).toContain('Form 2553');
    });

    it('includes practice area in the prompt', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('Business Law');
    });
  });

  describe('error handling', () => {
    it('returns failed status when memo is undefined', async () => {
      const state = createBaseState({ memo: undefined });
      const result = await reportGenerationNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No memo available');
    });

    it('does not call LLM when memo is missing', async () => {
      const state = createBaseState({ memo: undefined });
      await reportGenerationNode(state);

      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('returns failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('LLM unavailable'));

      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM unavailable');
    });

    it('emits emitFailed on LLM error', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Network error'));

      const state = createBaseState();
      await reportGenerationNode(state);

      expect(mockObservability.emitFailed).toHaveBeenCalledTimes(1);
    });

    it('prefixes error message with Report generation:', async () => {
      mockLLMClient.callLLM.mockRejectedValueOnce(new Error('Timeout'));

      const state = createBaseState();
      const result = await reportGenerationNode(state);

      expect(result.error).toContain('Report generation:');
    });
  });

  describe('ExecutionContext flow', () => {
    it('passes executionContext to the LLM call', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.context).toEqual(state.executionContext);
    });
  });
});
