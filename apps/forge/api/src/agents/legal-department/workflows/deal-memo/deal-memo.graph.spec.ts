/**
 * Graph-level integration spec for the deal-memo workflow.
 *
 * Exercises the full graph with:
 *   - MemorySaver for checkpointing (swapped in by stubbing
 *     PostgresCheckpointerService.getSaver()).
 *   - Mocked LLMHttpClientService that returns a valid {draft, citations}
 *     JSON body per section-draft call.
 *   - Stubbed ParentStateReader that hands a synthetic DD snapshot back
 *     to memo_intake, so intake populates state without a real DD job.
 *
 * Covered flows:
 *   happy  — intake → 5 sections → synthesis → hitl (approve) → finalize → complete
 *   reject — approve re-paused after first reject triggers re-synthesis
 *   modify — section edits substituted via applyModifyEdits, re-synthesis
 *            produces a memo containing the edit sentinel
 *   cap    — second reject after the first trips the re-synthesis cap
 *            and finalizes anyway (no infinite loop)
 */
import { Command, MemorySaver } from '@langchain/langgraph';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { LegalJobsRepository } from '../../jobs/legal-jobs.repository';
import { createDealMemoGraph } from './deal-memo.graph';
import type { DealMemoState } from './deal-memo.state';
import type { ParentDDSnapshot } from './nodes/memo-intake.node';
import { SECTION_CALLER_NAMES } from './nodes/shared/section-prompts';
import type { SectionId } from './deal-memo.types';

// ── Fixtures ────────────────────────────────────────────────────────

const ctx = {
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'memo-conv-graph-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'gemma3:e4b',
};

const parentSnapshot: ParentDDSnapshot = {
  dealContext: {
    transactionType: 'acquisition',
    targetCompany: 'Target Inc',
    buyerCompany: 'Buyer Inc',
    jurisdictions: ['DE'],
    focusAreas: [],
    knownIssues: [],
  },
  documentIndex: [
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
  ],
  // RoutingDecision is an internal DD type not exported; cast the whole
  // map since memo_intake only reads keys presence + Object.keys().length.
  perDocumentOutputs: {
    'doc-1': {
      specialistOutputs: { contract: { findings: [] } },
      routingDecision: {
        decidedSpecialists: ['contract'],
        reasoning: 'test fixture',
      },
    },
  } as unknown as ParentDDSnapshot['perDocumentOutputs'],
  runningFindings: {
    contract: {
      specialistKey: 'contract',
      documentCount: 1,
      keyFindings: [
        {
          documentId: 'doc-1',
          documentName: 'MSA.pdf',
          finding: 'Change-of-control restriction',
          severity: 'high',
          category: 'contract',
        },
      ],
      crossReferences: [],
      cumulativeRisks: [],
    },
  },
  riskMatrix: {
    cells: [
      {
        category: 'contractual',
        severity: 'high',
        count: 1,
        documentRefs: [],
      },
    ],
  },
  dealBreakerFlags: [
    {
      finding: 'Change-of-control blocker',
      category: 'contractual',
      severity: 'critical',
      documentRefs: [],
      reasoning: '',
      recommendation: '',
    },
  ],
  missingDocuments: [],
};

const initialState: Partial<DealMemoState> = {
  executionContext: ctx,
  parentJobId: 'dd-parent-1',
  parentConversationId: 'dd-parent-conv-1',
  dealStructure: 'stock-purchase',
  status: 'intake',
  startedAt: Date.now(),
};

// Helper — each section-draft LLM call receives a `callerName` that tells
// us which section we're drafting. Return a valid JSON response tagged
// with the section id so we can assert the stitch order later.
const SECTION_FROM_CALLER: Record<string, SectionId> = Object.entries(
  SECTION_CALLER_NAMES,
).reduce(
  (acc, [id, name]) => {
    acc[name] = id as SectionId;
    return acc;
  },
  {} as Record<string, SectionId>,
);

function makeLlmMock(overrides?: {
  fixedDraft?: Partial<Record<SectionId, string>>;
}): jest.Mocked<LLMHttpClientService> {
  const callLLM = jest
    .fn<
      Promise<{ text: string }>,
      [{ callerName?: string; userMessage: string; systemMessage?: string }]
    >()
    .mockImplementation(async (req) => {
      const caller = req.callerName ?? '';
      const sectionId = SECTION_FROM_CALLER[caller];
      if (!sectionId) {
        throw new Error(`Unexpected callerName in LLM mock: "${caller}"`);
      }
      const draft =
        overrides?.fixedDraft?.[sectionId] ??
        `Section draft for ${sectionId}. [CITE:doc-1]`;
      return {
        text: JSON.stringify({
          draft,
          citations: [{ documentId: 'doc-1', excerpt: 'MSA.pdf' }],
        }),
      };
    });
  return { callLLM } as unknown as jest.Mocked<LLMHttpClientService>;
}

function makeObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function makeCheckpointer(): jest.Mocked<PostgresCheckpointerService> {
  const saver = new MemorySaver();
  return {
    getSaver: jest.fn().mockResolvedValue(saver),
  } as unknown as jest.Mocked<PostgresCheckpointerService>;
}

function makeJobsRepo(): jest.Mocked<LegalJobsRepository> {
  // memo_intake calls findByIdForOrg(parentJobId, orgSlug) and validates
  // status=completed, metadata.jobType=due-diligence, and
  // conversation_id matches state.parentConversationId.
  return {
    findByIdForOrg: jest.fn().mockResolvedValue({
      id: 'dd-parent-1',
      org_slug: ctx.orgSlug,
      user_id: ctx.userId,
      conversation_id: 'dd-parent-conv-1',
      agent_slug: 'legal-department',
      job_type: 'due-diligence',
      provider: 'local',
      model: 'gemma3:e4b',
      status: 'completed',
      current_step: null,
      progress: 100,
      last_message: null,
      error: null,
      input: { data: {}, metadata: { jobType: 'due-diligence' } },
      result: {},
      original_file_path: null,
      document_paths: [],
      document_count: 1,
      review_decision: null,
      queued_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }),
  } as unknown as jest.Mocked<LegalJobsRepository>;
}

// The real graph fetches parent state by reading the DD graph's snapshot;
// the test swaps that in for a plain function returning our fixture.
function makeParentStateReader(): jest.Mock {
  return jest.fn().mockResolvedValue(parentSnapshot);
}

// Stub DealMemoArtifactService so the finalize node runs without touching
// real storage. Returns deterministic bucket-relative paths.
function makeArtifactService() {
  return {
    uploadMemoMarkdown: jest
      .fn()
      .mockImplementation(
        async (memoJobId: string) => `${memoJobId}/deal-memo.md`,
      ),
    uploadMemoDocx: jest
      .fn()
      .mockImplementation(
        async (memoJobId: string) => `${memoJobId}/deal-memo.docx`,
      ),
    downloadArtifact: jest.fn(),
    renderMarkdownToDocx: jest.fn(),
    memoMarkdownPath: (id: string) => `${id}/deal-memo.md`,
    memoDocxPath: (id: string) => `${id}/deal-memo.docx`,
    onModuleInit: jest.fn(),
  } as unknown as import('./artifacts/deal-memo-artifact.service').DealMemoArtifactService;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('deal-memo graph (integration with MemorySaver)', () => {
  it('compiles and exposes invoke()', async () => {
    const graph = await createDealMemoGraph(
      makeLlmMock(),
      makeObservability(),
      makeCheckpointer(),
      makeJobsRepo(),
      makeParentStateReader(),
      makeArtifactService(),
    );
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  it('happy path: intake → 5 sections → synthesis → pauses at HITL, approve → completed', async () => {
    const llm = makeLlmMock();
    const graph = await createDealMemoGraph(
      llm,
      makeObservability(),
      makeCheckpointer(),
      makeJobsRepo(),
      makeParentStateReader(),
      makeArtifactService(),
    );
    const config = { configurable: { thread_id: 'thread-happy' } };

    // First invoke — should run through to the HITL interrupt and pause.
    const paused = (await graph.invoke(
      initialState,
      config,
    )) as unknown as DealMemoState;

    // All 5 section drafts were populated before the interrupt fired.
    expect(Object.keys(paused.sectionDrafts ?? {})).toHaveLength(5);
    expect(paused.memoMarkdown).toContain(
      '# Deal Memo — Target Inc (Stock Purchase)',
    );
    // Exactly 5 LLM calls, one per section.
    expect(llm.callLLM).toHaveBeenCalledTimes(5);

    // Resume with approve → completed.
    const final = (await graph.invoke(
      new Command({ resume: { decision: 'approve' } }),
      config,
    )) as unknown as DealMemoState;

    expect(final.status).toBe('completed');
    expect(final.memoMarkdown).toContain(
      '# Deal Memo — Target Inc (Stock Purchase)',
    );
    expect(final.resynthesisCount).toBe(0);
    expect(final.completedAt).toBeDefined();
    // LLM was NOT called again on resume (no re-synthesis).
    expect(llm.callLLM).toHaveBeenCalledTimes(5);
  });

  it('reject path: re-runs all 5 sections + synthesis, re-pauses at HITL, then approve finalizes', async () => {
    const llm = makeLlmMock();
    const graph = await createDealMemoGraph(
      llm,
      makeObservability(),
      makeCheckpointer(),
      makeJobsRepo(),
      makeParentStateReader(),
      makeArtifactService(),
    );
    const config = { configurable: { thread_id: 'thread-reject' } };

    // First pause.
    await graph.invoke(initialState, config);
    expect(llm.callLLM).toHaveBeenCalledTimes(5);

    // Reject with feedback → graph resumes, bumps resynthesisCount, routes
    // back to section_reps_warranties so all five sections re-run with the
    // updated reviewerNotes (which the section prompts read), then
    // re-synthesizes and re-pauses at HITL.
    let threw = false;
    try {
      await graph.invoke(
        new Command({
          resume: { decision: 'reject', feedback: 'tighten reps on IP' },
        }),
        config,
      );
    } catch {
      threw = true;
    }
    const state = (await graph.getState(config))
      .values as unknown as DealMemoState;
    expect(state.resynthesisCount).toBe(1);
    expect(state.reviewerNotes ?? '').toContain('tighten reps on IP');
    expect(threw || state.memoMarkdown !== undefined).toBe(true);
    // Reject re-ran the 5 section LLM calls — total now 10.
    expect(llm.callLLM).toHaveBeenCalledTimes(10);

    // Approve the second pass → completed (no further LLM calls).
    const final = (await graph.invoke(
      new Command({ resume: { decision: 'approve' } }),
      config,
    )) as unknown as DealMemoState;

    expect(final.status).toBe('completed');
    expect(final.resynthesisCount).toBe(1);
    expect(llm.callLLM).toHaveBeenCalledTimes(10);
  });

  it('modify path: editedOutputs replace the targeted section; re-synthesized memo contains sentinel', async () => {
    const llm = makeLlmMock();
    const graph = await createDealMemoGraph(
      llm,
      makeObservability(),
      makeCheckpointer(),
      makeJobsRepo(),
      makeParentStateReader(),
      makeArtifactService(),
    );
    const config = { configurable: { thread_id: 'thread-modify' } };

    await graph.invoke(initialState, config);
    const paused = (await graph.getState(config))
      .values as unknown as DealMemoState;
    expect(paused.sectionDrafts?.['reps-warranties'].draft).not.toContain(
      'SENTINEL-MODIFY-42',
    );

    // Modify: overwrite the reps-warranties draft with a sentinel. The
    // graph re-stitches (synthesis is deterministic) and re-pauses at HITL.
    try {
      await graph.invoke(
        new Command({
          resume: {
            decision: 'modify',
            editedOutputs: {
              'reps-warranties': {
                draft: 'SENTINEL-MODIFY-42 Edited reps. [CITE:doc-1]',
                citations: [{ documentId: 'doc-1', excerpt: 'MSA.pdf' }],
              },
            },
          },
        }),
        config,
      );
    } catch {
      // Re-interrupt expected.
    }

    const midState = (await graph.getState(config))
      .values as unknown as DealMemoState;
    expect(midState.sectionDrafts?.['reps-warranties'].draft).toContain(
      'SENTINEL-MODIFY-42',
    );
    expect(midState.memoMarkdown).toContain('SENTINEL-MODIFY-42');
    expect(midState.resynthesisCount).toBe(1);

    const final = (await graph.invoke(
      new Command({ resume: { decision: 'approve' } }),
      config,
    )) as unknown as DealMemoState;
    expect(final.status).toBe('completed');
    expect(final.memoMarkdown).toContain('SENTINEL-MODIFY-42');
  });

  it('re-synthesis cap: second reject after a reject falls through to finalize instead of looping', async () => {
    const llm = makeLlmMock();
    const graph = await createDealMemoGraph(
      llm,
      makeObservability(),
      makeCheckpointer(),
      makeJobsRepo(),
      makeParentStateReader(),
      makeArtifactService(),
    );
    const config = { configurable: { thread_id: 'thread-cap' } };

    await graph.invoke(initialState, config);

    try {
      await graph.invoke(
        new Command({
          resume: { decision: 'reject', feedback: 'first reject' },
        }),
        config,
      );
    } catch {
      // re-pause after first reject
    }
    const afterFirst = (await graph.getState(config))
      .values as unknown as DealMemoState;
    expect(afterFirst.resynthesisCount).toBe(1);

    // Second reject → cap hit → fall through to finalize (no re-pause).
    const final = (await graph.invoke(
      new Command({
        resume: { decision: 'reject', feedback: 'second reject' },
      }),
      config,
    )) as unknown as DealMemoState;

    expect(final.status).toBe('completed');
    // Counter stays at 1 (cap reached; apply_review_decision did not bump).
    expect(final.resynthesisCount).toBe(1);
    // Second reject feedback is NOT appended (cap path returns early).
    expect(final.reviewerNotes ?? '').not.toContain('second reject');
  });
});
