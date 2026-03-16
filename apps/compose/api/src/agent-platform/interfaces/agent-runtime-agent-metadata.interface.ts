import type { JsonObject } from '@orchestrator-ai/transport-types';

export interface AgentRuntimeAgentMetadata extends JsonObject {
  id: string | null;
  slug: string;
  displayName?: string | null;
  type?: string | null;
  organizationSlug?: string | null;
}
