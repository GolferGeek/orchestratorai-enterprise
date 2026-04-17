/**
 * Discovery Document Review — State Annotation.
 *
 * All fields in the PRD §4.2 state table. Pattern matches DueDiligenceStateAnnotation:
 * - Scalars use `(_, next) => next` reducer (replace on every update).
 * - Accumulator records use `(prev, next) => ({ ...prev, ...next })` so per-document
 *   coding results can be merged one entry at a time without clobbering prior entries.
 *
 * See: docs/efforts/current/discovery-document-review/prd.md §4.2
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ReviewProtocol,
  DocumentCoding,
  ReviewBatch,
  BatchReviewDecisionPayload,
  DocumentIndexEntry,
  ReviewStatistics,
  PrivilegeLogEntry,
  DiscoveryReviewStatus,
} from './discovery-review.types';

// ── State Annotation ────────────────────────────────────────────────────────

export const DiscoveryReviewStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  // ── Execution Context ──────────────────────────────────────────────────
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

  // ── Review Protocol (set at job creation) ─────────────────────────────
  reviewProtocol: Annotation<ReviewProtocol>({
    reducer: (_, next) => next,
    default: () => ({
      matterId: '',
      matterName: '',
      relevanceCriteria: {
        claims: [],
        keyParties: [],
        keyTopics: [],
      },
      privilegeHolders: {
        attorneys: [],
        firms: [],
        inHouseCounsel: [],
      },
      issueTags: [],
      batchSize: 50,
      confidenceThreshold: 0.7,
      privilegeReviewRequired: true,
    }),
  }),

  // ── Document Management ────────────────────────────────────────────────
  /**
   * Ingested documents with extracted text. Populated by ingest.node.ts.
   * Array index aligns with documentIndex entries.
   */
  documents: Annotation<
    Array<{
      documentId: string;
      name: string;
      content: string;
      mimeType?: string;
      sizeBytes: number;
    }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Classification metadata per document. Populated by classify-all.node.ts. */
  documentIndex: Annotation<DocumentIndexEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Dispatcher State ───────────────────────────────────────────────────
  /** Document IDs not yet through the coding pipeline. */
  documentQueue: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Document IDs that completed the coding pipeline successfully. */
  documentsCoded: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /**
   * Document IDs that failed at any stage, mapped to error message.
   * Uses an accumulator reducer so failures from different nodes merge
   * without overwriting each other.
   * No fallbacks: documents that fail are always logged here — never silently dropped.
   */
  documentsFailed: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // ── Coding Results ─────────────────────────────────────────────────────
  /**
   * Per-document coding results, keyed by documentId.
   * Uses an accumulator reducer: each document's coding is merged one entry
   * at a time by code-document.node.ts.
   */
  documentCodings: Annotation<Record<string, DocumentCoding>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // ── HITL Batch Review ──────────────────────────────────────────────────
  /** Review batches prepared by build-batches.node.ts (Phase 3). */
  reviewBatches: Annotation<ReviewBatch[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /**
   * Reviewer decisions per batch, keyed by batchId.
   * Uses accumulator so each batch decision persists independently.
   */
  batchDecisions: Annotation<Record<string, BatchReviewDecisionPayload>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  /**
   * Calibration adjustments detected from reviewer corrections (Phase 3).
   * Each entry is a human-readable description of the adjustment.
   */
  calibrationAdjustments: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ── Production Outputs (Phase 4) ───────────────────────────────────────
  /**
   * Final production set: document IDs that are relevant AND not privileged
   * after reviewer corrections. Optionally Bates-numbered.
   */
  productionSet: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Privilege log entries for all withheld documents. */
  privilegeLog: Annotation<PrivilegeLogEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Aggregate review statistics. Incrementally updated during coding. */
  reviewStatistics: Annotation<ReviewStatistics>({
    reducer: (_, next) => next,
    default: () => ({
      totalDocuments: 0,
      totalCoded: 0,
      totalFailed: 0,
      relevanceBreakdown: {
        relevant: 0,
        not_relevant: 0,
        potentially_relevant: 0,
      },
      privilegeCount: 0,
      hotDocumentCount: 0,
      issueDistribution: {},
      humanCorrectionCount: 0,
      productionSetSize: 0,
    }),
  }),

  // ── Orchestration ──────────────────────────────────────────────────────
  status: Annotation<DiscoveryReviewStatus>({
    reducer: (_, next) => next,
    default: () => 'protocol_setup',
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

export type DiscoveryReviewState = typeof DiscoveryReviewStateAnnotation.State;
