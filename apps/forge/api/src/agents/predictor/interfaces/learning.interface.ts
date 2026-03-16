/**
 * Learning entity interface - represents system learnings that improve predictions over time
 * Based on prediction.learnings table and prediction.get_active_learnings function
 */

/**
 * Learning scope level (inheritance hierarchy)
 * - runner: System-wide learnings
 * - domain: Domain-specific learnings (stocks, crypto, etc.)
 * - universe: Universe-specific learnings
 * - target: Target-specific learnings
 * - analyst: Analyst-specific learnings
 */
export type LearningScopeLevel =
  | 'runner'
  | 'domain'
  | 'universe'
  | 'target'
  | 'analyst';

/**
 * Learning type
 * - rule: Hard rule (e.g., "always do X when Y")
 * - pattern: Observed pattern (e.g., "tends to X when Y")
 * - weight_adjustment: Adjust analyst weight based on performance
 * - threshold: Adjust confidence/strength thresholds
 * - avoid: Anti-pattern to avoid
 */
export type LearningType =
  | 'rule'
  | 'pattern'
  | 'weight_adjustment'
  | 'threshold'
  | 'avoid';

/**
 * Learning source type
 * - human: Manually created by human
 * - ai_suggested: AI-suggested learning (needs review)
 * - ai_approved: AI-suggested learning approved by human
 */
export type LearningSourceType = 'human' | 'ai_suggested' | 'ai_approved';

/**
 * Learning status
 * - active: Currently applied
 * - superseded: Replaced by newer learning
 * - disabled: Manually disabled
 */
export type LearningStatus = 'active' | 'superseded' | 'disabled';

/**
 * Learning entity - represents a system learning
 */
export interface Learning {
  id: string;
  scope_level: LearningScopeLevel;
  domain: string | null;
  universe_id: string | null;
  target_id: string | null;
  analyst_id: string | null;
  learning_type: LearningType;
  title: string;
  description: string;
  config: LearningConfig;
  source_type: LearningSourceType;
  source_evaluation_id: string | null;
  source_missed_opportunity_id: string | null;
  status: LearningStatus;
  superseded_by: string | null;
  version: number;
  times_applied: number;
  times_helpful: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Learning configuration (flexible schema)
 * Different learning types use different config fields
 */
export interface LearningConfig {
  analyst_slug?: string;
  adjustment?: number;
  min_predictors?: number;
  trigger_condition?: string;
  action?: string;
  indicators?: string[];
  success_rate?: number;
  conditions?: string[];
  /** ID of original learning when this is a test copy */
  source_learning_id?: string;
  /** ID of test scenario this learning belongs to */
  test_scenario_id?: string;
}

/**
 * Active learning with resolved configuration
 * Returned by prediction.get_active_learnings function
 */
export interface ActiveLearning {
  learning_id: string;
  learning_type: LearningType;
  title: string;
  description: string;
  config: LearningConfig;
  scope_level: LearningScopeLevel;
  times_applied: number;
  times_helpful: number;
}

/**
 * Learning queue status
 * - pending: Awaiting human review
 * - approved: Approved and learning created
 * - rejected: Rejected by human
 * - modified: Modified before approval
 */
export type LearningQueueStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'modified';

/**
 * Learning queue entity - AI-suggested learnings pending HITL review
 */
export interface LearningQueue {
  id: string;
  suggested_scope_level: LearningScopeLevel;
  suggested_domain: string | null;
  suggested_universe_id: string | null;
  suggested_target_id: string | null;
  suggested_analyst_id: string | null;
  suggested_learning_type: LearningType;
  suggested_title: string;
  suggested_description: string;
  suggested_config: LearningConfig;
  source_evaluation_id: string | null;
  source_missed_opportunity_id: string | null;
  ai_reasoning: string;
  ai_confidence: number;
  status: LearningQueueStatus;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewer_notes: string | null;
  final_scope_level: LearningScopeLevel | null;
  final_domain: string | null;
  final_universe_id: string | null;
  final_target_id: string | null;
  final_analyst_id: string | null;
  learning_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Learning lineage entity - tracks promotion of learnings from test to production
 * Based on prediction.learning_lineage table
 */
export interface LearningLineage {
  id: string;
  organization_slug: string;
  test_learning_id: string;
  production_learning_id: string;
  scenario_runs: string[];
  validation_metrics: Record<string, unknown>;
  backtest_result: Record<string, unknown> | null;
  promoted_by: string;
  promoted_at: string;
  notes: string | null;
  created_at: string;
}

/**
 * Learning lineage with user and learning details
 * Returned by repository methods that join with users and learnings
 */
export interface LearningLineageWithDetails extends LearningLineage {
  promoter_email?: string;
  promoter_name?: string;
  test_learning_title?: string;
  production_learning_title?: string;
}

/**
 * Data for creating a new learning lineage record
 */
export interface CreateLearningLineageData {
  id?: string;
  organization_slug: string;
  test_learning_id: string;
  production_learning_id: string;
  scenario_runs?: string[];
  validation_metrics?: Record<string, unknown>;
  backtest_result?: Record<string, unknown>;
  promoted_by: string;
  promoted_at?: string;
  notes?: string;
}
