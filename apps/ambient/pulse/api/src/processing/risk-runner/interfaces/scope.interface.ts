/**
 * Scope entity interface - represents a risk analysis boundary/context
 * Based on risk.scopes table
 */

export interface RiskScope {
  id: string;
  organization_slug: string;
  agent_slug: string;
  name: string;
  description: string | null;
  domain: 'investment' | 'business' | 'project' | 'personal';
  llm_config: RiskLlmConfig | null;
  thresholds: RiskThresholdConfig | null;
  analysis_config: RiskAnalysisConfig;
  is_active: boolean;
  is_test: boolean;
  test_scenario_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * LLM tier configuration for risk scope
 */
export interface RiskLlmConfig {
  gold?: { provider: string; model: string };
  silver?: { provider: string; model: string };
  bronze?: { provider: string; model: string };
}

/**
 * Threshold configuration for risk alerts
 */
export interface RiskThresholdConfig {
  critical_threshold?: number; // Score above which triggers critical alert (default: 80)
  warning_threshold?: number; // Score above which triggers warning (default: 60)
  rapid_change_threshold?: number; // % change that triggers rapid_change alert (default: 15)
  stale_hours?: number; // Hours after which assessment is considered stale (default: 24)
}

/**
 * Analysis configuration - which analysis types are enabled
 */
export interface RiskAnalysisConfig {
  riskRadar?: { enabled: boolean };
  redTeam?: {
    enabled: boolean;
    threshold?: number; // Score threshold above which debate is triggered (default: 50)
    lowConfidenceThreshold?: number; // Confidence below which debate is triggered (default: 0.5)
  };
}

export interface CreateRiskScopeData {
  organization_slug: string;
  agent_slug: string;
  name: string;
  description?: string;
  domain: 'investment' | 'business' | 'project' | 'personal';
  llm_config?: RiskLlmConfig;
  thresholds?: RiskThresholdConfig;
  analysis_config?: RiskAnalysisConfig;
  is_active?: boolean;
  is_test?: boolean;
  test_scenario_id?: string;
}

export interface UpdateRiskScopeData {
  name?: string;
  description?: string;
  domain?: 'investment' | 'business' | 'project' | 'personal';
  llm_config?: RiskLlmConfig;
  thresholds?: RiskThresholdConfig;
  analysis_config?: RiskAnalysisConfig;
  is_active?: boolean;
}
