/**
 * Tests for memo-hitl-gate.node.
 *
 * The node calls interrupt() on first entry (throws GraphInterrupt) and
 * returns a decision object on resume. We stub @langchain/langgraph's
 * interrupt to exercise both paths without standing up the whole graph.
 */
import { createMemoHitlGateNode } from './memo-hitl-gate.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';
import type { SectionDraft, SectionId } from '../deal-memo.types';

// Mock interrupt() so we can switch between "first entry throws" and
// "resume returns a decision" on a per-test basis. Cast to the right
// signature so the node's strict type checks still apply.
jest.mock('@langchain/langgraph', () => {
  return {
    interrupt: jest.fn(),
  };
});
import { interrupt } from '@langchain/langgraph';
const interruptMock = interrupt as unknown as jest.Mock;

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

function makeDrafts(): Record<SectionId, SectionDraft> {
  return {
    'reps-warranties': {
      draft: 'reps',
      citations: [{ documentId: 'doc-1', excerpt: 'a' }],
    },
    indemnification: {
      draft: 'indem',
      citations: [{ findingId: 'contract:0', excerpt: 'b' }],
    },
    'disclosure-schedules': {
      draft: 'disc',
      citations: [{ documentId: 'doc-1', excerpt: 'c' }],
    },
    'conditions-precedent': {
      draft: 'cond',
      citations: [{ dealBreakerFlagId: 'db-0', excerpt: 'd' }],
    },
    covenants: {
      draft: 'cov',
      citations: [{ riskRowId: 'contractual:high', excerpt: 'e' }],
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
    dealContext: undefined,
    documentIndex: [],
    perDocumentOutputs: {},
    runningFindings: {},
    riskMatrix: undefined,
    dealBreakerFlags: [],
    missingDocuments: [],
    prunedForBudget: false,
    sectionDrafts: makeDrafts(),
    memoMarkdown: '# Memo\n\n## Body',
    resynthesisCount: 0,
    reviewPayload: undefined,
    lastDecision: undefined,
    artifactPath: undefined,
    docxArtifactPath: undefined,
    status: 'synthesizing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  } as unknown as DealMemoState;
}

function makeObs(): ObservabilityService {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as ObservabilityService;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('memoHitlGateNode', () => {
  beforeEach(() => interruptMock.mockReset());

  it('throws when memoMarkdown is missing (synthesis skipped — graph bug)', async () => {
    const node = createMemoHitlGateNode(makeObs());
    await expect(node(makeState({ memoMarkdown: undefined }))).rejects.toThrow(
      /memo_hitl_gate reached with no memoMarkdown/,
    );
    expect(interruptMock).not.toHaveBeenCalled();
  });

  it('calls interrupt() with the full review payload (gate=deal-memo)', async () => {
    interruptMock.mockImplementation(() => {
      throw new Error('GraphInterrupt simulated');
    });
    const node = createMemoHitlGateNode(makeObs());
    await expect(node(makeState())).rejects.toThrow('GraphInterrupt simulated');

    expect(interruptMock).toHaveBeenCalledTimes(1);
    const payload = interruptMock.mock.calls[0][0];
    expect(payload.gate).toBe('deal-memo');
    expect(payload.dealStructure).toBe('stock-purchase');
    expect(payload.memoMarkdown).toContain('# Memo');
    expect(Object.keys(payload.sectionDrafts).sort()).toEqual([
      'conditions-precedent',
      'covenants',
      'disclosure-schedules',
      'indemnification',
      'reps-warranties',
    ]);
    expect(payload.sectionCitations['indemnification']).toHaveLength(1);
  });

  it('on resume, stores the decision and transitions status to synthesizing', async () => {
    const decision: ReviewDecisionPayload = { decision: 'approve' };
    interruptMock.mockReturnValue(decision);
    const obs = makeObs();
    const node = createMemoHitlGateNode(obs);

    const result = await node(makeState());

    expect(result.lastDecision).toEqual(decision);
    expect(result.status).toBe('synthesizing');
    expect(result.reviewPayload?.gate).toBe('deal-memo');

    const steps = (obs.emitProgress as jest.Mock).mock.calls.map(
      (c) => c[3]?.step,
    );
    expect(steps).toContain('deal_memo_hitl_start');
    expect(steps).toContain('deal_memo_hitl_complete');
  });

  it('propagates reject + modify decisions without mutating the drafts', async () => {
    const decisions: ReviewDecisionPayload[] = [
      { decision: 'reject', feedback: 'tighten reps on IP' },
      {
        decision: 'modify',
        editedOutputs: { repsWarranties: { draft: 'EDITED', citations: [] } },
      },
    ];
    for (const d of decisions) {
      interruptMock.mockReturnValueOnce(d);
      const node = createMemoHitlGateNode(makeObs());
      const st = makeState();
      const before = JSON.stringify(st.sectionDrafts);
      const result = await node(st);
      expect(result.lastDecision).toEqual(d);
      expect(JSON.stringify(st.sectionDrafts)).toBe(before);
    }
  });
});
