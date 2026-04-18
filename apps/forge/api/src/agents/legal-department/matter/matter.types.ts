import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export type MatterType =
  | 'litigation'
  | 'transactional'
  | 'advisory'
  | 'regulatory';
export type MatterStatus = 'active' | 'closed' | 'archived';
export type DocumentClass =
  | 'contract'
  | 'deposition'
  | 'court_filing'
  | 'correspondence'
  | 'evidence'
  | 'other';
export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'amount'
  | 'contract'
  | 'claim'
  | 'exhibit'
  | 'other';
export type EventType =
  | 'filing'
  | 'deposition'
  | 'hearing'
  | 'communication'
  | 'transaction'
  | 'discovery'
  | 'other';
export type EventSignificance = 'critical' | 'high' | 'medium' | 'low';

export interface MatterRow {
  id: string;
  org_slug: string;
  created_by: string;
  name: string;
  client_name: string;
  matter_type: MatterType;
  jurisdiction: string;
  opposing_parties: string[];
  assigned_user_ids: string[];
  status: MatterStatus;
  description: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface MatterDocumentRow {
  id: string;
  matter_id: string;
  org_slug: string;
  storage_path: string;
  original_name: string;
  document_class: DocumentClass | null;
  document_date: string | null;
  parties: string[];
  key_terms: string[];
  summary: string | null;
  metadata: Record<string, unknown>;
  facts_processed: boolean;
  docs_processed: boolean;
  uploaded_at: string;
  uploaded_by: string;
}

export interface MatterEntityRow {
  id: string;
  matter_id: string;
  org_slug: string;
  entity_type: EntityType;
  name: string;
  description: string | null;
  role: string | null;
  source_document_ids: string[];
  first_seen_at: string;
  updated_at: string;
}

export interface MatterTimelineRow {
  id: string;
  matter_id: string;
  org_slug: string;
  event_date: string | null;
  event_date_raw: string;
  event_type: EventType;
  description: string;
  significance: EventSignificance | null;
  parties_involved: string[];
  source_document_id: string;
  created_at: string;
}

export interface CreateMatterDto {
  context: ExecutionContext;
  data: {
    name: string;
    clientName: string;
    matterType: MatterType;
    jurisdiction: string;
    opposingParties?: string[];
    assignedUserIds?: string[];
    description?: string;
  };
}

export interface UpdateMatterDto {
  context: ExecutionContext;
  data: {
    name?: string;
    clientName?: string;
    status?: MatterStatus;
    assignedUserIds?: string[];
    description?: string;
  };
}

export interface UploadDocumentResponse {
  documentId: string;
  storagePath: string;
  factsJobId: string;
  docsJobId: string;
}
