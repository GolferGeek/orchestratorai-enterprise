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
