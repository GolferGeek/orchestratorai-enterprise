/**
 * Correlation Analysis Interfaces
 *
 * Phase 5: Cross-subject correlation analysis for portfolio risk assessment
 */

/**
 * Correlation between two subjects
 */
export interface SubjectCorrelation {
  subject_a_id: string;
  subject_a_identifier: string;
  subject_b_id: string;
  subject_b_identifier: string;
  correlation_coefficient: number; // -1.0 to 1.0
  strength:
    | 'strong_negative'
    | 'moderate_negative'
    | 'weak'
    | 'moderate_positive'
    | 'strong_positive';
  dimension_correlations: DimensionCorrelation[];
  calculated_at: string;
}

/**
 * Per-dimension correlation between subjects
 */
export interface DimensionCorrelation {
  dimension_slug: string;
  dimension_name: string;
  correlation_coefficient: number;
  score_a: number;
  score_b: number;
}

/**
 * Correlation matrix for a scope (all subjects)
 */
export interface CorrelationMatrix {
  scope_id: string;
  scope_name: string;
  subjects: CorrelationMatrixSubject[];
  matrix: CorrelationMatrixEntry[];
  average_correlation: number;
  highest_correlation: CorrelationPair;
  lowest_correlation: CorrelationPair;
  calculated_at: string;
}

/**
 * Subject info in correlation matrix
 */
export interface CorrelationMatrixSubject {
  id: string;
  identifier: string;
  name: string | null;
  current_score: number | null;
}

/**
 * Single entry in correlation matrix
 */
export interface CorrelationMatrixEntry {
  subject_a_index: number;
  subject_b_index: number;
  correlation: number;
}

/**
 * Correlation pair (for highest/lowest tracking)
 */
export interface CorrelationPair {
  subject_a_identifier: string;
  subject_b_identifier: string;
  correlation: number;
}

/**
 * Concentration risk analysis result
 */
export interface ConcentrationRisk {
  scope_id: string;
  total_subjects: number;
  highly_correlated_pairs: number; // Pairs with |correlation| > 0.7
  concentration_score: number; // 0-100, higher = more concentrated/risky
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  recommendations: string[];
  top_correlated_pairs: SubjectCorrelation[];
  calculated_at: string;
}
