/**
 * Discovery Document Review — Domain Types.
 *
 * Types specific to the discovery-review workflow: review protocol, per-document
 * coding, review batches, batch HITL decision payloads, and summary statistics.
 *
 * See: docs/efforts/current/discovery-document-review/prd.md §4.2
 */

export const DISCOVERY_REVIEW_JOB_TYPE = 'discovery-review';

// ── Review Protocol ────────────────────────────────────────────────────────

/**
 * Matter-level configuration defined by the reviewing attorney before upload.
 * Governs all LLM coding decisions for the lifetime of the review.
 */
export interface ReviewProtocol {
  matterId: string;
  matterName: string;
  relevanceCriteria: {
    claims: string[];
    dateRange?: { start: string; end: string };
    keyParties: string[];
    keyTopics: string[];
    exclusions?: string[];
  };
  privilegeHolders: {
    attorneys: string[];
    firms: string[];
    inHouseCounsel: string[];
  };
  issueTags: Array<{ tagId: string; tagName: string; description: string }>;
  /** Documents per HITL batch. Default: 50. */
  batchSize: number;
  /**
   * Confidence threshold for relevance routing only (not privilege).
   * Default: 0.7. Documents below this threshold enter the low-confidence
   * relevance batch.
   */
  confidenceThreshold: number;
  /**
   * When true (the default), ALL documents flagged as potentially privileged
   * go through mandatory human review. The privilege threshold (0.95) is
   * hardcoded and NOT controlled by this flag.
   */
  privilegeReviewRequired: boolean;
}

// ── Document Coding ────────────────────────────────────────────────────────

/**
 * Per-document coding result produced by the first-pass coding pipeline.
 * One `DocumentCoding` entry per document in `state.documentCodings`.
 */
export interface DocumentCoding {
  documentId: string;
  relevance: {
    classification: 'relevant' | 'not_relevant' | 'potentially_relevant';
    confidence: number;
    reasoning: string;
    matchingCriteria: string[];
  };
  privilege: {
    /**
     * SAFETY: any document with a "not privileged" confidence below 0.95 MUST
     * be classified as `potentially_privileged` regardless of the LLM output.
     * This is enforced in the privilege-coding node, not here in the type.
     */
    classification: 'privileged' | 'not_privileged' | 'potentially_privileged';
    confidence: number;
    privilegeType: 'attorney_client' | 'work_product' | 'both' | 'none';
    reasoning: string;
  };
  issueTags: Array<{ tagId: string; confidence: number }>;
  hotDocument: boolean;
  hotDocumentReason?: string;
}

// ── Review Batches ─────────────────────────────────────────────────────────

/**
 * Batch types processed in priority order during Phase 3 HITL review.
 *
 * Processing order:
 *   1. privilege          — mandatory; no bulk-approve
 *   2. low_confidence_relevance — bulk-approve allowed
 *   3. hot_documents      — flag_senior_review allowed
 *   4. sample             — quality control; corrections feed calibration
 */
export type BatchType =
  | 'privilege'
  | 'low_confidence_relevance'
  | 'hot_documents'
  | 'sample';

export interface ReviewBatch {
  batchId: string;
  batchType: BatchType;
  documentIds: string[];
  status: 'pending' | 'in_review' | 'completed';
}

// ── Batch HITL Decision Payload ────────────────────────────────────────────

/**
 * Reviewer decision for a single document within a batch.
 * `approve` accepts the system coding. `correct` replaces specified fields.
 */
export interface BatchDocumentDecision {
  documentId: string;
  action: 'approve' | 'correct';
  correctedCoding?: Partial<DocumentCoding>;
  /** Flag this document for escalated senior attorney review. */
  flagSeniorReview?: boolean;
}

/**
 * Decision payload submitted to `POST /legal-department/jobs/:id/review` when
 * `decision === 'batch_review'`. Extends the existing `ReviewDecisionPayload`
 * union in legal-jobs.types.ts (added there in step 1.8).
 */
export interface BatchReviewDecisionPayload {
  decision: 'batch_review';
  batchId: string;
  documentDecisions: BatchDocumentDecision[];
  /** Approve all remaining uncorrected documents in the batch. Disallowed for privilege batches. */
  approveRemaining?: boolean;
  /** Flag the batch for a senior reviewer instead of approving/correcting. */
  flagSeniorReview?: boolean;
  feedback?: string;
}

// ── Discovery Review Status ────────────────────────────────────────────────

export type DiscoveryReviewStatus =
  | 'protocol_setup'
  | 'ingesting'
  | 'classifying'
  | 'coding'
  | 'building_batches'
  | 'awaiting_privilege_review'
  | 'awaiting_relevance_review'
  | 'awaiting_hot_doc_review'
  | 'awaiting_sample_review'
  | 'calibrating'
  | 'generating_production_set'
  | 'completed'
  | 'failed';

// ── Document Index Entry ───────────────────────────────────────────────────

/**
 * Classification metadata produced during the ingest + classify phases for
 * each document. Analogous to DD's `DocumentIndexEntry`.
 */
export interface DocumentIndexEntry {
  documentId: string;
  name: string;
  /**
   * Document category as classified by the LLM.
   * Possible values: email | attachment | contract | memo | presentation |
   *   spreadsheet | other
   */
  documentType: string;
  /** Thread ID for email thread grouping (emails in the same thread share this). */
  threadId?: string;
  /** Approximate creation or send date extracted during classification. */
  date?: string | null;
  /** One-sentence summary used in the Document Browser UI. */
  summary: string;
  status: 'pending' | 'ingested' | 'classified' | 'coded' | 'failed';
  error?: string;
}

// ── Review Statistics ──────────────────────────────────────────────────────

export interface ReviewStatistics {
  totalDocuments: number;
  totalCoded: number;
  totalFailed: number;
  relevanceBreakdown: {
    relevant: number;
    not_relevant: number;
    potentially_relevant: number;
  };
  privilegeCount: number;
  hotDocumentCount: number;
  issueDistribution: Record<string, number>;
  /** Number of reviewer corrections applied (populated during HITL). */
  humanCorrectionCount: number;
  /** Production set size (populated in Phase 4). */
  productionSetSize: number;
}

// ── Calibration Adjustment ─────────────────────────────────────────────────

/**
 * A detected systematic correction pattern from the random sample HITL batch.
 * Generated by calibration-check.node.ts and injected into state for reporting.
 */
export interface CalibrationAdjustment {
  /** The direction of the pattern, e.g. 'relevance_upgrade' or 'relevance_downgrade'. */
  type: string;
  /** The original system classification that was corrected. */
  fromClassification: string;
  /** The reviewer's corrected classification. */
  toClassification: string;
  /** Number of documents in the sample that exhibited this correction pattern. */
  count: number;
}

// ── Privilege Log Entry ────────────────────────────────────────────────────

/**
 * One entry per withheld document in the privilege log, as required by
 * court rules. The `reviewerId` is set when a human corrected or confirmed
 * the privilege designation during HITL review.
 */
export interface PrivilegeLogEntry {
  documentId: string;
  documentName: string;
  privilegeType: 'attorney_client' | 'work_product' | 'both' | 'none';
  privilegeBasis: string;
  reviewerId?: string;
}
