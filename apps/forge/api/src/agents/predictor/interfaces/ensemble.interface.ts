/**
 * Ensemble interface - represents analyst ensemble processing
 * Used for combining multiple analyst assessments into a final prediction
 */

import { ActiveAnalyst } from './analyst.interface';
import { LlmTier } from './llm-tier.interface';
import { ForkType } from './portfolio.interface';

/**
 * Aggregation method for combining analyst assessments
 * - weighted_majority: Weighted majority vote (for categorical predictions)
 * - weighted_average: Weighted average (for numerical predictions)
 * - weighted_ensemble: Combined approach using both votes and confidence
 */
export type AggregationMethod =
  | 'weighted_majority'
  | 'weighted_average'
  | 'weighted_ensemble';

/**
 * Input for ensemble processing
 */
export interface EnsembleInput {
  targetId: string;
  content: string;
  direction?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Individual analyst assessment result
 */
export interface AnalystAssessmentResult {
  analyst: ActiveAnalyst;
  tier: LlmTier;
  direction: string;
  confidence: number;
  reasoning: string;
  key_factors: string[];
  risks: string[];
  learnings_applied: string[]; // learning IDs
  llm_usage_id?: string;
  /** Which fork this assessment is from (user or agent) */
  fork_type?: ForkType;
  /** Context version used for this assessment */
  context_version_id?: string;
  /** Whether this assessment is paper-only (suspended analyst) */
  is_paper_only?: boolean;
}

/**
 * Ensemble result - combined assessment from all analysts
 */
export interface EnsembleResult {
  assessments: AnalystAssessmentResult[];
  aggregated: {
    direction: string;
    confidence: number;
    consensus_strength: number; // How much analysts agree (0-1)
    reasoning: string;
  };
  total_cost?: number;
}
