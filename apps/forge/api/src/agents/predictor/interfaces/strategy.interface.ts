/**
 * Strategy entity interface - represents an investment/prediction strategy
 * Based on prediction.strategies table
 */

/**
 * Risk level for strategy
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Strategy parameters - configurable settings
 */
export interface StrategyParameters {
  /** Minimum number of predictors required to generate prediction */
  min_predictors?: number;
  /** Minimum combined strength of predictors */
  min_combined_strength?: number;
  /** Minimum direction consensus (0-1) */
  min_direction_consensus?: number;
  /** Predictor time-to-live in hours */
  predictor_ttl_hours?: number;
  /** Confidence threshold for urgent signals */
  urgent_threshold?: number;
  /** Confidence threshold for notable signals */
  notable_threshold?: number;
  /** Analyst weight adjustments */
  analyst_weights?: Record<string, number>;
  /** LLM tier preferences */
  tier_preference?: 'gold' | 'silver' | 'bronze' | 'ensemble';
  /** Custom rules */
  custom_rules?: StrategyRule[];
}

/**
 * Strategy rule - custom logic
 */
export interface StrategyRule {
  name: string;
  description: string;
  condition: string;
  action: string;
  priority: number;
}

/**
 * Strategy entity
 */
export interface Strategy {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  risk_level: RiskLevel;
  parameters: StrategyParameters;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Create strategy data
 */
export interface CreateStrategyData {
  slug: string;
  name: string;
  description?: string;
  risk_level: RiskLevel;
  parameters?: StrategyParameters;
  is_system?: boolean;
  is_active?: boolean;
}

/**
 * Update strategy data
 */
export interface UpdateStrategyData {
  name?: string;
  description?: string;
  risk_level?: RiskLevel;
  parameters?: StrategyParameters;
  is_active?: boolean;
}

/**
 * Applied strategy result - strategy merged with universe/target overrides
 */
export interface AppliedStrategy {
  strategy: Strategy;
  effective_parameters: Required<StrategyParameters>;
  source: 'strategy' | 'universe' | 'target';
}

/**
 * Default strategy parameters
 */
export const DEFAULT_STRATEGY_PARAMETERS: Required<StrategyParameters> = {
  min_predictors: 3,
  min_combined_strength: 15,
  min_direction_consensus: 0.6,
  predictor_ttl_hours: 24,
  urgent_threshold: 0.9,
  notable_threshold: 0.7,
  analyst_weights: {},
  tier_preference: 'ensemble',
  custom_rules: [],
};
