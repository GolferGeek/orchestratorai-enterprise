/**
 * Frontend-compatible types for the Legal Research Deep Dive feature.
 *
 * These mirror the backend types defined in:
 * apps/forge/api/src/agents/legal-department/workflows/legal-research/legal-research.state.ts
 *
 * Kept as a separate file so ResearchTree.vue, ResearchNodeDetail.vue,
 * JobDetailModal.vue, and LegalJobReviewModal.vue all import from one place.
 */

export interface Citation {
  text: string;
  source: string;
  documentId: string;
  chunkId: string;
  verified: boolean;
  relevanceScore: number;
}

export interface ResearchTreeNode {
  id: string;
  parentId: string | null;
  question: string;
  depth: number;
  status: 'pending' | 'researching' | 'answered' | 'skipped';
  findings?: string;
  citations?: Citation[];
  confidence?: 'high' | 'medium' | 'low';
  childIds: string[];
}

export interface ResearchConfig {
  maxDepth: number;
  maxSubQuestionsPerLevel: number;
  tokenBudget: number | null;
  timeBudgetMs: number | null;
}

/** Shape of job.result for a legal-research job. */
export interface LegalResearchResult {
  researchTree?: ResearchTreeNode[];
  memo?: string;
  report?: string;
  scope?: string;
}
