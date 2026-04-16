/**
 * DealMemoWorkspaceView — logic specs
 *
 * Same pattern as the other legal-department modal specs: rather than mount
 * the full Ionic page (browser bootstrap required), we test the pure logic
 * the workspace runs:
 *   - tab list shape (5 sections + Full Memo)
 *   - stage derivation from observability events (intake → 5 sections →
 *     synthesis → review → finalize)
 *   - download-button gating (enabled only on completed)
 *   - citation resolution against parent DD index / risk matrix / deal-breakers
 *
 * The helpers below mirror the in-component logic — keep them in sync.
 */

import { describe, it, expect } from 'vitest';
import type { CitationRef, ObservabilityEvent } from '../../legalJobsService';

// ── TABS ──────────────────────────────────────────────────────────────────────

const SECTION_IDS = [
  'reps-warranties',
  'indemnification',
  'disclosure-schedules',
  'conditions-precedent',
  'covenants',
] as const;

const TABS = [
  ...SECTION_IDS.map((id) => ({ id, label: id })),
  { id: 'full-memo', label: 'Full Memo' },
];

describe('Deal memo workspace tabs', () => {
  it('exposes one tab per section plus a Full Memo tab', () => {
    expect(TABS).toHaveLength(6);
    expect(TABS.map((t) => t.id)).toEqual([
      'reps-warranties',
      'indemnification',
      'disclosure-schedules',
      'conditions-precedent',
      'covenants',
      'full-memo',
    ]);
  });
});

// ── Stage derivation ──────────────────────────────────────────────────────────

interface MemoStage {
  id: string;
  startStep?: string;
  completeStep?: string;
  isReview?: boolean;
}

const STAGE_DEFS: MemoStage[] = [
  {
    id: 'intake',
    startStep: 'deal_memo_intake_start',
    completeStep: 'deal_memo_intake_complete',
  },
  {
    id: 'reps-warranties',
    startStep: 'deal_memo_section_reps_warranties_start',
    completeStep: 'deal_memo_section_reps_warranties_complete',
  },
  {
    id: 'indemnification',
    startStep: 'deal_memo_section_indemnification_start',
    completeStep: 'deal_memo_section_indemnification_complete',
  },
  {
    id: 'disclosure-schedules',
    startStep: 'deal_memo_section_disclosure_schedules_start',
    completeStep: 'deal_memo_section_disclosure_schedules_complete',
  },
  {
    id: 'conditions-precedent',
    startStep: 'deal_memo_section_conditions_precedent_start',
    completeStep: 'deal_memo_section_conditions_precedent_complete',
  },
  {
    id: 'covenants',
    startStep: 'deal_memo_section_covenants_start',
    completeStep: 'deal_memo_section_covenants_complete',
  },
  {
    id: 'synthesize',
    startStep: 'deal_memo_synthesis_start',
    completeStep: 'deal_memo_synthesis_complete',
  },
  {
    id: 'review',
    startStep: 'deal_memo_hitl_start',
    completeStep: 'deal_memo_hitl_complete',
    isReview: true,
  },
  {
    id: 'finalize',
    startStep: 'deal_memo_finalize_start',
    completeStep: 'deal_memo_finalize_artifacts',
  },
];

type StateName = 'pending' | 'active' | 'done' | 'failed';

function deriveStages(
  events: ObservabilityEvent[],
  status: string,
): Array<{ id: string; state: StateName }> {
  const startedSteps = new Set<string>();
  const completedSteps = new Set<string>();
  for (const ev of events) {
    const step = ev.step ?? '';
    if (!step) continue;
    if (step.endsWith('_start')) startedSteps.add(step);
    if (step.endsWith('_complete') || step.endsWith('_artifacts'))
      completedSteps.add(step);
  }

  const failedTerminal = status === 'failed';
  const firstNonDoneIdx = STAGE_DEFS.findIndex(
    (s) => !(s.completeStep && completedSteps.has(s.completeStep)),
  );

  return STAGE_DEFS.map((stage, idx) => {
    const startSeen = !!stage.startStep && startedSteps.has(stage.startStep);
    const completeSeen =
      !!stage.completeStep && completedSteps.has(stage.completeStep);

    let state: StateName = 'pending';
    if (completeSeen) state = 'done';
    else if (startSeen) state = 'active';

    if (stage.isReview) {
      if (status === 'awaiting_review') state = 'active';
      else if (
        completeSeen ||
        STAGE_DEFS.slice(idx + 1).some(
          (s) => s.completeStep && completedSteps.has(s.completeStep),
        )
      )
        state = 'done';
    }

    if (failedTerminal && state !== 'done' && idx === firstNonDoneIdx) {
      state = 'failed';
    }

    return { id: stage.id, state };
  });
}

function ev(step: string): ObservabilityEvent {
  return {
    hook_event_type: 'agent.progress',
    step,
    created_at: new Date().toISOString(),
  };
}

describe('deriveStages', () => {
  it('returns nine stages in the expected order', () => {
    const stages = deriveStages([], 'queued');
    expect(stages.map((s) => s.id)).toEqual([
      'intake',
      'reps-warranties',
      'indemnification',
      'disclosure-schedules',
      'conditions-precedent',
      'covenants',
      'synthesize',
      'review',
      'finalize',
    ]);
  });

  it('marks intake active when intake_start has been seen', () => {
    const stages = deriveStages([ev('deal_memo_intake_start')], 'processing');
    expect(stages.find((s) => s.id === 'intake')?.state).toBe('active');
  });

  it('marks intake done after intake_complete and reps active after reps_start', () => {
    const stages = deriveStages(
      [
        ev('deal_memo_intake_start'),
        ev('deal_memo_intake_complete'),
        ev('deal_memo_section_reps_warranties_start'),
      ],
      'processing',
    );
    expect(stages.find((s) => s.id === 'intake')?.state).toBe('done');
    expect(stages.find((s) => s.id === 'reps-warranties')?.state).toBe(
      'active',
    );
  });

  it('marks review active when status is awaiting_review', () => {
    const stages = deriveStages([], 'awaiting_review');
    expect(stages.find((s) => s.id === 'review')?.state).toBe('active');
  });

  it('marks review done once finalize_artifacts has fired', () => {
    const stages = deriveStages(
      [ev('deal_memo_hitl_start'), ev('deal_memo_finalize_artifacts')],
      'completed',
    );
    expect(stages.find((s) => s.id === 'review')?.state).toBe('done');
  });

  it('marks finalize done when finalize_artifacts is the latest event', () => {
    const stages = deriveStages(
      [
        ev('deal_memo_finalize_start'),
        ev('deal_memo_finalize_artifacts'),
      ],
      'completed',
    );
    expect(stages.find((s) => s.id === 'finalize')?.state).toBe('done');
  });

  it('marks the first non-done stage as failed when status is failed', () => {
    // Intake done, then a section started but the job failed midway.
    const stages = deriveStages(
      [
        ev('deal_memo_intake_start'),
        ev('deal_memo_intake_complete'),
        ev('deal_memo_section_reps_warranties_start'),
      ],
      'failed',
    );
    expect(stages.find((s) => s.id === 'intake')?.state).toBe('done');
    expect(stages.find((s) => s.id === 'reps-warranties')?.state).toBe(
      'failed',
    );
    // Subsequent stages stay pending — not failed.
    expect(stages.find((s) => s.id === 'indemnification')?.state).toBe(
      'pending',
    );
  });
});

// ── Download-button gating ────────────────────────────────────────────────────

function downloadEnabled(memoStatus: string, downloading: 'md' | 'docx' | null) {
  return memoStatus === 'completed' && downloading === null;
}

describe('Download button gating', () => {
  it('is enabled only on completed and not currently downloading', () => {
    expect(downloadEnabled('completed', null)).toBe(true);
  });

  it('is disabled while a download is in flight', () => {
    expect(downloadEnabled('completed', 'md')).toBe(false);
  });

  it.each(['queued', 'processing', 'awaiting_review', 'failed'])(
    'is disabled when status is %s',
    (status) => {
      expect(downloadEnabled(status, null)).toBe(false);
    },
  );
});

// ── Citation resolution ───────────────────────────────────────────────────────

interface ResolvedCitation {
  kind: string;
  id: string;
  label?: string;
  excerpt: string;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function resolveCitation(
  c: CitationRef,
  documents: Array<Record<string, unknown>>,
  riskCells: Array<Record<string, unknown>>,
  dealBreakers: Array<Record<string, unknown>>,
): ResolvedCitation {
  const docMap: Record<string, Record<string, unknown>> = {};
  for (const d of documents) {
    const id = getString(d.documentId) ?? getString(d.id);
    if (id) docMap[id] = d;
  }
  const riskMap: Record<string, Record<string, unknown>> = {};
  for (const r of riskCells) {
    const id = getString(r.id) ?? getString(r.riskRowId);
    if (id) riskMap[id] = r;
  }
  const dbMap: Record<string, Record<string, unknown>> = {};
  for (const f of dealBreakers) {
    const id = getString(f.id) ?? getString(f.dealBreakerFlagId);
    if (id) dbMap[id] = f;
  }
  if (c.dealBreakerFlagId)
    return {
      kind: 'dealbreaker',
      id: c.dealBreakerFlagId,
      label: getString(dbMap[c.dealBreakerFlagId]?.title) ?? c.dealBreakerFlagId,
      excerpt: c.excerpt,
    };
  if (c.riskRowId)
    return {
      kind: 'risk',
      id: c.riskRowId,
      label: getString(riskMap[c.riskRowId]?.category) ?? c.riskRowId,
      excerpt: c.excerpt,
    };
  if (c.findingId)
    return { kind: 'finding', id: c.findingId, label: c.findingId, excerpt: c.excerpt };
  if (c.documentId)
    return {
      kind: 'document',
      id: c.documentId,
      label:
        getString(docMap[c.documentId]?.documentName) ??
        getString(docMap[c.documentId]?.name) ??
        c.documentId,
      excerpt: c.excerpt,
    };
  return { kind: 'unknown', id: '', excerpt: c.excerpt };
}

describe('CitationsRail resolveCitation', () => {
  it('resolves a deal-breaker citation to its title', () => {
    const r = resolveCitation(
      { dealBreakerFlagId: 'db-1', excerpt: 'IP litigation pending' },
      [],
      [],
      [{ id: 'db-1', title: 'Open IP lawsuit' }],
    );
    expect(r.kind).toBe('dealbreaker');
    expect(r.label).toBe('Open IP lawsuit');
  });

  it('resolves a document citation to its document name', () => {
    const r = resolveCitation(
      { documentId: 'doc-7', excerpt: 'See section 4' },
      [{ documentId: 'doc-7', documentName: 'Stock Purchase Agreement' }],
      [],
      [],
    );
    expect(r.kind).toBe('document');
    expect(r.label).toBe('Stock Purchase Agreement');
  });

  it('resolves a risk row citation to its category', () => {
    const r = resolveCitation(
      { riskRowId: 'risk-3', excerpt: 'Counterparty risk' },
      [],
      [{ id: 'risk-3', category: 'Counterparty Default' }],
      [],
    );
    expect(r.kind).toBe('risk');
    expect(r.label).toBe('Counterparty Default');
  });

  it('falls back to the raw findingId when no resolver matches', () => {
    const r = resolveCitation(
      { findingId: 'unknown-finding', excerpt: 'see notes' },
      [],
      [],
      [],
    );
    expect(r.kind).toBe('finding');
    expect(r.id).toBe('unknown-finding');
  });

  it('returns unknown kind when nothing on the ref resolves', () => {
    const r = resolveCitation({ excerpt: 'orphan' }, [], [], []);
    expect(r.kind).toBe('unknown');
    expect(r.excerpt).toBe('orphan');
  });
});
