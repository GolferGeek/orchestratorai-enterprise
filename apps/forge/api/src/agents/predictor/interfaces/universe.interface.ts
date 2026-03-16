/**
 * Universe entity interface - represents a prediction universe (domain/strategy context)
 * Based on prediction.universes table
 */

export interface Universe {
  id: string;
  organization_slug: string;
  agent_slug: string;
  name: string;
  description: string | null;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  strategy_id: string | null;
  llm_config: LlmConfig | null;
  thresholds: ThresholdConfig | null;
  notification_config: NotificationConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * LLM tier configuration for universe
 * Maps tier (gold/silver/bronze) to provider and model
 */
export interface LlmConfig {
  gold?: { provider: string; model: string };
  silver?: { provider: string; model: string };
  bronze?: { provider: string; model: string };
}

/**
 * Threshold configuration for prediction generation
 * Defines minimum requirements for creating predictions
 */
export interface ThresholdConfig {
  min_predictors?: number;
  min_combined_strength?: number;
  min_direction_consensus?: number;
  predictor_ttl_hours?: number;
}

/**
 * Notification configuration for universe
 * Defines which events trigger notifications and through which channels
 */
export interface NotificationConfig {
  urgent_enabled: boolean;
  new_prediction_enabled: boolean;
  outcome_enabled: boolean;
  channels: ('push' | 'sms' | 'email' | 'sse')[];
}

export interface CreateUniverseData {
  organization_slug: string;
  agent_slug: string;
  name: string;
  description?: string;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  strategy_id?: string;
  llm_config?: LlmConfig;
  thresholds?: ThresholdConfig;
  notification_config?: NotificationConfig;
  is_active?: boolean;
}

export interface UpdateUniverseData {
  name?: string;
  description?: string;
  domain?: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  strategy_id?: string;
  llm_config?: LlmConfig;
  thresholds?: ThresholdConfig;
  notification_config?: NotificationConfig;
  is_active?: boolean;
}
