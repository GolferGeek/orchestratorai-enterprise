/**
 * Learning entity interface - accumulated knowledge from evaluations
 * Based on risk.learnings table
 */

export interface RiskLearning {
  id: string;
  scope_level: 'runner' | 'domain' | 'scope' | 'subject' | 'dimension';
  domain: string | null;
  scope_id: string | null;
  subject_id: string | null;
  dimension_id: string | null;
  learning_type:
    | 'rule'
    | 'pattern'
    | 'avoid'
    | 'weight_adjustment'
    | 'threshold';
  title: string;
  description: string | null;
  config: LearningConfig;
  times_applied: number;
  times_helpful: number;
  effectiveness_score: number | null;
  status: 'active' | 'testing' | 'retired' | 'superseded';
  is_test: boolean;
  source_type: 'human' | 'ai_suggested' | 'ai_approved' | null;
  parent_learning_id: string | null;
  is_production: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Learning configuration - type-specific settings
 */
export interface LearningConfig {
  // For rule type
  rule_condition?: string;
  rule_action?: string;
  applies_to?: string[];

  // For pattern type
  pattern_signals?: string[];
  pattern_effect?: string;

  // For avoid type
  avoid_condition?: string;
  avoid_reason?: string;

  // For weight_adjustment type
  dimension_slug?: string;
  weight_modifier?: number;

  // For threshold type
  threshold_name?: string;
  threshold_value?: number;
  threshold_direction?: 'increase' | 'decrease';

  // Custom fields
  [key: string]: unknown;
}

/**
 * Learning Queue entity - AI-suggested learnings awaiting HITL review
 * Based on risk.learning_queue table
 */
export interface RiskLearningQueueItem {
  id: string;
  scope_id: string | null;
  subject_id: string | null;
  evaluation_id: string | null;
  suggested_scope_level: string | null;
  suggested_learning_type: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_config: LearningConfig;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  reviewed_by_user_id: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  learning_id: string | null;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
}

/**
 * Pending learnings view - includes subject and scope info
 */
export interface PendingLearningView extends RiskLearningQueueItem {
  subject_identifier: string | null;
  subject_name: string | null;
  scope_name: string | null;
}

export interface CreateRiskLearningData {
  scope_level: 'runner' | 'domain' | 'scope' | 'subject' | 'dimension';
  domain?: string;
  scope_id?: string;
  subject_id?: string;
  dimension_id?: string;
  learning_type:
    | 'rule'
    | 'pattern'
    | 'avoid'
    | 'weight_adjustment'
    | 'threshold';
  title: string;
  description?: string;
  config?: LearningConfig;
  status?: 'active' | 'testing' | 'retired' | 'superseded';
  is_test?: boolean;
  source_type?: 'human' | 'ai_suggested' | 'ai_approved';
  parent_learning_id?: string;
  is_production?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskLearningData {
  title?: string;
  description?: string;
  config?: LearningConfig;
  times_applied?: number;
  times_helpful?: number;
  effectiveness_score?: number;
  status?: 'active' | 'testing' | 'retired' | 'superseded';
  is_production?: boolean;
}

export interface CreateLearningQueueItemData {
  scope_id?: string;
  subject_id?: string;
  evaluation_id?: string;
  suggested_scope_level?: string;
  suggested_learning_type?: string;
  suggested_title: string;
  suggested_description?: string;
  suggested_config?: LearningConfig;
  ai_reasoning?: string;
  ai_confidence?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'modified';
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateLearningQueueItemData {
  status?: 'pending' | 'approved' | 'rejected' | 'modified';
  reviewed_by_user_id?: string;
  reviewer_notes?: string;
  reviewed_at?: string;
  learning_id?: string;
}
