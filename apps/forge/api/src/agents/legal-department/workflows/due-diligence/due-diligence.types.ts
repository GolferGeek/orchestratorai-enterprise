/**
 * Due Diligence Room — Domain Types.
 *
 * Types specific to the DD room workflow: deal context, document index entries,
 * running findings summaries, risk matrix, synthesis outputs, and HITL payloads.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.2
 */
import type { RoutingDecision } from '../../nodes/clo-routing.node';

export const DD_JOB_TYPE = 'due-diligence';

// ── Deal Context ───────────────────────────────────────────────────

export type TransactionType =
  | 'acquisition'
  | 'merger'
  | 'investment'
  | 'joint_venture'
  | 'asset_purchase';

export interface DealContext {
  transactionType: TransactionType;
  targetCompany: string;
  buyerCompany: string;
  dealValueRange?: string;
  jurisdictions: string[];
  focusAreas: string[];
  knownIssues: string[];
  /**
   * Optional — financial-DD-specific focus areas (e.g., "revenue concentration",
   * "working capital", "debt covenants"). When present and non-empty, the
   * registry-backed financial specialists append this list to their system
   * prompt as an emphasis directive. Does not affect legal specialists.
   *
   * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.2
   */
  financialFocusAreas?: string[];
}

// ── Document Index ─────────────────────────────────────────────────

export interface DocumentIndexEntry {
  documentId: string;
  name: string;
  documentType: string;
  parties: string[];
  date: string | null;
  summary: string;
  riskScore: number | null;
  status:
    | 'pending'
    | 'classifying'
    | 'classified'
    | 'analyzing'
    | 'complete'
    | 'failed';
  error?: string;
  specialistsAssigned: string[];
  specialistsCompleted: string[];
}

// ── Running Findings (cross-document context) ──────────────────────

export interface RunningFinding {
  documentId: string;
  documentName: string;
  finding: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

export interface CrossDocReference {
  sourceDocId: string;
  targetDocId: string;
  relationship: string;
}

export interface RunningFindingsSummary {
  specialistKey: string;
  documentCount: number;
  keyFindings: RunningFinding[];
  crossReferences: CrossDocReference[];
  cumulativeRisks: string[];
}

// ── Synthesis Outputs ──────────────────────────────────────────────

export type RiskCategory =
  | 'contractual'
  | 'ip'
  | 'employment'
  | 'regulatory'
  | 'financial'
  | 'corporate'
  | 'environmental';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface RiskMatrixCell {
  category: RiskCategory;
  severity: Severity;
  count: number;
  documentRefs: Array<{
    documentId: string;
    documentName: string;
    finding: string;
  }>;
}

export interface RiskMatrix {
  cells: RiskMatrixCell[];
}

export interface CategoryAnalysis {
  category: string;
  narrative: string;
  findings: Array<{
    documentId: string;
    documentName: string;
    clauseRef?: string;
    finding: string;
    severity: Severity;
    recommendation: string;
  }>;
  overallRisk: Severity;
}

export interface DealBreakerFlag {
  finding: string;
  category: string;
  severity: 'critical';
  documentRefs: Array<{
    documentId: string;
    documentName: string;
    clauseRef?: string;
  }>;
  reasoning: string;
  recommendation: string;
}

export interface MissingDocument {
  referencedIn: {
    documentId: string;
    documentName: string;
    clauseRef?: string;
  };
  description: string;
  importance: Severity;
}

export interface CrossReference {
  sourceDocId: string;
  sourceDocName: string;
  targetDocId: string;
  targetDocName: string;
  relationship: string;
  riskImplication?: string;
}

// ── Per-Document Outputs ───────────────────────────────────────────

export interface PerDocumentOutput {
  specialistOutputs: Record<string, unknown>;
  routingDecision: RoutingDecision;
  clauseAnnotations?: unknown[];
}

// ── DD Status ──────────────────────────────────────────────────────

export type DDStatus =
  | 'intake'
  | 'classifying'
  | 'analyzing'
  | 'awaiting_extraction_review'
  | 'synthesizing'
  | 'awaiting_synthesis_review'
  | 'generating_report'
  | 'completed'
  | 'failed';
