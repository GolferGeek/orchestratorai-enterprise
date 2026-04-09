/**
 * Plan Service
 * Handles all async operations for plans including API calls
 * Follows three-layer architecture: service handles all async/API, store handles state
 */

import { apiService } from './apiService';
import { invoke } from './invoke-client';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import type { PlanVersionData } from '@/types/forge-types';
import type { JsonObject } from '@/types';

type PlanVersionApiResponse = {
  id: string;
  planId: string;
  versionNumber: number;
  content: string;
  format: string;
  createdByType: 'agent' | 'user';
  createdById?: string | null;
  taskId?: string | null;
  metadata?: JsonObject | null;
  isCurrentVersion?: boolean;
  createdAt: string | Date;
};

type PlanConversationApiResponse = {
  id: string;
  conversationId: string;
  userId: string;
  agentName: string;
  organization?: string | null;
  organizationSlug?: string | null;
  title?: string | null;
  currentVersionId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  versions?: PlanVersionApiResponse[];
};

const isJsonObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isPlanVersionApiResponse = (value: unknown): value is PlanVersionApiResponse => {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as Partial<PlanVersionApiResponse>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.planId === 'string'
    && typeof candidate.versionNumber === 'number'
    && typeof candidate.content === 'string'
    && typeof candidate.format === 'string'
    && (candidate.createdByType === 'agent' || candidate.createdByType === 'user')
    && (typeof candidate.createdAt === 'string' || candidate.createdAt instanceof Date)
  );
};

const isPlanConversationApiResponse = (value: unknown): value is PlanConversationApiResponse => {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as Partial<PlanConversationApiResponse>;

  const versionsValid =
    candidate.versions === undefined
    || (Array.isArray(candidate.versions)
      && candidate.versions.every(isPlanVersionApiResponse));

  return (
    typeof candidate.id === 'string'
    && typeof candidate.conversationId === 'string'
    && typeof candidate.userId === 'string'
    && typeof candidate.agentName === 'string'
    && (typeof candidate.createdAt === 'string' || candidate.createdAt instanceof Date)
    && (typeof candidate.updatedAt === 'string' || candidate.updatedAt instanceof Date)
    && versionsValid
  );
};

const toIsoString = (value: string | Date): string => (
  typeof value === 'string' ? value : value.toISOString()
);

const normalizePlanVersion = (version: PlanVersionApiResponse): PlanVersionData => {
  const format = version.format === 'json' ? 'json' : 'markdown';

  return {
    id: version.id,
    planId: version.planId,
    versionNumber: version.versionNumber,
    content: version.content,
    format,
    createdByType: version.createdByType,
    createdById: version.createdById ?? null,
    taskId: version.taskId ?? undefined,
    metadata: isJsonObject(version.metadata) ? version.metadata : undefined,
    isCurrent: Boolean(version.isCurrentVersion),
    createdAt: toIsoString(version.createdAt),
  };
};

/**
 * Plan Service
 * All async operations and API calls for plans
 */
class PlanService {
  /**
   * Load plans by conversation ID from the API
   * Returns the plan data with versions to be added to the store by the caller
   */
  async loadPlansByConversation(conversationId: string): Promise<{
    plan: {
      id: string;
      conversationId: string;
      userId: string;
      agentName: string;
      organization: string;
      title: string;
      currentVersionId: string;
      createdAt: string;
      updatedAt: string;
    };
    versions: PlanVersionData[];
    currentVersionId?: string;
  } | null> {
    try {
      const response = await apiService.get<PlanConversationApiResponse | null>(
        `/plans/conversation/${conversationId}`
      );

      if (!response) {
        return null;
      }

      if (!isPlanConversationApiResponse(response)) {
        throw new Error('Received malformed plan conversation response');
      }

      // Map the API response to plan data
      const plan = {
        id: response.id,
        conversationId: response.conversationId,
        userId: response.userId,
        agentName: response.agentName,
        organization: response.organization ?? response.organizationSlug ?? '',
        title: response.title ?? '',
        currentVersionId: response.currentVersionId ?? '',
        createdAt: toIsoString(response.createdAt),
        updatedAt: toIsoString(response.updatedAt),
      };

      // Map versions
      const versions: PlanVersionData[] = [];
      if (response.versions && Array.isArray(response.versions)) {
        response.versions.forEach((versionData) => {
          const version = normalizePlanVersion(versionData);
          versions.push(version);
        });
      }

      return {
        plan,
        versions,
        currentVersionId: response.currentVersionId ?? undefined,
      };
    } catch (error) {
      console.error('[planService.loadPlansByConversation] Error loading plan:', error);
      return null;
    }
  }

  /**
   * Rerun plan creation with a different LLM
   * Uses the plan rerun action via the v2 invoke contract
   */
  async rerunWithDifferentLLM(
    _agentName: string,
    conversationId: string,
    versionId: string,
    llmSelection: {
      providerName?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<PlanVersionData> {
    try {
      if (!conversationId) {
        throw new Error('Cannot rerun: missing conversationId');
      }

      // Call invoke directly with the plan rerun payload
      const ctx = useExecutionContextStore().current;
      const result = await invoke(
        ctx,
        {
          content: {
            mode: 'plan',
            payload: {
              action: 'rerun',
              versionId,
              config: {
                provider: llmSelection.providerName,
                model: llmSelection.modelName,
                temperature: llmSelection.temperature,
                maxTokens: llmSelection.maxTokens,
              },
              conversationId,
            },
          },
        },
        { baseUrl: getSecureApiBaseUrl() },
        { trigger: 'plan.rerun' },
      );

      if (!result.success) {
        console.error('❌ [Plan Rerun] Failed:', result.error);
        throw new Error(result.error.message || 'Failed to rerun plan');
      }

      // Extract the new version from the invoke output
      const outputContent = result.output.content as Record<string, unknown> | undefined;
      const newVersion = (outputContent?.version as PlanVersionData | undefined) ||
        ((outputContent?.plan as Record<string, unknown> | undefined)?.version as PlanVersionData | undefined);

      if (!newVersion) {
        console.error('❌ [Plan Rerun] No version in response:', outputContent);
        throw new Error('Rerun succeeded but did not return a version');
      }

      return newVersion;
    } catch (error) {
      console.error('Failed to rerun plan with different LLM:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}

// Export singleton instance
export const planService = new PlanService();
