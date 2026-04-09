/**
 * Plan Types
 *
 * Domain types for plans and plan versions.
 * Migrated from services/agent2agent/legacy-types.ts as part of A2A-001 migration.
 */

export interface PlanData {
  id: string;
  conversationId: string;
  userId?: string;
  agentName?: string;
  organization?: string;
  status?: string;
  summary?: string | null;
  currentVersionId?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface PlanVersionData {
  id: string;
  planId?: string;
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
  [key: string]: unknown;
}
