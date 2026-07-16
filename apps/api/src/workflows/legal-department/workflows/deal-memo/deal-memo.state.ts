/**
 * Deal Memo Generation — State Annotation.
 *
 * Separate from the DD state because the memo workflow reads DD outputs
 * read-only and produces fundamentally different artifacts (drafted
 * contract language, not findings).
 *
 * Hydration fields are populated by the `memo_intake` node from a parent
 * DD Room's checkpoint snapshot. See PRD §4.1 (Architecture) and the
 * intention doc for the list of DD fields this workflow consumes.
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { ReviewDecisionPayload } from '../../jobs/legal-jobs.types';
import type {
  DealContext,
  DocumentIndexEntry,
  RunningFindingsSummary,
  PerDocumentOutput,
  RiskMatrix,
  DealBreakerFlag,
  MissingDocument,
} from '../due-diligence/due-diligence.types';
import type {
  DealMemoReviewPayload,
  DealMemoStatus,
  DealStructure,
  SectionDraft,
  SectionId,
} from './deal-memo.types';

export const DealMemoStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  // ── Execution & inputs ────────────────────────────────────────────
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  /** Parent DD Room job UUID. Read-only reference into law.agent_jobs. */
  parentJobId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  /** Parent DD Room conversation_id — used as the LangGraph thread_id to fetch its checkpoint. */
  parentConversationId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  dealStructure: Annotation<DealStructure>({
    reducer: (_, next) => next,
    default: () => 'stock-purchase',
  }),
  reviewerNotes: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ── Hydrated from parent DD room (read-only) ──────────────────────
  dealContext: Annotation<DealContext | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  documentIndex: Annotation<DocumentIndexEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /**
   * May be replaced with a pruned summaries-only view if the original
   * exceeds the token budget (see PRD §7 risks).
   */
  perDocumentOutputs: Annotation<Record<string, PerDocumentOutput>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  runningFindings: Annotation<Record<string, RunningFindingsSummary>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  riskMatrix: Annotation<RiskMatrix | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  dealBreakerFlags: Annotation<DealBreakerFlag[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  missingDocuments: Annotation<MissingDocument[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /** True when memo_intake pruned perDocumentOutputs to fit the token budget. */
  prunedForBudget: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // ── Section drafts (populated by Phase 2 nodes) ───────────────────
  sectionDrafts: Annotation<Record<SectionId, SectionDraft>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}) as Record<SectionId, SectionDraft>,
  }),

  // ── Synthesis (Phase 3) ───────────────────────────────────────────
  memoMarkdown: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  /** Hard-capped re-synthesis counter to prevent runaway loops (PRD §5). */
  resynthesisCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // ── HITL (Phase 3) ────────────────────────────────────────────────
  reviewPayload: Annotation<DealMemoReviewPayload | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  lastDecision: Annotation<ReviewDecisionPayload | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  /**
   * Transient routing hint set by `apply_review_decision` and consumed
   * by the conditional edge that follows it.
   *   - 'section_reps_warranties' — reject: re-run the five section
   *     nodes with the reviewer's feedback threaded into reviewerNotes
   *     (which the section prompts already read), then re-synthesize.
   *   - 'memo_synthesis' — modify: editedOutputs already replaced the
   *     targeted section drafts; just re-stitch.
   *   - 'memo_finalize' — approve, or the re-synthesis cap has been hit.
   *
   * Kept on state rather than derived in the edge so the routing decision
   * is explicit, testable, and checkpointed alongside the state change
   * that informs it.
   */
  pendingRoute: Annotation<
    'section_reps_warranties' | 'memo_synthesis' | 'memo_finalize' | undefined
  >({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ── Artifacts (Phase 4) ───────────────────────────────────────────
  artifactPath: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  docxArtifactPath: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ── Orchestration ────────────────────────────────────────────────
  status: Annotation<DealMemoStatus>({
    reducer: (_, next) => next,
    default: () => 'intake',
  }),
  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),
  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type DealMemoState = typeof DealMemoStateAnnotation.State;
