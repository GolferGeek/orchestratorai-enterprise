/**
 * Missed Opportunity interface - for detecting and analyzing unpredicted moves
 */

export interface MissedOpportunity {
  id: string;
  target_id: string;
  detected_at: string;
  move_start: string;
  move_end: string;
  move_direction: 'up' | 'down';
  move_percentage: number;
  significance_score: number; // 0-1
  analysis_status: 'pending' | 'analyzing' | 'completed';
  discovered_drivers: string[];
  source_gaps: string[];
  suggested_learnings: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface MissDetectionConfig {
  min_move_percentage: number; // Minimum % move to consider (e.g., 5%)
  lookback_hours: number; // Hours to look back for moves
  max_prediction_gap_hours: number; // If we had no predictions in this window
}

export interface MissAnalysisResult {
  missedOpportunityId: string;
  discoveredDrivers: string[];
  signalsWeHad: string[]; // Signal IDs we had but rejected
  signalGaps: string[]; // Types of signals we should have had
  sourceGaps: string[]; // Sources we should add
  suggestedLearnings: {
    type: string;
    content: string;
    scope: string;
  }[];
  toolSuggestions: {
    tool_type: string;
    description: string;
    rationale: string;
  }[];
}

export const DEFAULT_MISS_CONFIG: MissDetectionConfig = {
  min_move_percentage: 5,
  lookback_hours: 24,
  max_prediction_gap_hours: 4,
};
