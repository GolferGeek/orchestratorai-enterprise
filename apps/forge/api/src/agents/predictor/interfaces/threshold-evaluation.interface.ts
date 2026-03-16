/**
 * Threshold evaluation interface - for determining when to create predictions
 */

export interface ThresholdConfig {
  min_predictors: number; // Minimum number of active predictors
  min_combined_strength: number; // Minimum sum of strengths (1-10)
  min_direction_consensus: number; // Minimum % agreement (0.0-1.0)
  predictor_ttl_hours: number; // Hours until predictor expires
  time_decay_rate?: number; // Decay rate for time-weighting predictors (0 = no decay, default 0.05)
}

export interface ThresholdEvaluationResult {
  meetsThreshold: boolean;
  activeCount: number;
  combinedStrength: number;
  directionConsensus: number;
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
  details: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    avgConfidence: number;
    // Time-weighted metrics (newer predictors weighted more heavily)
    weightedBullish: number;
    weightedBearish: number;
    weightedNeutral: number;
    totalWeight: number;
  };
}

export const DEFAULT_THRESHOLD_CONFIG: ThresholdConfig = {
  min_predictors: 5,
  min_combined_strength: 20,
  min_direction_consensus: 0.75,
  predictor_ttl_hours: 24,
  time_decay_rate: 0.05, // ~50% weight after 14 hours, ~25% after 28 hours
};
