/**
 * Agent Definition
 *
 * Simplified agent definition for the Agents module's five families.
 * Replaces the old AgentRecord + AgentRuntimeDefinition with a lean,
 * single-action, typed-output model.
 */

import type { OutputType } from '@orchestrator-ai/transport-types';

/**
 * Agent family types.
 */
export type AgentFamily = 'context' | 'rag' | 'api' | 'a2a' | 'media';

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
 * Agent Definition — one row = one single-action agent.
 */
export interface AgentDefinition {
  /** Stable unique identifier */
  id: string;

  /** Human-meaningful routing identifier */
  slug: string;

  /** Display name */
  name: string;

  /** The row's version (published on an A2A card) */
  version: string;

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

  /** API: how to authenticate to the endpoint (endpoint.auth) */
  outboundAuth?: OutboundAuth;

  /** A2A: what a call to this agent fires (metadata.a2a) */
  a2a?: A2AAgentConfig;

  /** Media: provider and generation config */
  mediaConfig?: Record<string, unknown>;

  /**
   * Jev rubrics run on every answer (metadata.jev_guards). Each rubric input
   * is fed from the agent's `output` or the user's `message`.
   */
  guards?: AgentGuard[];
}

export interface AgentGuard {
  rubric: string;
  inputs: Record<string, 'output' | 'message'>;
}

/**
 * Credentials for an outbound call. The token is never stored on the agent:
 * `secret` names a key in the config provider (env, Key Vault, ...).
 */
export interface OutboundAuth {
  type: 'bearer' | 'apikey';
  secret: string;
  /** Header to send the token in; defaults to Authorization. */
  header?: string;
}

/**
 * An A2A agent: a call to it fires its target.
 * - ambient: push the named event (the caller gets "received")
 * - agent: invoke an internal agent and return its answer
 * - workflow: queue a workflow run (the caller gets the run id)
 * - a2a: send the message to a remote A2A v1.0 agent and return its answer
 */
export type A2ATarget =
  | { kind: 'ambient'; event: string }
  | { kind: 'agent'; agentSlug: string }
  | {
      kind: 'workflow';
      workflowSlug: string;
      /** Fixed start input, merged with the message's data. */
      input?: Record<string, unknown>;
      /** The start input field the message text goes into. */
      textField?: string;
    }
  | {
      kind: 'a2a';
      cardUrl: string;
      auth?: OutboundAuth;
      /**
       * What of the message goes out: 'all' (text, plus any other fields as a
       * data part) or 'text' only, for agents that read a data part as a
       * structured request of their own.
       */
      send: 'all' | 'text';
    };

export interface A2AAgentConfig {
  target: A2ATarget;
  /**
   * Who may call it through the Gatehouse: any registered caller (the
   * default), or only these registered agent card URLs.
   */
  callers: 'any' | { allow: string[] };
}
