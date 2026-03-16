/**
 * Subject entity interface - represents a thing being risk-assessed
 * Based on risk.subjects table
 */

export interface RiskSubject {
  id: string;
  scope_id: string;
  identifier: string; // symbol for stocks, slug for decisions
  name: string | null;
  subject_type: 'stock' | 'crypto' | 'decision' | 'project';
  metadata: RiskSubjectMetadata;
  is_active: boolean;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Subject metadata - flexible key-value store for subject-specific data
 */
export interface RiskSubjectMetadata {
  // For stocks
  exchange?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;

  // For crypto
  blockchain?: string;
  token_type?: string;

  // For decisions/projects
  category?: string;
  stakeholders?: string[];
  deadline?: string;

  // Custom fields
  [key: string]: unknown;
}

export interface CreateRiskSubjectData {
  scope_id: string;
  identifier: string;
  name?: string;
  subject_type: 'stock' | 'crypto' | 'decision' | 'project';
  metadata?: RiskSubjectMetadata;
  is_active?: boolean;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskSubjectData {
  identifier?: string;
  name?: string;
  subject_type?: 'stock' | 'crypto' | 'decision' | 'project';
  metadata?: RiskSubjectMetadata;
  is_active?: boolean;
}
