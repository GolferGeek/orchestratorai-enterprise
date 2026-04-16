/**
 * Tests for the deterministic memo-synthesis node.
 *
 * Covers:
 *   - Successful stitch producing a markdown memo with all 5 section headers.
 *   - Fail-loud when any section draft is missing.
 *   - Fail-loud when a section carries an unresolved citation (modify-path
 *     safety net).
 *   - References appendix enumerates every unique cited id.
 *   - applyModifyEdits merges reviewer edits into the drafts map.
 */
import {
  createMemoSynthesisNode,
  applyModifyEdits,
} from './memo-synthesis.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';
import type {
  DocumentIndexEntry,
  RunningFindingsSummary,
  RiskMatrix,
  DealBreakerFlag,
  DealContext,
} from '../../due-diligence/due-diligence.types';
import type { CitationRef, SectionDraft, SectionId } from '../deal-memo.types';

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
  dealValueRange: '$100M-$200M',
  jurisdictions: ['DE'],
  focusAreas: ['IP'],
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

const findingCite: CitationRef = {
  findingId: 'contract:0',
  excerpt: 'Change of control',
};
const documentCite: CitationRef = { documentId: 'doc-1', excerpt: 'MSA' };
const riskCite: CitationRef = {
  riskRowId: 'contractual:high',
  excerpt: 'contractual:high',
};
const dbCite: CitationRef = {
  dealBreakerFlagId: 'db-0',
  excerpt: 'Change-of-control blocker',
};

function makeDrafts(): Record<SectionId, SectionDraft> {
  return {
    'reps-warranties': {
      draft: '1. Organization. Target is a DE corp. [CITE:doc-1]',
      citations: [documentCite],
    },
    indemnification: {
      draft: '1. General. [CITE:contract:0]',
      citations: [findingCite],
    },
    'disclosure-schedules': {
      draft: '1. Schedule A. [CITE:doc-1]',
      citations: [documentCite],
    },
    'conditions-precedent': {
      draft: '1. Resolution of deal-breaker. [CITE:db-0]',
      citations: [dbCite],
    },
    covenants: {
      draft: '1. Ordinary course. [CITE:contractual:high]',
      citations: [riskCite],
    },
  };
}

function makeState(overrides?: Partial<DealMemoState>): DealMemoState {
  return {
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
    sectionDrafts: makeDrafts(),
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
    ...overrides,
  } as unknown as DealMemoState;
}

function makeObservabilityDouble(): ObservabilityService {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as ObservabilityService;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('memoSynthesisNode (deterministic stitch)', () => {
  it('produces a markdown memo with all five section headers in order', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);

    const result = await node(makeState());

    expect(result.status).toBe('synthesizing');
    expect(result.memoMarkdown).toBeDefined();
    const md = result.memoMarkdown!;

    expect(md).toContain('# Deal Memo — Target Inc (Stock Purchase)');
    expect(md).toContain('## 1. Representations & Warranties');
    expect(md).toContain('## 2. Indemnification');
    expect(md).toContain('## 3. Disclosure Schedules');
    expect(md).toContain('## 4. Conditions Precedent to Closing');
    expect(md).toContain('## 5. Covenants');
    expect(md).toContain('## References');

    // Section order must match SECTION_ORDER
    const repsIdx = md.indexOf('## 1. Representations');
    const indemIdx = md.indexOf('## 2. Indemnification');
    const discIdx = md.indexOf('## 3. Disclosure');
    const condIdx = md.indexOf('## 4. Conditions');
    const covIdx = md.indexOf('## 5. Covenants');
    expect(repsIdx).toBeLessThan(indemIdx);
    expect(indemIdx).toBeLessThan(discIdx);
    expect(discIdx).toBeLessThan(condIdx);
    expect(condIdx).toBeLessThan(covIdx);
  });

  it('includes deal context overview when dealContext is present', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    const result = await node(makeState());
    const md = result.memoMarkdown!;
    expect(md).toContain('**Target:** Target Inc');
    expect(md).toContain('**Buyer:** Buyer Inc');
    expect(md).toContain('**Deal value:** $100M-$200M');
    expect(md).toContain('**Jurisdictions:** DE');
    expect(md).toContain('**Focus areas:** IP');
  });

  it('references appendix lists every unique cited id', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    const result = await node(makeState());
    const md = result.memoMarkdown!;
    expect(md).toContain('### Findings');
    expect(md).toContain('`contract:0`');
    expect(md).toContain('### Documents');
    expect(md).toContain('`doc-1`');
    expect(md).toContain('### Risk Matrix Cells');
    expect(md).toContain('`contractual:high`');
    expect(md).toContain('### Deal-Breaker Flags');
    expect(md).toContain('`db-0`');
  });

  it('throws when any section draft is missing (graph-wiring bug)', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    const drafts = makeDrafts();
    delete (drafts as Partial<Record<SectionId, SectionDraft>>)[
      'conditions-precedent'
    ];

    await expect(node(makeState({ sectionDrafts: drafts }))).rejects.toThrow(
      /memo_synthesis called before all section drafts were populated/,
    );
  });

  it('throws CitationValidationError when a reviewer edit fabricates an id', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    const drafts = makeDrafts();
    drafts['indemnification'] = {
      draft: '1. General. [CITE:fake:99]',
      citations: [{ findingId: 'fake:99', excerpt: 'fabricated' }],
    };

    await expect(node(makeState({ sectionDrafts: drafts }))).rejects.toThrow(
      /Citation validation failed for section "indemnification"/,
    );
  });

  it('emits synthesis_start + synthesis_complete progress events', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    await node(makeState());
    const emitProgress = obs.emitProgress as jest.Mock;
    const steps = emitProgress.mock.calls.map((c) => c[3]?.step);
    expect(steps).toContain('deal_memo_synthesis_start');
    expect(steps).toContain('deal_memo_synthesis_complete');
  });

  it('handles missing dealContext by omitting the Overview section', async () => {
    const obs = makeObservabilityDouble();
    const node = createMemoSynthesisNode(obs);
    const result = await node(makeState({ dealContext: undefined }));
    const md = result.memoMarkdown!;
    expect(md).toContain('# Deal Memo — Stock Purchase');
    expect(md).not.toContain('## Overview');
  });

  it('merges in-draft edits via applyModifyEdits with the expected section keys', () => {
    const currentDrafts = makeDrafts();
    const edited = applyModifyEdits(currentDrafts, {
      // camelCase key variant the UI might send
      repsWarranties: {
        draft: 'EDITED REPS',
        citations: [{ documentId: 'doc-1', excerpt: 'MSA' }],
      },
      // legacy kebab variant
      'conditions-precedent': {
        draft: 'EDITED COND',
        citations: [{ dealBreakerFlagId: 'db-0', excerpt: 'db' }],
      },
    });
    expect(edited['reps-warranties'].draft).toBe('EDITED REPS');
    expect(edited['conditions-precedent'].draft).toBe('EDITED COND');
    // Other sections are preserved
    expect(edited['indemnification']).toEqual(currentDrafts['indemnification']);
    expect(edited['covenants']).toEqual(currentDrafts['covenants']);
  });

  it('applyModifyEdits ignores unknown keys and malformed entries', () => {
    const currentDrafts = makeDrafts();
    const edited = applyModifyEdits(currentDrafts, {
      bogusSection: { draft: 'ignore me', citations: [] },
      indemnification: { draft: null, citations: null },
      covenants: 'not an object',
    } as unknown as Record<string, unknown>);
    expect(edited).toEqual(currentDrafts);
  });
});
