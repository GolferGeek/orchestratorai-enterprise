/**
 * Shared tests for the section-draft factory. Every section node uses this
 * factory; these tests cover the branches the wrapper specs don't re-test.
 */
import { createSectionDraftNode } from './section-node.factory';
import type {
  LLMCallRequest,
  LLMCallResponse,
  LLMHttpClientService,
} from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { DealMemoState } from '../../deal-memo.state';
import type {
  DocumentIndexEntry,
  RunningFindingsSummary,
  RiskMatrix,
  DealBreakerFlag,
  DealContext,
} from '../../../due-diligence/due-diligence.types';
import { CitationValidationError } from './validate-citations';

// ── Fixtures ────────────────────────────────────────────────────────

const ctx = {
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'memo-conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'gemma3:e4b',
};

const dealContext: DealContext = {
  transactionType: 'acquisition',
  targetCompany: 'Target Inc',
  buyerCompany: 'Buyer Inc',
  jurisdictions: ['DE'],
  focusAreas: [],
  knownIssues: [],
};

const documentIndex: DocumentIndexEntry[] = [
  {
    documentId: 'doc-1',
    name: 'MSA.pdf',
    documentType: 'contract',
    parties: [],
    date: null,
    summary: '',
    riskScore: null,
    status: 'complete',
    specialistsAssigned: [],
    specialistsCompleted: [],
  },
];

const runningFindings: Record<string, RunningFindingsSummary> = {
  contract: {
    specialistKey: 'contract',
    documentCount: 1,
    keyFindings: [
      {
        documentId: 'doc-1',
        documentName: 'MSA.pdf',
        finding: 'Change of control restriction',
        severity: 'high',
        category: 'contract',
      },
    ],
    crossReferences: [],
    cumulativeRisks: [],
  },
};

const riskMatrix: RiskMatrix = {
  cells: [
    { category: 'contractual', severity: 'high', count: 1, documentRefs: [] },
  ],
};

const dealBreakerFlags: DealBreakerFlag[] = [
  {
    finding: 'Change-of-control blocker',
    category: 'contractual',
    severity: 'critical',
    documentRefs: [],
    reasoning: '',
    recommendation: '',
  },
];

const baseState = {
  executionContext: ctx,
  parentJobId: 'dd-1',
  parentConversationId: 'dd-conv-1',
  dealStructure: 'stock-purchase',
  reviewerNotes: undefined,
  dealContext,
  documentIndex,
  perDocumentOutputs: {},
  runningFindings,
  riskMatrix,
  dealBreakerFlags,
  missingDocuments: [],
  prunedForBudget: false,
  sectionDrafts: {},
  memoMarkdown: undefined,
  resynthesisCount: 0,
  reviewPayload: undefined,
  lastDecision: undefined,
  artifactPath: undefined,
  docxArtifactPath: undefined,
  status: 'drafting',
  error: undefined,
  startedAt: Date.now(),
  completedAt: undefined,
  messages: [],
} as unknown as DealMemoState;

// ── Doubles ────────────────────────────────────────────────────────

interface LlmDouble {
  calls: Array<{
    systemMessage: string;
    userMessage: string;
    callerName: string;
  }>;
  response: string;
  throwErr?: Error;
}

function makeLlmDouble(response: string): LlmDouble & LLMHttpClientService {
  const state: LlmDouble = { calls: [], response };
  const client: Partial<LLMHttpClientService> = {
    async callLLM(req: LLMCallRequest): Promise<LLMCallResponse> {
      state.calls.push({
        systemMessage: req.systemMessage ?? '',
        userMessage: req.userMessage,
        callerName: req.callerName ?? '',
      });
      if (state.throwErr) throw state.throwErr;
      return { text: state.response };
    },
  };
  return Object.assign(client, state) as LlmDouble & LLMHttpClientService;
}

function makeObservabilityDouble(): ObservabilityService {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as ObservabilityService;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('createSectionDraftNode (shared factory)', () => {
  it('returns a partial state update with sectionDrafts keyed by sectionId', async () => {
    const validResponse = JSON.stringify({
      draft: '1. Organization. The Target is a Delaware corp. [CITE:doc-1]',
      citations: [
        {
          documentId: 'doc-1',
          excerpt: 'The Target is a Delaware corp.',
        },
      ],
    });
    const llm = makeLlmDouble(validResponse);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    const result = await node(baseState);

    expect(result.sectionDrafts).toBeDefined();
    const drafts = result.sectionDrafts!;
    expect(drafts['reps-warranties']).toBeDefined();
    expect(drafts['reps-warranties'].draft).toContain('Organization');
    expect(drafts['reps-warranties'].citations).toHaveLength(1);
    expect(drafts['reps-warranties'].citations[0]!.documentId).toBe('doc-1');
  });

  it('passes the correct callerName suffix for observability/routing', async () => {
    const validResponse = JSON.stringify({
      draft: 'draft content',
      citations: [{ documentId: 'doc-1', excerpt: 'ex' }],
    });
    const llm = makeLlmDouble(validResponse);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('indemnification', llm, obs);

    await node(baseState);

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.callerName).toBe(
      'legal-department:deal-memo:indemnification',
    );
  });

  it('emits start + complete progress events', async () => {
    const validResponse = JSON.stringify({
      draft: 'd',
      citations: [{ documentId: 'doc-1', excerpt: 'x' }],
    });
    const llm = makeLlmDouble(validResponse);
    const obs = makeObservabilityDouble();
    const emitProgress = obs.emitProgress as jest.Mock;
    const node = createSectionDraftNode('covenants', llm, obs);

    await node(baseState);

    expect(emitProgress).toHaveBeenCalledTimes(2);
    const [startCall, doneCall] = emitProgress.mock.calls;
    expect(startCall[3].step).toBe('deal_memo_section_covenants_start');
    expect(doneCall[3].step).toBe('deal_memo_section_covenants_complete');
    expect(doneCall[3].citationCount).toBe(1);
  });

  it('strips markdown fences before parsing', async () => {
    const fenced =
      '```json\n' +
      JSON.stringify({
        draft: 'drafted',
        citations: [{ findingId: 'contract:0', excerpt: 'cof' }],
      }) +
      '\n```';
    const llm = makeLlmDouble(fenced);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    const result = await node(baseState);
    expect(result.sectionDrafts!['reps-warranties'].draft).toBe('drafted');
  });

  it('throws when LLM returns non-JSON', async () => {
    const llm = makeLlmDouble('I cannot help with that.');
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    await expect(node(baseState)).rejects.toThrow(/was not parseable JSON/);
  });

  it('throws when response is missing "draft"', async () => {
    const llm = makeLlmDouble(JSON.stringify({ citations: [] }));
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    await expect(node(baseState)).rejects.toThrow(
      /missing a non-empty "draft"/,
    );
  });

  it('throws when response is missing "citations"', async () => {
    const llm = makeLlmDouble(JSON.stringify({ draft: 'x' }));
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    await expect(node(baseState)).rejects.toThrow(
      /missing a "citations" array/,
    );
  });

  it('throws CitationValidationError when a findingId is fabricated', async () => {
    const response = JSON.stringify({
      draft: 'draft',
      citations: [{ findingId: 'fake:99', excerpt: 'fabricated' }],
    });
    const llm = makeLlmDouble(response);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('indemnification', llm, obs);

    await expect(node(baseState)).rejects.toBeInstanceOf(
      CitationValidationError,
    );
  });

  it('throws when a citation has no ID fields', async () => {
    const response = JSON.stringify({
      draft: 'draft',
      citations: [{ excerpt: 'unsourced' }],
    });
    const llm = makeLlmDouble(response);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    await expect(node(baseState)).rejects.toThrow(CitationValidationError);
  });

  it('accepts an empty citations array (sections may legitimately have none)', async () => {
    const response = JSON.stringify({
      draft: 'No DD findings in this area; section unchanged.',
      citations: [],
    });
    const llm = makeLlmDouble(response);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('covenants', llm, obs);

    const result = await node(baseState);
    expect(result.sectionDrafts!['covenants'].citations).toEqual([]);
  });

  it('prompt includes valid-citation legend with minted IDs', async () => {
    const response = JSON.stringify({
      draft: 'd',
      citations: [{ findingId: 'contract:0', excerpt: 'ex' }],
    });
    const llm = makeLlmDouble(response);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);

    await node(baseState);

    const { userMessage } = llm.calls[0]!;
    expect(userMessage).toContain('contract:0');
    expect(userMessage).toContain('doc-1');
    expect(userMessage).toContain('contractual:high');
    expect(userMessage).toContain('db-0');
  });

  it('system prompt names the correct deal structure', async () => {
    const response = JSON.stringify({
      draft: 'd',
      citations: [{ documentId: 'doc-1', excerpt: 'x' }],
    });
    const llm = makeLlmDouble(response);
    const obs = makeObservabilityDouble();
    const node = createSectionDraftNode('reps-warranties', llm, obs);
    const state = { ...baseState, dealStructure: 'asset-purchase' as const };

    await node(state);

    expect(llm.calls[0]!.systemMessage).toContain('Asset Purchase');
  });

  // ── Legal/Financial finding buckets (DD Financial Analysis — Phase 5) ─

  describe('findings partitioned into Legal / Financial buckets', () => {
    const financialRunningFindings: Record<string, RunningFindingsSummary> = {
      ...runningFindings,
      'revenue-concentration': {
        specialistKey: 'revenue-concentration',
        documentCount: 1,
        keyFindings: [
          {
            documentId: 'doc-1',
            documentName: 'p-and-l.txt',
            finding: 'Top 3 customers = 67% of FY2025 revenue',
            severity: 'critical',
            category: 'financial',
          },
        ],
        crossReferences: [],
        cumulativeRisks: [],
      },
      'debt-schedule': {
        specialistKey: 'debt-schedule',
        documentCount: 1,
        keyFindings: [
          {
            documentId: 'doc-2',
            documentName: 'debt-schedule.txt',
            finding: 'Fixed Charge Coverage cushion: 0.06x',
            severity: 'high',
            category: 'financial',
          },
        ],
        crossReferences: [],
        cumulativeRisks: [],
      },
    };

    it('emits a Financial bucket with per-finding lines when financial findings exist', async () => {
      const response = JSON.stringify({
        draft: 'd',
        citations: [{ findingId: 'contract:0', excerpt: 'x' }],
      });
      const llm = makeLlmDouble(response);
      const obs = makeObservabilityDouble();
      const node = createSectionDraftNode('reps-warranties', llm, obs);
      const state = {
        ...baseState,
        runningFindings: financialRunningFindings,
      } as unknown as DealMemoState;

      await node(state);

      const user = llm.calls[0]!.userMessage;
      expect(user).toContain('FINDINGS BY BUCKET');
      expect(user).toMatch(/## Legal findings \(\d+\)/);
      expect(user).toMatch(/## Financial findings \(2\)/);
      // Financial bucket contains the specific finding lines with their ids.
      expect(user).toContain('[revenue-concentration:0]');
      expect(user).toContain('67% of FY2025 revenue');
      expect(user).toContain('[debt-schedule:0]');
      expect(user).toContain('Fixed Charge Coverage cushion: 0.06x');
    });

    it('emits Financial bucket as "(none)" when only legal findings exist', async () => {
      const response = JSON.stringify({
        draft: 'd',
        citations: [{ findingId: 'contract:0', excerpt: 'x' }],
      });
      const llm = makeLlmDouble(response);
      const obs = makeObservabilityDouble();
      const node = createSectionDraftNode('reps-warranties', llm, obs);

      await node(baseState); // baseState has only 1 legal finding

      const user = llm.calls[0]!.userMessage;
      expect(user).toContain('## Financial findings\n_(none)_');
      expect(user).toMatch(/## Legal findings \(1\)/);
    });

    it('reps-warranties system prompt instructs omission of financial reps when bucket is empty', async () => {
      const response = JSON.stringify({
        draft: 'd',
        citations: [{ findingId: 'contract:0', excerpt: 'x' }],
      });
      const llm = makeLlmDouble(response);
      const obs = makeObservabilityDouble();
      const node = createSectionDraftNode('reps-warranties', llm, obs);

      await node(baseState);

      const sys = llm.calls[0]!.systemMessage;
      expect(sys).toContain('FINANCIAL REPS RULE');
      expect(sys).toMatch(/Capitalization/);
      expect(sys).toMatch(
        /Financial statements and absence of undisclosed liabilities/,
      );
      // Must reference the bucket mechanic, not just describe the schedule
      expect(sys).toMatch(/bucket.*reads.*\(none\)/i);
    });

    it('disclosure-schedules system prompt instructs omission of financial schedules when bucket is empty', async () => {
      const response = JSON.stringify({
        draft: 'd',
        citations: [{ documentId: 'doc-1', excerpt: 'x' }],
      });
      const llm = makeLlmDouble(response);
      const obs = makeObservabilityDouble();
      const node = createSectionDraftNode('disclosure-schedules', llm, obs);

      await node(baseState);

      const sys = llm.calls[0]!.systemMessage;
      expect(sys).toContain('FINANCIAL SCHEDULES RULE');
      expect(sys).toMatch(/cap table|capital structure/i);
      expect(sys).toMatch(/related-party/i);
    });

    it('non-reps sections do not receive the FINANCIAL REPS RULE emphasis', async () => {
      const response = JSON.stringify({
        draft: 'd',
        citations: [{ documentId: 'doc-1', excerpt: 'x' }],
      });
      const llm = makeLlmDouble(response);
      const obs = makeObservabilityDouble();
      const node = createSectionDraftNode('covenants', llm, obs);

      await node(baseState);

      const sys = llm.calls[0]!.systemMessage;
      expect(sys).not.toContain('FINANCIAL REPS RULE');
      expect(sys).not.toContain('FINANCIAL SCHEDULES RULE');
    });
  });
});
