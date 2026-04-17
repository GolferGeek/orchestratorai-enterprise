import {
  createMemoIntakeNode,
  type ParentDDSnapshot,
} from './memo-intake.node';
import type { DealMemoState } from '../deal-memo.state';
import type { AgentJobRow } from '../../../jobs/legal-jobs.types';
import type {
  DealContext,
  DocumentIndexEntry,
  RunningFindingsSummary,
  PerDocumentOutput,
  RiskMatrix,
  DealBreakerFlag,
} from '../../due-diligence/due-diligence.types';

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

const baseState = {
  executionContext: ctx,
  parentJobId: 'dd-job-1',
  parentConversationId: 'dd-conv-1',
  dealStructure: 'stock-purchase',
  reviewerNotes: undefined,
  dealContext: undefined,
  documentIndex: [],
  perDocumentOutputs: {},
  runningFindings: {},
  riskMatrix: undefined,
  dealBreakerFlags: [],
  missingDocuments: [],
  prunedForBudget: false,
  sectionDrafts: {},
  memoMarkdown: undefined,
  resynthesisCount: 0,
  reviewPayload: undefined,
  lastDecision: undefined,
  artifactPath: undefined,
  docxArtifactPath: undefined,
  status: 'intake',
  error: undefined,
  startedAt: Date.now(),
  completedAt: undefined,
  messages: [],
} as unknown as DealMemoState;

function makeParentRow(overrides: Partial<AgentJobRow> = {}): AgentJobRow {
  return {
    id: 'dd-job-1',
    org_slug: 'acme',
    user_id: 'user-1',
    conversation_id: 'dd-conv-1',
    agent_slug: 'legal-department',
    job_type: 'document-analysis', // DB column; real type lives in metadata
    provider: 'local',
    model: 'gemma3:e4b',
    status: 'completed',
    current_step: null,
    progress: 100,
    last_message: null,
    error: null,
    input: { data: {}, metadata: { jobType: 'due-diligence' } },
    result: { response: 'done' },
    original_file_path: null,
    document_paths: [],
    document_count: 3,
    review_decision: null,
    access_control: { mode: 'open' },
    queued_at: new Date().toISOString(),
    started_at: null,
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

const sampleDealContext: DealContext = {
  transactionType: 'acquisition',
  targetCompany: 'Target Co',
  buyerCompany: 'Buyer Co',
  jurisdictions: ['Delaware'],
  focusAreas: ['IP', 'Employment'],
  knownIssues: [],
};

const sampleDocIndex: DocumentIndexEntry[] = [
  {
    documentId: 'doc-1',
    name: 'Master Services Agreement.pdf',
    documentType: 'contract',
    parties: ['Target Co', 'Vendor A'],
    date: '2024-01-15',
    summary: 'MSA with vendor A',
    riskScore: 6,
    status: 'complete',
    specialistsAssigned: ['ip', 'contracts'],
    specialistsCompleted: ['ip', 'contracts'],
  },
];

const samplePerDoc: Record<string, PerDocumentOutput> = {
  'doc-1': {
    routingDecision: {
      selectedSpecialists: ['ip', 'contracts'],
      reasoning: 'matched IP terms',
    } as unknown as PerDocumentOutput['routingDecision'],
    specialistOutputs: {
      ip: { risk: 'IP assignment clause is missing' },
    },
  },
};

const sampleRunningFindings: Record<string, RunningFindingsSummary> = {
  ip: {
    specialistKey: 'ip',
    documentCount: 1,
    keyFindings: [
      {
        documentId: 'doc-1',
        documentName: 'Master Services Agreement.pdf',
        finding: 'Missing IP assignment',
        severity: 'high',
        category: 'ip',
      },
    ],
    crossReferences: [],
    cumulativeRisks: ['IP ownership ambiguity'],
  },
};

const sampleRiskMatrix: RiskMatrix = {
  cells: [
    {
      category: 'ip',
      severity: 'high',
      count: 1,
      documentRefs: [
        {
          documentId: 'doc-1',
          documentName: 'Master Services Agreement.pdf',
          finding: 'Missing IP assignment',
        },
      ],
    },
  ],
};

const sampleDealBreakers: DealBreakerFlag[] = [];

function makeSnapshot(
  overrides: Partial<ParentDDSnapshot> = {},
): ParentDDSnapshot {
  return {
    dealContext: sampleDealContext,
    documentIndex: sampleDocIndex,
    perDocumentOutputs: samplePerDoc,
    runningFindings: sampleRunningFindings,
    riskMatrix: sampleRiskMatrix,
    dealBreakerFlags: sampleDealBreakers,
    missingDocuments: [],
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────

function makeDeps(
  parentRow: AgentJobRow | null,
  snapshot: ParentDDSnapshot | null,
  maxChars?: number,
) {
  const observability = {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as any;

  const jobsRepository = {
    findByIdForOrg: jest.fn().mockResolvedValue(parentRow),
  } as any;

  const getParentState = jest.fn().mockResolvedValue(snapshot);

  const node = createMemoIntakeNode(
    observability,
    jobsRepository,
    getParentState,
    maxChars ? { maxChars } : {},
  );

  return { observability, jobsRepository, getParentState, node };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('memo_intake node', () => {
  it('hydrates state from a completed DD room snapshot', async () => {
    const { node, jobsRepository, getParentState } = makeDeps(
      makeParentRow(),
      makeSnapshot(),
    );

    const result = await node(baseState);

    expect(jobsRepository.findByIdForOrg).toHaveBeenCalledWith(
      'dd-job-1',
      'acme',
    );
    expect(getParentState).toHaveBeenCalledWith('dd-conv-1');
    expect(result.dealContext).toEqual(sampleDealContext);
    expect(result.documentIndex).toEqual(sampleDocIndex);
    expect(result.perDocumentOutputs).toEqual(samplePerDoc);
    expect(result.runningFindings).toEqual(sampleRunningFindings);
    expect(result.riskMatrix).toEqual(sampleRiskMatrix);
    expect(result.dealBreakerFlags).toEqual([]);
    expect(result.missingDocuments).toEqual([]);
    expect(result.prunedForBudget).toBe(false);
    expect(result.status).toBe('drafting');
  });

  it('throws when parentJobId is empty', async () => {
    const { node } = makeDeps(makeParentRow(), makeSnapshot());
    await expect(
      node({ ...baseState, parentJobId: '' } as DealMemoState),
    ).rejects.toThrow(/parentJobId is empty/);
  });

  it('throws when parentConversationId is empty', async () => {
    const { node } = makeDeps(makeParentRow(), makeSnapshot());
    await expect(
      node({ ...baseState, parentConversationId: '' } as DealMemoState),
    ).rejects.toThrow(/parentConversationId is empty/);
  });

  it('throws when parent job is missing', async () => {
    const { node } = makeDeps(null, makeSnapshot());
    await expect(node(baseState)).rejects.toThrow(
      /parent DD job dd-job-1 not found in org acme/,
    );
  });

  it('throws when parent job is not a due-diligence room', async () => {
    const nonDD = makeParentRow({
      input: { data: {}, metadata: { jobType: 'legal-research' } },
    });
    const { node } = makeDeps(nonDD, makeSnapshot());
    await expect(node(baseState)).rejects.toThrow(
      /is not a due-diligence room/,
    );
  });

  it('throws when parent job is not completed', async () => {
    const inProgress = makeParentRow({ status: 'processing' });
    const { node } = makeDeps(inProgress, makeSnapshot());
    await expect(node(baseState)).rejects.toThrow(
      /must be status=completed.*found status=processing/,
    );
  });

  it('throws when parent conversation_id does not match input', async () => {
    const mismatched = makeParentRow({ conversation_id: 'different-conv' });
    const { node } = makeDeps(mismatched, makeSnapshot());
    await expect(node(baseState)).rejects.toThrow(
      /parentConversationId mismatch/,
    );
  });

  it('throws when checkpoint snapshot is missing', async () => {
    const { node } = makeDeps(makeParentRow(), null);
    await expect(node(baseState)).rejects.toThrow(
      /no checkpoint snapshot for parent conversation/,
    );
  });

  it('throws when snapshot is missing dealContext', async () => {
    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({ dealContext: undefined }),
    );
    await expect(node(baseState)).rejects.toThrow(/missing dealContext/);
  });

  it('throws when snapshot has empty documentIndex', async () => {
    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({ documentIndex: [] }),
    );
    await expect(node(baseState)).rejects.toThrow(/empty documentIndex/);
  });

  it('throws when snapshot is missing perDocumentOutputs', async () => {
    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({ perDocumentOutputs: {} }),
    );
    await expect(node(baseState)).rejects.toThrow(/missing perDocumentOutputs/);
  });

  it('throws when snapshot is missing runningFindings', async () => {
    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({ runningFindings: undefined }),
    );
    await expect(node(baseState)).rejects.toThrow(/missing runningFindings/);
  });

  it('throws when snapshot is missing riskMatrix', async () => {
    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({ riskMatrix: undefined }),
    );
    await expect(node(baseState)).rejects.toThrow(/missing riskMatrix/);
  });

  it('prunes perDocumentOutputs when over budget and marks prunedForBudget=true', async () => {
    // Build a large per-doc map to exceed a tight budget
    const bigOutputs: Record<string, PerDocumentOutput> = {};
    for (let i = 0; i < 20; i++) {
      bigOutputs[`doc-${i}`] = {
        routingDecision: {
          selectedSpecialists: ['ip', 'contracts'],
          reasoning: 'x',
        } as unknown as PerDocumentOutput['routingDecision'],
        specialistOutputs: {
          ip: { details: 'A'.repeat(5_000) },
          contracts: { details: 'B'.repeat(5_000) },
        },
      };
    }
    const bigIndex = Array.from({ length: 20 }, (_, i) => ({
      ...sampleDocIndex[0]!,
      documentId: `doc-${i}`,
    }));

    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({
        perDocumentOutputs: bigOutputs,
        documentIndex: bigIndex,
      }),
      // Tight budget that forces pruning but lets the pruned view fit
      50_000,
    );

    const result = await node(baseState);

    expect(result.prunedForBudget).toBe(true);
    // Pruned output preserves routingDecision and flags the prune
    const pruned = result.perDocumentOutputs as Record<
      string,
      PerDocumentOutput
    >;
    expect(pruned['doc-0']!.specialistOutputs).toMatchObject({
      _pruned: true,
      _specialistCount: 2,
    });
  });

  it('throws when hydrated state is still over budget after pruning', async () => {
    // Make runningFindings huge so pruning (which only touches
    // perDocumentOutputs) cannot save us. This exercises the
    // "still over budget after pruning" failure path.
    const hugeRunningFindings: Record<string, RunningFindingsSummary> = {};
    for (let i = 0; i < 500; i++) {
      hugeRunningFindings[`specialist-${i}`] = {
        specialistKey: `specialist-${i}`,
        documentCount: 1,
        keyFindings: [
          {
            documentId: 'doc-1',
            documentName: 'Master Services Agreement.pdf',
            finding: 'X'.repeat(500),
            severity: 'high',
            category: 'ip',
          },
        ],
        crossReferences: [],
        cumulativeRisks: [],
      };
    }

    // Also push per-doc over threshold so we hit the prune path before failing.
    const bigOutputs: Record<string, PerDocumentOutput> = {};
    for (let i = 0; i < 10; i++) {
      bigOutputs[`doc-${i}`] = {
        routingDecision: {
          selectedSpecialists: ['ip'],
          reasoning: 'r',
        } as unknown as PerDocumentOutput['routingDecision'],
        specialistOutputs: { ip: { details: 'A'.repeat(5_000) } },
      };
    }

    const { node } = makeDeps(
      makeParentRow(),
      makeSnapshot({
        runningFindings: hugeRunningFindings,
        perDocumentOutputs: bigOutputs,
      }),
      50_000,
    );

    await expect(node(baseState)).rejects.toThrow(
      /hydrated parent state is \d+ chars even after pruning/,
    );
  });
});
