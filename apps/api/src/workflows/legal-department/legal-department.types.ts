/**
 * Legal Department Agent Types
 *
 * Type definitions for the Legal Department AI agent.
 * This file provides type safety for legal document analysis workflows.
 */

/**
 * Document input type for legal analysis
 */
export interface LegalDocument {
  name: string;
  content: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Legal analysis metadata (placeholder for future phases)
 *
 * M0: Not used
 * Future phases will include:
 * - Document classification
 * - Key terms/clauses identification
 * - Risk assessment
 * - Compliance flags
 */
export interface LegalMetadata {
  documentType?: string;
  jurisdiction?: string;
  parties?: string[];
  keyTerms?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  complianceFlags?: string[];
  extractedDates?: string[];
  [key: string]: unknown;
}

/**
 * Echo node response (M0 phase)
 */
export interface EchoNodeResponse {
  response: string;
  timestamp: number;
}

/**
 * Node result type for error handling
 */
export interface NodeResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Contract Review & Redlining types ─────────────────────────────────

/**
 * A single entry in the clause map produced by clause segmentation.
 * Represents one addressable unit of the contract (section or clause).
 */
export interface ClauseMapEntry {
  /** Unique ID for this entry, e.g. "s1", "s1-c1", "s2-c3" */
  clauseId: string;
  /** Dot-separated section path, e.g. "1", "1.2", "3.4.1" */
  sectionPath: string;
  /** The full text of this clause or section */
  text: string;
  /** Defined terms referenced by this clause */
  definedTermsReferenced: string[];
  /** Whether this is a section-level entry (true when clauses within couldn't be parsed) */
  sectionLevel: boolean;
  /** Entry type: 'clause' for individual provisions, 'section' for section-level entries */
  entryType: 'clause' | 'section';
}

/**
 * The complete clause map for a contract — an ordered list of entries
 * produced by clause segmentation before specialist analysis.
 */
export interface ClauseMap {
  entries: ClauseMapEntry[];
  /** Defined terms extracted from the contract (term → definition text) */
  definedTerms: Record<string, string>;
  /** Total number of sections identified */
  sectionCount: number;
  /** Total number of clauses identified */
  clauseCount: number;
}

/**
 * A per-clause annotation produced by a specialist during contract review.
 */
export interface ClauseAnnotation {
  /** References a ClauseMapEntry.clauseId */
  clauseId: string;
  /** Risk assessment for this clause */
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  /** Domain category, e.g. "indemnification", "IP assignment", "non-compete" */
  category: string;
  /** What the specialist found (2-4 sentences) */
  finding: string;
  /** Replacement clause text, if the specialist has a recommendation */
  suggestedLanguage?: string;
  /** Why this matters (1-2 sentences) */
  reasoning: string;
}

/**
 * Merged view of a single clause after synthesis combines all specialist
 * annotations. Includes the original text, merged risk, and all findings.
 */
export interface ClauseSynthesis {
  clauseId: string;
  originalText: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
  annotations: ClauseAnnotation[];
  /** Merged replacement language if multiple specialists have suggestions */
  suggestedRedline?: string;
  /** 1-2 sentence plain-English summary */
  summary: string;
}

/**
 * The complete redline output — the top-level structure that wraps
 * all per-clause syntheses and summary statistics.
 */
export interface RedlineOutput {
  clauses: ClauseSynthesis[];
  riskBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    acceptable: number;
  };
  totalClauses: number;
  flaggedClauses: number;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable';
}

/**
 * A reviewer's decision on a single clause during HITL review.
 */
export interface ClauseDecision {
  clauseId: string;
  decision: 'accept' | 'reject' | 'modify';
  /** Reviewer's edited replacement text (only for 'modify' decision) */
  modifiedLanguage?: string;
}

/**
 * The payload shape for per-clause HITL review submissions.
 * Distinguished from ReviewDecisionPayload by the presence of clauseDecisions.
 */
export interface ClauseReviewPayload {
  clauseDecisions: ClauseDecision[];
}
