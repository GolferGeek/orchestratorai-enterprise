import type { JsonObject } from '@orchestrator-ai/transport-types';

export type AgentType = 'context' | 'api' | 'external';

export interface CreateAgentPayload {
  organization_slug?: string | null;
  slug: string;
  display_name: string;
  agent_type: AgentType;
  mode_profile: string;
  yaml?: string;
  description?: string | null;
  agent_card?: JsonObject | null;
  context?: JsonObject | null;
  config?: JsonObject | null;
}

// Type for JSON schema objects
type JsonSchema = Record<string, unknown>;

// Common base schema for all agents
export const baseAgentSchema: JsonSchema = {
  type: 'object',
  properties: {
    organization_slug: { type: 'string', nullable: true },
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{1,62}$' },
    display_name: { type: 'string' },
    agent_type: {
      type: 'string',
      enum: ['context', 'api', 'external'] as AgentType[],
    },
    mode_profile: { type: 'string' },
    yaml: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    agent_card: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
    },
    context: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
    },
    config: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
    },
  },
  required: ['slug', 'display_name', 'agent_type', 'mode_profile'],
  additionalProperties: true,
};

// Context agent should provide either `context` object or `yaml`
export const contextAgentSchema: JsonSchema = {
  ...baseAgentSchema,
};

// API agent expects api_configuration under config
export const apiAgentSchema: JsonSchema = {
  ...baseAgentSchema,
};

// External agent for A2A protocol
export const externalAgentSchema: JsonSchema = {
  ...baseAgentSchema,
};

export function schemaFor(type: AgentType) {
  switch (type) {
    case 'context':
      return contextAgentSchema;
    case 'api':
      return apiAgentSchema;
    case 'external':
      return externalAgentSchema;
    default:
      return baseAgentSchema;
  }
}
