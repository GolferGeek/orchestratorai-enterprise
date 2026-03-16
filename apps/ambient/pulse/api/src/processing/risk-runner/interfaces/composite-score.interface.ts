/**
 * Composite Score entity interface - aggregated risk score across dimensions
 * Based on risk.composite_scores table
 */

export interface RiskCompositeScore {
  id: string;
  subject_id: string;
  task_id: string | null;
  overall_score: number; // 0-100
  dimension_scores: DimensionScoreMap;
  debate_id: string | null;
  debate_adjustment: number; // Score change from Red Team
  pre_debate_score: number | null;
  confidence: number; // 0.0-1.0
  status: 'active' | 'superseded' | 'expired';
  valid_until: string | null;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
}

/**
 * Map of dimension slug to score
 */
export interface DimensionScoreMap {
  [dimensionSlug: string]: number;
}

/**
 * Active composite score view - includes subject and scope info
 */
export interface ActiveCompositeScoreView extends RiskCompositeScore {
  scope_id: string;
  subject_identifier: string;
  subject_name: string | null;
  subject_type: string;
  scope_name: string;
  scope_domain: string;
}

export interface CreateCompositeScoreData {
  subject_id: string;
  task_id?: string;
  overall_score: number;
  dimension_scores: DimensionScoreMap;
  debate_id?: string;
  debate_adjustment?: number;
  pre_debate_score?: number;
  confidence: number;
  status?: 'active' | 'superseded' | 'expired';
  valid_until?: string;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateCompositeScoreData {
  overall_score?: number;
  dimension_scores?: DimensionScoreMap;
  debate_id?: string;
  debate_adjustment?: number;
  pre_debate_score?: number;
  confidence?: number;
  status?: 'active' | 'superseded' | 'expired';
  valid_until?: string;
}
