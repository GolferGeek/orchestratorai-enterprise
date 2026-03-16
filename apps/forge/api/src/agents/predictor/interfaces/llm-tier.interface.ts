/**
 * LLM tier resolution interface - maps tiers to actual providers/models
 * Based on prediction.llm_tier_mapping view
 */

/**
 * LLM tier assignment
 * - gold: Highest capability model (e.g., GPT-4, Claude Opus)
 * - silver: Mid-tier model (e.g., GPT-3.5 Turbo, Claude Sonnet)
 * - bronze: Efficient model (e.g., GPT-3.5, Claude Haiku)
 */
export type LlmTier = 'gold' | 'silver' | 'bronze';

/**
 * LLM tier mapping from database view
 * Maps tier to provider, model, and model tier
 */
export interface LlmTierMapping {
  tier: LlmTier;
  provider: string;
  model: string;
  model_tier: string;
}

/**
 * Resolved LLM tier with pricing information
 * Used for cost calculation and tracking
 */
export interface ResolvedLlmTier {
  tier: LlmTier;
  provider: string;
  model: string;
  pricing?: {
    input_per_1k: number;
    output_per_1k: number;
  };
}
