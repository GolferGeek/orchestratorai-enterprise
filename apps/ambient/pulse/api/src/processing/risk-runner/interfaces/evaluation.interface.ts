/**
 * Evaluation entity interface - compare assessments to actual outcomes
 * Based on risk.evaluations table
 */

export interface RiskEvaluation {
  id: string;
  composite_score_id: string;
  subject_id: string;
  evaluation_window: '7d' | '30d' | '90d';
  actual_outcome: ActualOutcome;
  outcome_severity: number | null; // 0-100 (0=nothing happened, 100=catastrophic)
  score_accuracy: number | null; // 0.0-1.0
  dimension_accuracy: DimensionAccuracy;
  calibration_error: number | null; // Difference between predicted and actual
  learnings_suggested: string[] | null;
  notes: string | null;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
}

/**
 * What actually happened after the assessment
 */
export interface ActualOutcome {
  // For stocks/crypto
  price_change_percent?: number;
  max_drawdown_percent?: number;
  volatility_realized?: number;
  volatility_predicted?: number;

  // For any adverse events
  adverse_events?: AdverseEvent[];

  // Overall assessment
  outcome_type?:
    | 'no_event'
    | 'minor_decline'
    | 'significant_decline'
    | 'major_event';
  outcome_date?: string;

  // Custom fields
  [key: string]: unknown;
}

/**
 * Individual adverse event that occurred
 */
export interface AdverseEvent {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  date: string;
  impact?: string;
}

/**
 * Per-dimension accuracy breakdown
 */
export interface DimensionAccuracy {
  [dimensionSlug: string]: {
    predicted_score: number;
    contribution_to_accuracy: number;
    was_helpful: boolean;
    notes?: string;
  };
}

export interface CreateRiskEvaluationData {
  composite_score_id: string;
  subject_id: string;
  evaluation_window: '7d' | '30d' | '90d';
  actual_outcome?: ActualOutcome;
  outcome_severity?: number;
  score_accuracy?: number;
  dimension_accuracy?: DimensionAccuracy;
  calibration_error?: number;
  learnings_suggested?: string[];
  notes?: string;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskEvaluationData {
  actual_outcome?: ActualOutcome;
  outcome_severity?: number;
  score_accuracy?: number;
  dimension_accuracy?: DimensionAccuracy;
  calibration_error?: number;
  learnings_suggested?: string[];
  notes?: string;
}
