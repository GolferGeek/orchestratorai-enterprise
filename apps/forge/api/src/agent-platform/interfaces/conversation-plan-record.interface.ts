import type { JsonObject } from '@orchestrator-ai/transport-types';

export interface ConversationPlanRecord {
  id: string;
  conversation_id: string;
  organization_slug: string | null;
  agent_slug: string;
  version: number;
  status: string;
  summary: string | null;
  plan_json: JsonObject;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationPlanDraftInput {
  conversation_id: string;
  organization_slug: string | null;
  agent_slug: string;
  summary?: string | null;
  plan_json: JsonObject;
  created_by?: string | null;
}

export interface ConversationPlanStatusUpdate {
  status: string;
  summary?: string | null;
  plan_json?: JsonObject;
  approved_by?: string | null;
}

export interface ConversationPlanStatusPatch extends ConversationPlanStatusUpdate {
  updated_at: string;
}
