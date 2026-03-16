/**
 * Portfolio Risk Aggregation Interfaces
 *
 * Phase 5: Portfolio-level risk aggregation across multiple subjects
 */

/**
 * Portfolio risk summary for a scope
 */
export interface PortfolioRiskSummary {
  scope_id: string;
  scope_name: string;
  total_subjects: number;
  assessed_subjects: number; // Subjects with active scores
  average_risk_score: number;
  weighted_risk_score: number; // If weights are defined per subject
  max_risk_score: number;
  min_risk_score: number;
  risk_distribution: RiskDistribution;
  dimension_breakdown: DimensionBreakdown[];
  alerts_summary: AlertsSummary;
  concentration_risk: ConcentrationRiskSummary;
  calculated_at: string;
}

/**
 * Distribution of risk scores across subjects
 */
export interface RiskDistribution {
  low: number; // 0-30
  moderate: number; // 31-50
  elevated: number; // 51-70
  high: number; // 71-85
  critical: number; // 86-100
}

/**
 * Aggregated dimension breakdown across portfolio
 */
export interface DimensionBreakdown {
  dimension_slug: string;
  dimension_name: string;
  average_score: number;
  max_score: number;
  min_score: number;
  contributing_subjects: number; // How many subjects have this dimension scored
}

/**
 * Summary of alerts across portfolio
 */
export interface AlertsSummary {
  total: number;
  unacknowledged: number;
  by_severity: {
    info: number;
    warning: number;
    critical: number;
  };
  recent_alerts: RecentAlert[];
}

/**
 * Recent alert for summary
 */
export interface RecentAlert {
  id: string;
  subject_identifier: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
}

/**
 * Concentration risk summary for portfolio
 */
export interface ConcentrationRiskSummary {
  concentration_score: number;
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  highly_correlated_pairs: number;
  recommendation: string;
}

/**
 * Subject contribution to portfolio risk
 */
export interface SubjectRiskContribution {
  subject_id: string;
  identifier: string;
  name: string | null;
  risk_score: number;
  weight: number; // 0.0-1.0, default equal weight
  weighted_contribution: number;
  percentage_of_total: number;
  dimension_scores: Record<string, number>;
  is_high_risk: boolean;
  alerts_count: number;
}

/**
 * Portfolio risk heatmap data
 */
export interface PortfolioHeatmap {
  scope_id: string;
  subjects: HeatmapSubject[];
  dimensions: string[];
  cells: HeatmapCell[];
}

/**
 * Subject in heatmap
 */
export interface HeatmapSubject {
  id: string;
  identifier: string;
  overall_score: number;
}

/**
 * Single cell in heatmap
 */
export interface HeatmapCell {
  subject_index: number;
  dimension_index: number;
  score: number;
  relative_score: 'low' | 'average' | 'high'; // Relative to other subjects for this dimension
}

/**
 * Portfolio comparison over time
 */
export interface PortfolioTrend {
  scope_id: string;
  period: 'day' | 'week' | 'month';
  data_points: PortfolioTrendPoint[];
  trend_direction: 'improving' | 'stable' | 'worsening';
  change_percentage: number;
}

/**
 * Single point in portfolio trend
 */
export interface PortfolioTrendPoint {
  date: string;
  average_risk_score: number;
  subjects_assessed: number;
  high_risk_subjects: number;
}
