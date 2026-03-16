/**
 * Agent Definition V2
 *
 * Simplified agent definition for Compose's five families.
 * Replaces the old AgentRecord + AgentRuntimeDefinition with a lean,
 * single-action, typed-output model.
 */

import type { OutputType } from '@orchestrator-ai/transport-types';

/**
 * Compose agent family types.
 */
export type AgentFamily = 'context' | 'rag' | 'api' | 'external' | 'media';

/**
 * Per-agent LLM configuration.
 * The agent definition supplies the default; the runtime may allow user override.
 */
export interface AgentLLMConfig {
  /** Default provider */
  provider?: string;

  /** Default model */
  model?: string;

  /** Temperature */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Additional LLM options */
  [key: string]: unknown;
}

/**
 * Agent Definition V2 — one row = one single-action agent.
 */
export interface AgentDefinitionV2 {
  /** Stable unique identifier */
  id: string;

  /** Human-meaningful routing identifier */
  slug: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Agent family — drives runner selection */
  agentType: AgentFamily;

  /** Agent status */
  status: 'draft' | 'active' | 'disabled' | 'archived';

  /** System prompt / static context */
  context?: string;

  /** Per-agent LLM configuration */
  llmConfig?: AgentLLMConfig;

  /** Declared output type */
  outputType: OutputType;

  /** Organization scope */
  orgSlug?: string;

  // ─── Family-specific fields ──────────────────────────────────

  /** RAG: collection slug for vector search */
  collectionSlug?: string;

  /** API: remote endpoint URL */
  endpoint?: string;

  /** API: auth configuration */
  authConfig?: Record<string, unknown>;

  /** External: remote capability card or descriptor */
  externalCard?: Record<string, unknown>;

  /** Media: provider and generation config */
  mediaConfig?: Record<string, unknown>;
}
