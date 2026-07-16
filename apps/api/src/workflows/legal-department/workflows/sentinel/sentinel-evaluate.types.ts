/**
 * Sentinel Evaluate Workflow — Domain Types.
 *
 * Interfaces for portfolio matches, evaluation results, and workflow status.
 */

// ── Portfolio Match (RAG hit linked to a holding) ───────────────────

export interface PortfolioMatch {
  holdingId: string;
  clientName: string;
  relevanceText: string;
}

// ── Workflow Status ─────────────────────────────────────────────────

export type SentinelEvaluateStatus =
  | 'loading'
  | 'evaluating'
  | 'completed'
  | 'failed';
