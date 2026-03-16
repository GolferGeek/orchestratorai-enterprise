/**
 * Snapshot interface - captures complete prediction state for explainability
 */

import { AnalystAssessmentResult } from './ensemble.interface';

export interface PredictionSnapshot {
  id: string;
  prediction_id: string;
  captured_at: string;

  // Predictors that contributed
  predictors: PredictorSnapshot[];

  // Signals that were rejected (and why)
  rejected_signals: RejectedSignalSnapshot[];

  // Individual analyst assessments
  analyst_assessments: AnalystAssessmentResult[];

  // LLM tier breakdown
  llm_ensemble: LlmEnsembleSnapshot;

  // Learnings that were applied
  learnings_applied: LearningSnapshot[];

  // Threshold evaluation at time of prediction
  threshold_evaluation: ThresholdEvaluationSnapshot;

  // Complete timeline of events
  timeline: TimelineEvent[];

  created_at: string;
}

export interface PredictorSnapshot {
  predictor_id: string;
  signal_content: string;
  direction: string;
  strength: number;
  confidence: number;
  analyst_slug: string;
  created_at: string;
}

export interface RejectedSignalSnapshot {
  signal_id: string;
  content: string;
  rejection_reason: string;
  confidence: number;
  rejected_at: string;
}

export interface LlmEnsembleSnapshot {
  tiers_used: string[];
  tier_results: Record<
    string,
    {
      direction: string;
      confidence: number;
      model: string;
      provider: string;
    }
  >;
  agreement_level: number; // 0-1 how much tiers agreed
}

export interface LearningSnapshot {
  learning_id: string;
  type: string;
  content: string;
  scope: string;
  applied_to: string; // analyst or tier
}

export interface ThresholdEvaluationSnapshot {
  min_predictors: number;
  actual_predictors: number;
  min_combined_strength: number;
  actual_combined_strength: number;
  min_consensus: number;
  actual_consensus: number;
  passed: boolean;
}

export interface TimelineEvent {
  timestamp: string;
  event_type:
    | 'signal_received'
    | 'signal_evaluated'
    | 'predictor_created'
    | 'threshold_checked'
    | 'prediction_generated'
    | 'notification_sent';
  details: Record<string, unknown>;
}

export interface CreateSnapshotData {
  prediction_id: string;
  predictors: PredictorSnapshot[];
  rejected_signals: RejectedSignalSnapshot[];
  analyst_assessments: AnalystAssessmentResult[];
  llm_ensemble: LlmEnsembleSnapshot;
  learnings_applied: LearningSnapshot[];
  threshold_evaluation: ThresholdEvaluationSnapshot;
  timeline: TimelineEvent[];
}

/**
 * Input for building a snapshot from various sources
 */
export interface SnapshotBuildInput {
  predictionId: string;
  predictorSnapshots: PredictorSnapshot[];
  rejectedSignals: RejectedSignalSnapshot[];
  analystAssessments: AnalystAssessmentResult[];
  llmEnsemble: LlmEnsembleSnapshot;
  learnings: LearningSnapshot[];
  thresholdEval: ThresholdEvaluationSnapshot;
  timeline: TimelineEvent[];
}
