/**
 * Due Diligence Room — State Annotation.
 *
 * Separate state from document-analysis/contract-review because the DD room
 * has fundamentally different needs: deal context, document queues, running
 * findings summaries, multi-document dispatcher state, and synthesis outputs.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.2.1
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
  CategoryAnalysis,
  DealBreakerFlag,
  MissingDocument,
  CrossReference,
  DDStatus,
} from './due-diligence.types';

// ── State Annotation ────────────────────────────────────────────────

export const DueDiligenceStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

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

  // --- Deal Context (set at intake) ---
  dealContext: Annotation<DealContext>({
    reducer: (_, next) => next,
    default: () => ({
      transactionType: 'acquisition',
      targetCompany: '',
      buyerCompany: '',
      jurisdictions: [],
      focusAreas: [],
      knownIssues: [],
    }),
  }),

  // --- Document Management ---
  /** All documents in the room, with extracted text */
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

  /** Classification and metadata per document */
  documentIndex: Annotation<DocumentIndexEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // --- Dispatcher State ---
  /** Document IDs not yet analyzed */
  documentQueue: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /** Document IDs successfully analyzed */
  documentsAnalyzed: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  /** Document IDs that failed, mapped to error message */
  documentsFailed: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // --- Specialist Outputs ---
  /** Per-document specialist outputs, keyed by documentId */
  perDocumentOutputs: Annotation<Record<string, PerDocumentOutput>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // --- Running Findings (cross-document context) ---
  /** One RunningFindingsSummary per specialist, keyed by specialist key */
  runningFindings: Annotation<Record<string, RunningFindingsSummary>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // --- Synthesis Outputs ---
  riskMatrix: Annotation<RiskMatrix | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  perCategoryAnalysis: Annotation<Record<string, CategoryAnalysis> | undefined>(
    {
      reducer: (_, next) => next,
      default: () => undefined,
    },
  ),
  dealBreakerFlags: Annotation<DealBreakerFlag[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  missingDocuments: Annotation<MissingDocument[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  crossReferenceMap: Annotation<CrossReference[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- Report ---
  report: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- Orchestration ---
  status: Annotation<DDStatus>({
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

  // --- HITL ---
  hitlGate1Decision: Annotation<ReviewDecisionPayload | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  hitlGate2Decision: Annotation<ReviewDecisionPayload | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- Incremental Updates ---
  /** True when running an incremental update (add documents to completed room) */
  incrementalMode: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  /** Document IDs added in the current incremental update */
  newDocumentIds: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

export type DueDiligenceState = typeof DueDiligenceStateAnnotation.State;
