import type { JsonObject } from './json.types';

/**
 * Shared Data Types
 * Common data structures used across the application
 */

/**
 * Plan Data Structure
 */
export interface PlanData {
  id: string;
  conversationId: string;
  userId: string;
  agentName: string;
  organization: string;
  title: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Plan Version Data Structure
 */
export interface PlanVersionData {
  id: string;
  planId: string;
  versionNumber: number;
  content: string;
  format: 'markdown' | 'json';
  createdByType: 'agent' | 'user';
  createdById: string | null;
  // Optional: task that produced this version (present for agent-created versions)
  taskId?: string;
  metadata?: JsonObject;
  isCurrentVersion: boolean;
  createdAt: string;
}

/**
 * Deliverable Data Structure
 */
export interface DeliverableData {
  id: string;
  conversationId: string;
  userId: string;
  agentName: string;
  organization: string;
  title: string;
  type: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Deliverable Version Data Structure
 */
export interface DeliverableVersionData {
  id: string;
  deliverableId: string;
  versionNumber: number;
  content: string;
  format: 'markdown' | 'json' | 'html';
  createdByType: 'agent' | 'user';
  createdById: string | null;
  metadata?: JsonObject;
  isCurrentVersion: boolean;
  createdAt: string;
}
