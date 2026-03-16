/**
 * Assessment entity interface - individual dimension risk assessment
 * Based on risk.assessments table
 */

export interface RiskAssessment {
  id: string;
  subject_id: string;
  dimension_id: string;
  dimension_context_id: string | null;
  task_id: string | null;
  score: number; // 0-100
  confidence: number; // 0.0-1.0
  reasoning: string | null;
  evidence: string[];
  signals: AssessmentSignal[];
  analyst_response: AssessmentAnalystResponse;
  llm_provider: string | null;
  llm_model: string | null;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  // Joined from dimensions table
  dimension_slug?: string;
  dimension_name?: string;
  dimension_weight?: number;
}

/**
 * Signal detected during assessment
 */
export interface AssessmentSignal {
  name: string;
  value: unknown;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  source?: string;
}

/**
 * Raw LLM response stored for debugging/audit
 */
export interface AssessmentAnalystResponse {
  raw_response?: string;
  parsed_output?: Record<string, unknown>;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
}

export interface CreateRiskAssessmentData {
  subject_id: string;
  dimension_id: string;
  dimension_context_id?: string;
  task_id?: string;
  score: number;
  confidence: number;
  reasoning?: string;
  evidence?: string[];
  signals?: AssessmentSignal[];
  analyst_response?: AssessmentAnalystResponse;
  llm_provider?: string;
  llm_model?: string;
  is_test?: boolean;
  test_scenario_id?: string;
}
