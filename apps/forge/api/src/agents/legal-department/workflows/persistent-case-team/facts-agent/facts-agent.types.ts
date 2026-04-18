import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export interface ExtractedEntity {
  entityType: string;
  name: string;
  description: string | null;
  role: string | null;
}

export interface ExtractedTimelineEntry {
  eventDateRaw: string;
  eventDate: string | null;
  eventType: string;
  description: string;
  significance: string | null;
  partiesInvolved: string[];
}

export interface FactsAgentInput {
  context: ExecutionContext;
  matterId: string;
  documentId: string;
  storagePath: string;
}

export interface FactsAgentResult {
  status: 'completed' | 'failed';
  error?: string;
  entitiesExtracted: number;
  timelineEntriesExtracted: number;
  duration: number;
}
