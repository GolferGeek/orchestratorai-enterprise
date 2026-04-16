/**
 * Deal Memo Generation — Domain Types.
 *
 * The deal memo workflow consumes a completed Due Diligence Room's findings
 * (via the DD checkpointer snapshot) and drafts an acquisition-agreement memo
 * broken into five standard sections, each citing back to specific DD findings.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1, §4.2
 */

// ── Constants ──────────────────────────────────────────────────────

export const DEAL_MEMO_JOB_TYPE = 'deal-memo-generation';

// ── Inputs ─────────────────────────────────────────────────────────

export type DealStructure = 'stock-purchase' | 'asset-purchase' | 'merger';

/**
 * Persisted shape of a memo job's `input.data`. Carries the parent DD room
 * pointer and the caller-chosen deal structure. Never mutated after enqueue.
 */
export interface DealMemoJobInput {
  parentJobId: string;
  parentConversationId: string;
  dealStructure: DealStructure;
  reviewerNotes?: string;
}

// ── Sections & Citations ───────────────────────────────────────────

export type SectionId =
  | 'reps-warranties'
  | 'indemnification'
  | 'disclosure-schedules'
  | 'conditions-precedent'
  | 'covenants';

/**
 * A citation back to the DD state that informed a drafted clause. At least
 * one of the ID fields should be set — the validator in Phase 2 checks that
 * every ref resolves to a real entry in the hydrated parent state. The
 * `excerpt` is a short quote from the finding for attorney review.
 */
export interface CitationRef {
  findingId?: string;
  documentId?: string;
  riskRowId?: string;
  dealBreakerFlagId?: string;
  excerpt: string;
}

export interface SectionDraft {
  draft: string;
  citations: CitationRef[];
}

// ── Outputs ────────────────────────────────────────────────────────

/**
 * Shape of `result` on a completed memo job row. Phase 3 writes
 * `memoMarkdown` + `sectionCitations`; Phase 4 adds the artifact paths.
 */
export interface DealMemoJobResult {
  memoMarkdown: string;
  sectionCitations: Record<SectionId, CitationRef[]>;
  artifactPath?: string;
  docxArtifactPath?: string;
}

// ── Review payload ─────────────────────────────────────────────────

export interface DealMemoReviewPayload {
  gate: 'deal-memo';
  dealStructure: DealStructure;
  memoMarkdown: string;
  sectionDrafts: Record<SectionId, SectionDraft>;
  sectionCitations: Record<SectionId, CitationRef[]>;
}

// ── Status ─────────────────────────────────────────────────────────

export type DealMemoStatus =
  | 'intake'
  | 'drafting'
  | 'synthesizing'
  | 'awaiting_review'
  | 'finalizing'
  | 'completed'
  | 'failed';
