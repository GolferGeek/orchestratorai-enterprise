/**
 * Prediction entity interface - represents an actionable prediction
 * Based on prediction.predictions table
 */

/**
 * Prediction lifecycle status
 * - active: Active prediction being tracked
 * - resolved: Outcome determined
 * - expired: Timeframe elapsed without resolution
 * - cancelled: Manually cancelled
 */
export type PredictionStatus = 'active' | 'resolved' | 'expired' | 'cancelled';

/**
 * Prediction direction (outcome vocabulary)
 * Note: Different from signal sentiment (bullish/bearish)
 * - up: Predicts upward movement
 * - down: Predicts downward movement
 * - flat: Predicts minimal movement
 */
export type PredictionDirection = 'up' | 'down' | 'flat';

export interface Prediction {
  id: string;
  target_id: string;
  task_id: string | null;
  direction: PredictionDirection;
  confidence: number;
  magnitude: 'small' | 'medium' | 'large' | null;
  reasoning: string;
  timeframe_hours: number;
  predicted_at: string;
  expires_at: string;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  analyst_ensemble: Record<string, unknown>;
  llm_ensemble: Record<string, unknown>;
  status: PredictionStatus;
  outcome_value: number | null;
  outcome_captured_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  /** Flag indicating if this is test data */
  is_test_data?: boolean | null;
  /** Test scenario ID if this is test data */
  test_scenario_id?: string | null;
  /** Recommended position quantity based on confidence/risk */
  recommended_quantity?: number | null;
  /** Explanation for recommended quantity */
  quantity_reasoning?: string | null;
  /** Context version IDs for traceability */
  runner_context_version_id?: string | null;
  analyst_context_version_ids?: Record<string, string> | null;
  universe_context_version_id?: string | null;
  target_context_version_id?: string | null;
  /** Slug of the analyst who made this prediction (null for legacy/aggregated predictions) */
  analyst_slug?: string | null;
  /** True if this is a synthesized arbitrator prediction combining all analyst opinions */
  is_arbitrator?: boolean | null;
}

export interface CreatePredictionData {
  target_id: string;
  task_id?: string;
  direction: PredictionDirection;
  confidence: number;
  magnitude?: 'small' | 'medium' | 'large';
  reasoning: string;
  timeframe_hours: number;
  predicted_at?: string;
  expires_at: string;
  entry_price?: number;
  target_price?: number;
  stop_loss?: number;
  analyst_ensemble: Record<string, unknown>;
  llm_ensemble: Record<string, unknown>;
  status?: PredictionStatus;
  /** Recommended position quantity */
  recommended_quantity?: number;
  /** Explanation for recommended quantity */
  quantity_reasoning?: string;
  /** Context version IDs for traceability */
  runner_context_version_id?: string;
  analyst_context_version_ids?: Record<string, string>;
  universe_context_version_id?: string;
  target_context_version_id?: string;
  /** Slug of the analyst who made this prediction */
  analyst_slug?: string;
  /** True if this is a synthesized arbitrator prediction */
  is_arbitrator?: boolean;
}

export interface UpdatePredictionData {
  predicted_at?: string;
  direction?: PredictionDirection;
  confidence?: number;
  magnitude?: 'small' | 'medium' | 'large' | null;
  reasoning?: string;
  timeframe_hours?: number;
  expires_at?: string;
  entry_price?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  analyst_ensemble?: Record<string, unknown>;
  llm_ensemble?: Record<string, unknown>;
  status?: PredictionStatus;
  outcome_value?: number;
  outcome_captured_at?: string;
  resolution_notes?: string;
  recommended_quantity?: number | null;
  quantity_reasoning?: string | null;
  analyst_slug?: string | null;
  is_arbitrator?: boolean | null;
}
