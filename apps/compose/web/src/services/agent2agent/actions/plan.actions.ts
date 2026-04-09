/**
 * Plan Actions
 *
 * All operations use the unified A2A orchestrator which:
 * - Gets ExecutionContext from the store (agentSlug, conversationId, planId, etc.)
 * - Builds JSON-RPC requests via request-switch
 * - Handles responses via response-switch
 * - Updates stores automatically
 *
 * @see docs/prd/unified-a2a-orchestrator.md
 */

import { a2aOrchestrator } from '../orchestrator';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import type { PlanData, PlanVersionData } from '@/types/plan';

/**
 * Result type for plan creation
 */
export interface CreatePlanResult {
  plan: PlanData;
  version: PlanVersionData;
  isNew: boolean;
}

/**
 * Create a new plan
 *
 * @param userMessage - User's message requesting the plan
 * @returns The created plan and initial version
 */
export async function createPlan(
  userMessage: string,
  documents?: Array<{ filename: string; mimeType: string; size: number; base64Data: string }>,
): Promise<CreatePlanResult> {
  const conversationsStore = useConversationsStore();
  const chatUiStore = useChatUiStore();
  const executionContextStore = useExecutionContextStore();
  const ctx = executionContextStore.current;

  try {
    chatUiStore.setIsSendingMessage(true);

    // Add user message to conversation
    conversationsStore.addMessage(ctx.conversationId, {
      conversationId: ctx.conversationId,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      metadata: {},
    });

    // Create assistant message placeholder
    const assistantMessage = conversationsStore.addMessage(ctx.conversationId, {
      conversationId: ctx.conversationId,
      role: 'assistant',
      content: 'Creating plan...',
      timestamp: new Date().toISOString(),
      metadata: { custom: { mode: 'plan' } },
    });

    // Execute via orchestrator
    const result = await a2aOrchestrator.execute('plan.create', { userMessage, documents });

    // Update assistant message based on result
    if (result.type === 'plan') {
      conversationsStore.updateMessage(ctx.conversationId, assistantMessage.id, {
        content: 'Plan created successfully',
      });
      conversationsStore.updateMessageMetadata(ctx.conversationId, assistantMessage.id, {
        custom: {
          planId: result.plan.id,
          mode: 'plan',
          isCompleted: true,
        },
      });

      chatUiStore.setIsSendingMessage(false);

      return {
        plan: result.plan,
        version: result.version as PlanVersionData,
        isNew: true,
      };
    } else if (result.type === 'error') {
      conversationsStore.updateMessage(ctx.conversationId, assistantMessage.id, {
        content: `Error: ${result.error}`,
      });
      conversationsStore.updateMessageMetadata(ctx.conversationId, assistantMessage.id, {
        custom: {
          mode: 'plan',
          error: result.error,
        },
      });

      chatUiStore.setIsSendingMessage(false);
      throw new Error(result.error);
    }

    // Unexpected result type
    chatUiStore.setIsSendingMessage(false);
    throw new Error('Unexpected response type');
  } catch (error) {
    console.error('[Plan Create] Error:', error);
    chatUiStore.setIsSendingMessage(false);
    conversationsStore.setError(
      error instanceof Error ? error.message : 'Failed to create plan',
    );
    throw error;
  }
}

/**
 * Read an existing plan
 *
 * @param versionId - Optional specific version ID
 * @returns The plan and version data
 */
export async function readPlan(
  versionId?: string,
): Promise<{ plan: PlanData; version?: PlanVersionData }> {
  const result = await a2aOrchestrator.execute('plan.read', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'plan') {
    throw new Error('Unexpected response type');
  }

  return { plan: result.plan, version: result.version };
}

/**
 * Rerun plan with different LLM
 *
 * @param versionId - Version ID to rerun from
 * @param llmConfig - LLM configuration for rerun
 * @param userMessage - Optional user message for the rerun
 * @returns The new plan version
 */
export async function rerunPlan(
  versionId: string,
  llmConfig: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  userMessage?: string,
): Promise<{ plan: PlanData; version: PlanVersionData }> {
  const result = await a2aOrchestrator.execute('plan.rerun', {
    versionId,
    rerunLlmOverride: llmConfig,
    userMessage,
  });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'plan') {
    throw new Error('Unexpected response type');
  }

  return { plan: result.plan, version: result.version as PlanVersionData };
}

/**
 * Set current version of a plan
 *
 * @param versionId - Version ID to set as current
 */
export async function setCurrentPlanVersion(versionId: string): Promise<void> {
  const result = await a2aOrchestrator.execute('plan.set_current', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Delete a plan version
 *
 * @param versionId - Version ID to delete
 */
export async function deletePlanVersion(versionId: string): Promise<void> {
  const result = await a2aOrchestrator.execute('plan.delete_version', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Delete the current plan
 */
export async function deletePlan(): Promise<void> {
  const result = await a2aOrchestrator.execute('plan.delete', {});

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Copy a plan version
 *
 * @param versionId - Version ID to copy
 * @returns The new copied version
 */
export async function copyPlanVersion(
  versionId: string,
): Promise<{ plan: PlanData; version: PlanVersionData }> {
  const result = await a2aOrchestrator.execute('plan.copy_version', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'plan') {
    throw new Error('Unexpected response type');
  }

  return { plan: result.plan, version: result.version as PlanVersionData };
}

/**
 * Merge multiple plan versions
 *
 * @param versionIds - Version IDs to merge
 * @param mergePrompt - Prompt for how to merge the versions
 * @param userMessage - Optional user message
 * @returns The merged version
 */
export async function mergePlanVersions(
  versionIds: string[],
  mergePrompt: string,
  userMessage?: string,
): Promise<{ plan: PlanData; version: PlanVersionData }> {
  const result = await a2aOrchestrator.execute('plan.merge_versions', {
    versionIds,
    mergePrompt,
    userMessage,
  });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'plan') {
    throw new Error('Unexpected response type');
  }

  return { plan: result.plan, version: result.version as PlanVersionData };
}

/**
 * Edit an existing plan
 *
 * @param editInstructions - Instructions for the edit
 * @returns The updated plan and new version
 */
export async function editPlan(
  editInstructions: string,
): Promise<{ plan: PlanData; version: PlanVersionData }> {
  const result = await a2aOrchestrator.execute('plan.edit', {
    userMessage: editInstructions,
  });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'plan') {
    throw new Error('Unexpected response type');
  }

  return { plan: result.plan, version: result.version as PlanVersionData };
}

/**
 * List plans for the current conversation
 *
 * @returns Array of plans
 */
export async function listPlans(): Promise<PlanData[]> {
  const result = await a2aOrchestrator.execute('plan.list', {});

  if (result.type === 'error') {
    throw new Error(result.error);
  }

  // TODO: Update response-switch to properly handle plan.list responses
  console.warn('listPlans: Response handling needs implementation in response-switch');
  return [];
}
