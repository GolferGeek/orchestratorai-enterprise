/**
 * Tests for memo-finalize.node.
 *
 * Covers:
 *  - fail-loud guards (missing memoMarkdown / missing section)
 *  - status transition to 'finalizing'
 *  - Phase 4 artifact uploads: MD + DOCX written, paths propagated to state,
 *    storage errors propagate (no silent fallback)
 */
import { createMemoFinalizeNode } from './memo-finalize.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';
import type { SectionDraft, SectionId } from '../deal-memo.types';
import type { DealMemoArtifactService } from '../artifacts/deal-memo-artifact.service';

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
    'reps-warranties': { draft: 'a', citations: [] },
    indemnification: { draft: 'b', citations: [] },
    'disclosure-schedules': { draft: 'c', citations: [] },
    'conditions-precedent': { draft: 'd', citations: [] },
    covenants: { draft: 'e', citations: [] },
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
    memoMarkdown: '# Memo',
    resynthesisCount: 0,
    reviewPayload: undefined,
    lastDecision: { decision: 'approve' },
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

function makeArtifact(
  overrides?: Partial<{
    uploadMemoMarkdown: jest.Mock;
    uploadMemoDocx: jest.Mock;
  }>,
): DealMemoArtifactService {
  return {
    uploadMemoMarkdown:
      overrides?.uploadMemoMarkdown ??
      jest.fn().mockResolvedValue('memo-conv-1/deal-memo.md'),
    uploadMemoDocx:
      overrides?.uploadMemoDocx ??
      jest.fn().mockResolvedValue('memo-conv-1/deal-memo.docx'),
  } as unknown as DealMemoArtifactService;
}

describe('memoFinalizeNode', () => {
  it('transitions status to finalizing on the happy path', async () => {
    const node = createMemoFinalizeNode(makeObs(), makeArtifact());
    const result = await node(makeState());
    expect(result.status).toBe('finalizing');
  });

  it('emits a progress event with step deal_memo_finalize_start', async () => {
    const obs = makeObs();
    const node = createMemoFinalizeNode(obs, makeArtifact());
    await node(makeState());
    const steps = (obs.emitProgress as jest.Mock).mock.calls.map(
      (c) => c[3]?.step,
    );
    expect(steps).toContain('deal_memo_finalize_start');
  });

  it('throws when memoMarkdown is missing', async () => {
    const node = createMemoFinalizeNode(makeObs(), makeArtifact());
    await expect(node(makeState({ memoMarkdown: undefined }))).rejects.toThrow(
      /memo_finalize reached with no memoMarkdown/,
    );
  });

  it('throws when any section draft is missing', async () => {
    const drafts = makeDrafts();
    delete (drafts as Partial<Record<SectionId, SectionDraft>>)[
      'indemnification'
    ];
    const node = createMemoFinalizeNode(makeObs(), makeArtifact());
    await expect(node(makeState({ sectionDrafts: drafts }))).rejects.toThrow(
      /section "indemnification" is missing/,
    );
  });

  it('uploads MD + DOCX and returns both paths on state', async () => {
    const uploadMd = jest.fn().mockResolvedValue('memo-conv-1/deal-memo.md');
    const uploadDocx = jest
      .fn()
      .mockResolvedValue('memo-conv-1/deal-memo.docx');
    const artifactService = makeArtifact({
      uploadMemoMarkdown: uploadMd,
      uploadMemoDocx: uploadDocx,
    });
    const node = createMemoFinalizeNode(makeObs(), artifactService);
    const result = await node(makeState({ memoMarkdown: '# Deal Memo' }));

    expect(uploadMd).toHaveBeenCalledWith('memo-conv-1', '# Deal Memo');
    expect(uploadDocx).toHaveBeenCalledWith('memo-conv-1', '# Deal Memo');
    expect(result.artifactPath).toBe('memo-conv-1/deal-memo.md');
    expect(result.docxArtifactPath).toBe('memo-conv-1/deal-memo.docx');
  });

  it('emits a second progress event once artifacts are persisted', async () => {
    const obs = makeObs();
    const node = createMemoFinalizeNode(obs, makeArtifact());
    await node(makeState());
    const steps = (obs.emitProgress as jest.Mock).mock.calls.map(
      (c) => c[3]?.step,
    );
    expect(steps).toContain('deal_memo_finalize_artifacts');
  });

  it('propagates MD upload failures without setting a path', async () => {
    const artifactService = makeArtifact({
      uploadMemoMarkdown: jest
        .fn()
        .mockRejectedValue(new Error('bucket offline')),
    });
    const node = createMemoFinalizeNode(makeObs(), artifactService);
    await expect(node(makeState())).rejects.toThrow(/bucket offline/);
  });

  it('propagates DOCX conversion failures without setting a path', async () => {
    const artifactService = makeArtifact({
      uploadMemoDocx: jest
        .fn()
        .mockRejectedValue(new Error('docx conversion failed')),
    });
    const node = createMemoFinalizeNode(makeObs(), artifactService);
    await expect(node(makeState())).rejects.toThrow(/docx conversion failed/);
  });
});
