/**
 * Build Actions (Deliverable Operations)
 *
 * All operations use the unified A2A orchestrator which:
 * - Gets ExecutionContext from the store (agentSlug, conversationId, deliverableId, etc.)
 * - Builds JSON-RPC requests via request-switch
 * - Handles responses via response-switch
 * - Updates stores automatically
 * - Handles HITL detection
 *
 * @see docs/prd/unified-a2a-orchestrator.md
 */

import { a2aOrchestrator } from '../orchestrator';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { toastController } from '@ionic/vue';
import type {
  DeliverableData,
  DeliverableVersionData,
  HitlGeneratedContent,
  HitlStatus,
} from '../legacy-types';
import type { A2AResult, StreamProgressEvent } from '../orchestrator/types';

/**
 * HITL waiting result - returned when agent needs human review before completing
 */
export interface HitlWaitingResult {
  isHitlWaiting: true;
  taskId: string;
  topic: string;
  status: HitlStatus;
  generatedContent: HitlGeneratedContent;
  agentSlug: string;
  conversationId: string;
  deliverableId?: string;
  currentVersionNumber?: number;
}

/**
 * Normal deliverable result
 */
export interface DeliverableResult {
  isHitlWaiting: false;
  deliverable: DeliverableData;
  version: DeliverableVersionData;
}

/**
 * Error result
 */
export interface ErrorResult {
  isHitlWaiting: false;
  deliverable: null;
  version: null;
  error: string;
}

/**
 * Result type that can be either HITL waiting, normal deliverable, or error
 */
export type CreateDeliverableResult = HitlWaitingResult | DeliverableResult | ErrorResult | null;

/**
 * Convert orchestrator result to CreateDeliverableResult format
 */
function convertResult(result: A2AResult): CreateDeliverableResult {
  const executionContextStore = useExecutionContextStore();
  const ctx = executionContextStore.current;

  switch (result.type) {
    case 'hitl_waiting':
      return {
        isHitlWaiting: true,
        taskId: result.taskId,
        topic: result.topic,
        status: 'hitl_waiting' as HitlStatus,
        generatedContent: result.generatedContent,
        agentSlug: ctx.agentSlug,
        conversationId: ctx.conversationId,
      };
    case 'deliverable':
      return {
        isHitlWaiting: false,
        deliverable: result.deliverable,
        version: result.version as DeliverableVersionData,
      };
    case 'error':
      console.error('[Build Actions] convertResult received an error:', result.error, result.code);
      return {
        isHitlWaiting: false,
        deliverable: null,
        version: null,
        error: result.error || 'Unknown error occurred',
      };
    default:
      return null;
  }
}

/**
 * Create a new deliverable with real-time streaming progress
 *
 * Progress is shown via toast notifications (ephemeral, non-intrusive).
 * Only the final result is added to the conversation history.
 *
 * @param userMessage - User's message requesting the deliverable
 * @returns The created deliverable and initial version, or HITL waiting result
 */
export async function createDeliverable(
  userMessage: string,
  documents?: Array<{ filename: string; mimeType: string; size: number; base64Data: string }>,
): Promise<CreateDeliverableResult> {
  const conversationsStore = useConversationsStore();
  const chatUiStore = useChatUiStore();
  const executionContextStore = useExecutionContextStore();
  const ctx = executionContextStore.current;

  // Toast reference for updating progress
  let progressToast: HTMLIonToastElement | null = null;

  try {
    chatUiStore.setIsSendingMessage(true);

    // Add user message to conversation
    conversationsStore.addMessage(ctx.conversationId, {
      conversationId: ctx.conversationId,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Create initial progress toast
    progressToast = await toastController.create({
      message: 'Starting build...',
      position: 'bottom',
      color: 'primary',
      // No duration - we'll dismiss it manually when done
    });
    await progressToast.present();

    // Execute via orchestrator WITH STREAMING
    // This connects to the observability stream first, then makes the POST request
    const result = await a2aOrchestrator.executeWithStreaming(
      'build.create',
      { userMessage, documents },
      {
        onConnect: () => {
          console.log('[Build Create] 🔌 Stream connected');
        },
        onProgress: async (event: StreamProgressEvent) => {
          const progressPercent = event.progress ?? 0;
          const progressMsg = event.message || event.step || 'Processing...';

          console.log(`[Build Create] 📦 Progress: ${progressPercent}% - ${progressMsg}`);

          // Update toast message with current progress
          if (progressToast) {
            progressToast.message = `${progressMsg} (${progressPercent}%)`;
          }
        },
        onComplete: () => {
          console.log('[Build Create] ✅ Stream complete');
        },
        onError: (error: string) => {
          console.error('[Build Create] ❌ Stream error:', error);
        },
      },
    );

    // Dismiss progress toast
    if (progressToast) {
      await progressToast.dismiss();
      progressToast = null;
    }

    // Add final assistant message based on result
    if (result.type === 'deliverable') {
      conversationsStore.addMessage(ctx.conversationId, {
        conversationId: ctx.conversationId,
        role: 'assistant',
        content: 'Deliverable created successfully',
        timestamp: new Date().toISOString(),
        metadata: {
          deliverableId: result.deliverable.id,
          custom: {
            mode: 'build',
            isCompleted: true,
          },
        },
      });

      // Show success toast
      const successToast = await toastController.create({
        message: '✅ Deliverable created!',
        duration: 2000,
        position: 'bottom',
        color: 'success',
      });
      await successToast.present();
    } else if (result.type === 'hitl_waiting') {
      conversationsStore.addMessage(ctx.conversationId, {
        conversationId: ctx.conversationId,
        role: 'assistant',
        content: 'Content generated. Waiting for your review...',
        timestamp: new Date().toISOString(),
        metadata: {
          taskId: result.taskId,
          custom: {
            hitlWaiting: true,
            mode: 'build',
          },
        },
      });

      // Show HITL toast
      const hitlToast = await toastController.create({
        message: '⏳ Awaiting your review',
        duration: 3000,
        position: 'bottom',
        color: 'warning',
      });
      await hitlToast.present();
    } else if (result.type === 'message') {
      // Conversational response from BUILD mode (e.g., RAG agent with no results)
      conversationsStore.addMessage(ctx.conversationId, {
        conversationId: ctx.conversationId,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
        metadata: {
          ...result.metadata,
          custom: {
            mode: 'build',
            isConversational: true,
            ...(result.metadata?.custom || {}),
          },
        },
      });

      // No toast needed - this is a normal conversational response
    } else if (result.type === 'error') {
      conversationsStore.addMessage(ctx.conversationId, {
        conversationId: ctx.conversationId,
        role: 'assistant',
        content: `Error: ${result.error}`,
        timestamp: new Date().toISOString(),
        metadata: {
          custom: {
            mode: 'build',
            error: result.error,
          },
        },
      });

      // Show error toast
      const errorToast = await toastController.create({
        message: `❌ ${result.error}`,
        duration: 4000,
        position: 'bottom',
        color: 'danger',
      });
      await errorToast.present();
    }

    chatUiStore.setIsSendingMessage(false);
    return convertResult(result);
  } catch (error) {
    console.error('[Build Create] Error:', error);

    // Dismiss progress toast on error
    if (progressToast) {
      await progressToast.dismiss();
    }

    // Show error toast
    const errorToast = await toastController.create({
      message: `❌ ${error instanceof Error ? error.message : 'Failed to create deliverable'}`,
      duration: 4000,
      position: 'bottom',
      color: 'danger',
    });
    await errorToast.present();

    chatUiStore.setIsSendingMessage(false);
    conversationsStore.setError(
      error instanceof Error ? error.message : 'Failed to create deliverable',
    );
    throw error;
  }
}

/**
 * Read an existing deliverable
 *
 * @param versionId - Optional specific version ID
 * @returns The deliverable and version data
 */
export async function readDeliverable(
  versionId?: string,
): Promise<{ deliverable: DeliverableData; version?: DeliverableVersionData }> {
  const result = await a2aOrchestrator.execute('build.read', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'deliverable') {
    throw new Error('Unexpected response type');
  }

  return { deliverable: result.deliverable, version: result.version };
}

/**
 * Edit an existing deliverable
 *
 * @param editInstructions - Instructions for the edit
 * @returns The updated deliverable and new version
 */
export async function editDeliverable(
  editInstructions: string,
): Promise<{ deliverable: DeliverableData; version: DeliverableVersionData }> {
  const result = await a2aOrchestrator.execute('build.edit', {
    userMessage: editInstructions,
  });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'deliverable') {
    throw new Error('Unexpected response type');
  }

  return { deliverable: result.deliverable, version: result.version as DeliverableVersionData };
}

/**
 * List deliverables for the current conversation
 *
 * @returns Array of deliverables
 */
export async function listDeliverables(): Promise<DeliverableData[]> {
  const result = await a2aOrchestrator.execute('build.list', {});

  if (result.type === 'error') {
    throw new Error(result.error);
  }

  // TODO: Update response-switch to properly handle build.list responses
  console.warn('listDeliverables: Response handling needs implementation in response-switch');
  return [];
}

/**
 * Rerun deliverable with different LLM
 *
 * @param versionId - Version ID to rerun from
 * @param llmConfig - LLM configuration
 * @param userMessage - Optional user message for the rerun
 * @returns The new version
 */
export async function rerunDeliverable(
  versionId: string,
  llmConfig: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
  userMessage?: string,
): Promise<{ deliverable: DeliverableData; version: DeliverableVersionData }> {
  console.log('🔍 [RERUN-DELIVERABLE] Starting rerun with:', { versionId, llmConfig, userMessage });
  const result = await a2aOrchestrator.execute('build.rerun', {
    versionId,
    rerunLlmOverride: llmConfig,
    userMessage,
  });
  console.log('🔍 [RERUN-DELIVERABLE] Orchestrator result:', { type: result.type, hasDeliverable: 'deliverable' in result, hasVersion: 'version' in result });

  if (result.type === 'error') {
    console.log('🔍 [RERUN-DELIVERABLE] Error result:', result.error);
    throw new Error(result.error);
  }
  if (result.type !== 'deliverable') {
    console.log('🔍 [RERUN-DELIVERABLE] Unexpected type:', result.type);
    throw new Error('Unexpected response type');
  }

  console.log('🔍 [RERUN-DELIVERABLE] Success - returning deliverable and version');
  return { deliverable: result.deliverable, version: result.version as DeliverableVersionData };
}

/**
 * Set current version of a deliverable
 *
 * @param versionId - Version ID to set as current
 */
export async function setCurrentVersion(versionId: string): Promise<void> {
  const result = await a2aOrchestrator.execute('build.set_current', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Delete a deliverable version
 *
 * @param versionId - Version ID to delete
 */
export async function deleteVersion(versionId: string): Promise<void> {
  const result = await a2aOrchestrator.execute('build.delete_version', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Delete the current deliverable
 */
export async function deleteDeliverable(): Promise<void> {
  const result = await a2aOrchestrator.execute('build.delete', {});

  if (result.type === 'error') {
    throw new Error(result.error);
  }
}

/**
 * Copy a deliverable version
 *
 * @param versionId - Version ID to copy
 * @returns The new copied version
 */
export async function copyVersion(
  versionId: string,
): Promise<{ deliverable: DeliverableData; version: DeliverableVersionData }> {
  const result = await a2aOrchestrator.execute('build.copy_version', { versionId });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'deliverable') {
    throw new Error('Unexpected response type');
  }

  return { deliverable: result.deliverable, version: result.version as DeliverableVersionData };
}

/**
 * Merge multiple deliverable versions
 *
 * @param versionIds - Version IDs to merge
 * @param mergePrompt - Prompt for how to merge the versions
 * @param userMessage - Optional user message
 * @returns The merged version
 */
export async function mergeVersions(
  versionIds: string[],
  mergePrompt: string,
  userMessage?: string,
): Promise<{ deliverable: DeliverableData; version: DeliverableVersionData }> {
  const result = await a2aOrchestrator.execute('build.merge_versions', {
    versionIds,
    mergePrompt,
    userMessage,
  });

  if (result.type === 'error') {
    throw new Error(result.error);
  }
  if (result.type !== 'deliverable') {
    throw new Error('Unexpected response type');
  }

  return { deliverable: result.deliverable, version: result.version as DeliverableVersionData };
}
