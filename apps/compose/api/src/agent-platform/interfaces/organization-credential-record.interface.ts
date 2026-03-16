import type { JsonObject } from '@orchestrator-ai/transport-types';

export interface OrganizationCredentialRecord {
  id: string;
  organization_slug: string;
  alias: string;
  credential_type: string;
  encrypted_value: string; // bytea is returned as base64 string by Supabase JS
  encryption_metadata: JsonObject;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCredentialUpsertInput {
  organization_slug: string;
  alias: string;
  credential_type: string;
  encrypted_value: string;
  encryption_metadata?: JsonObject;
  rotated_at?: string | null;
}
