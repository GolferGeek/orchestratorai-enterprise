/**
 * Debate entity interface - Red Team / Blue Team adversarial debate
 * Based on risk.debates table
 */

export interface RiskDebate {
  id: string;
  subject_id: string;
  composite_score_id: string | null;
  task_id: string | null;
  blue_assessment: BlueAssessment;
  red_challenges: RedChallenges;
  arbiter_synthesis: ArbiterSynthesis;
  original_score: number | null;
  final_score: number | null;
  score_adjustment: number;
  transcript: DebateMessage[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Blue Agent's initial assessment defense
 */
export interface BlueAssessment {
  summary: string;
  key_findings: string[];
  evidence_cited: string[];
  confidence_explanation: string;
}

/**
 * Red Agent's challenges
 */
export interface RedChallenges {
  challenges: RedTeamChallenge[];
  blind_spots: string[];
  alternative_scenarios: AlternativeScenario[];
  overstated_risks: string[];
  understated_risks: string[];
}

export interface RedTeamChallenge {
  dimension: string;
  challenge: string;
  evidence: string[];
  suggested_adjustment: number; // negative = lower risk, positive = higher risk
}

export interface AlternativeScenario {
  name: string;
  description: string;
  probability: number;
  impact_on_score: number;
}

/**
 * Arbiter Agent's final synthesis
 */
export interface ArbiterSynthesis {
  final_assessment: string;
  accepted_challenges: string[];
  rejected_challenges: string[];
  adjustment_reasoning: string;
  confidence_level: number;
  key_takeaways: string[];
  recommended_adjustment: number; // Score adjustment recommendation (-30 to +30)
}

/**
 * Individual message in debate transcript
 */
export interface DebateMessage {
  role: 'blue' | 'red' | 'arbiter';
  timestamp: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Debate Context entity - versioned prompts for debate agents
 * Based on risk.debate_contexts table
 */
export interface RiskDebateContext {
  id: string;
  scope_id: string;
  role: 'blue' | 'red' | 'arbiter';
  version: number;
  system_prompt: string;
  output_schema: Record<string, unknown>;
  is_active: boolean;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRiskDebateData {
  subject_id: string;
  composite_score_id?: string;
  task_id?: string;
  blue_assessment?: BlueAssessment;
  red_challenges?: RedChallenges;
  arbiter_synthesis?: ArbiterSynthesis;
  original_score?: number;
  final_score?: number;
  score_adjustment?: number;
  transcript?: DebateMessage[];
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskDebateData {
  composite_score_id?: string;
  blue_assessment?: BlueAssessment;
  red_challenges?: RedChallenges;
  arbiter_synthesis?: ArbiterSynthesis;
  original_score?: number;
  final_score?: number;
  score_adjustment?: number;
  transcript?: DebateMessage[];
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  completed_at?: string;
}

export interface CreateDebateContextData {
  scope_id: string;
  role: 'blue' | 'red' | 'arbiter';
  version?: number;
  system_prompt: string;
  output_schema?: Record<string, unknown>;
  is_active?: boolean;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateDebateContextData {
  system_prompt?: string;
  output_schema?: Record<string, unknown>;
  is_active?: boolean;
}
