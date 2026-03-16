import type {
  JsonObject,
  PlanVersionData,
} from '@orchestrator-ai/transport-types';

/**
 * Plan - Main plan entity
 */
export interface Plan {
  id: string;
  conversationId: string;
  userId: string;
  agentName: string;
  organization: string;
  title: string;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentVersion?: PlanVersionData | null;
}

/**
 * PlanVersion - Individual plan version
 */
export interface PlanVersion {
  id: string;
  planId: string;
  versionNumber: number;
  content: string;
  format: 'markdown' | 'json' | 'text';
  createdByType: 'agent' | 'user';
  createdById?: string;
  taskId?: string;
  metadata?: JsonObject;
  isCurrentVersion: boolean;
  createdAt: Date;
}

/**
 * CreatePlanVersionDto - DTO for creating a new plan version
 */
export interface CreatePlanVersionDto {
  content: string;
  format: 'markdown' | 'json' | 'text';
  createdByType: 'agent' | 'user';
  createdById?: string;
  taskId?: string;
  metadata?: JsonObject;
}

/**
 * Plan operation parameter types
 */
export type PlanCreateParams = {
  title: string;
  content: string;
  format?: 'markdown' | 'json' | 'text';
  agentName?: string;
  organization?: string;
  taskId?: string;
  metadata?: JsonObject;
};

export type PlanEditParams = {
  content: string;
  metadata?: JsonObject;
};

export type PlanRerunParams = {
  versionId: string;
  config: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
};

export type PlanSetCurrentParams = { versionId: string };
export type PlanTargetVersionParams = { versionId: string };

export type PlanMergeParams = {
  versionIds: string[];
  mergePrompt: string;
  planStructure?: unknown;
  llmConfig?: JsonObject | null;
  preferredFormat?: 'markdown' | 'json' | 'text';
};

export type PlanCopyParams = {
  versionId: string;
};
