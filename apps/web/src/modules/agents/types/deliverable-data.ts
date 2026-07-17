/**
 * Deliverable Data Types (transport-level)
 *
 * These types represent deliverable data as returned by the A2A/invoke transport layer.
 * They differ from service-level types in `deliverablesService.ts` which use camelCase enums.
 *
 * Migrated from services/agent2agent/legacy-types.ts as part of A2A-001 migration.
 */

export interface DeliverableData {
  id: string;
  userId?: string;
  agentName?: string;
  organization?: string;
  conversationId?: string;
  title?: string;
  type?: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DeliverableVersionData {
  id: string;
  deliverableId: string;
  versionNumber: number;
  content: string;
  format?: 'markdown' | 'json' | 'html' | string;
  isCurrentVersion?: boolean;
  createdByType?: 'agent' | 'user' | string;
  createdById?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}
