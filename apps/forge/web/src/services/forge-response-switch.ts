/**
 * Response Switch - Handles all A2A responses based on response mode
 *
 * This module processes API responses and updates the appropriate stores.
 * The response mode determines what we do - and it may differ from request mode!
 *
 * CRITICAL: The response mode may differ from the request mode!
 * - BUILD request can return HITL response (hitl_waiting)
 * - HITL request can return BUILD response (completed with deliverable)
 *
 * CRITICAL: Updates ExecutionContext store after every response!
 * The backend may have updated the context (added planId/deliverableId),
 * so we must update the store with the returned context.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Response Switch Implementation
 */

import type { A2AResult } from './forge-orchestrator-types';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  TaskResponse,
  HitlDeliverableResponse,
  PlanData,
  PlanVersionData,
  DeliverableData,
  DeliverableVersionData,
} from '@/types/forge-types';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import { usePlanStore } from '@/stores/planStore';
import { useConversationsStore } from '@/stores/conversationsStore';
import { getDeliverablesService } from '@/services/deliverablesService.impl';
import type {
  Deliverable,
  DeliverableVersion,
  DeliverableType,
  DeliverableFormat,
  DeliverableVersionCreationType,
} from '@/services/deliverablesService';
import type { JsonObject } from '@orchestrator-ai/transport-types';

// NIL_UUID - used to check if an ID is unset
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Check if an ID is a valid (non-NIL) UUID
 */
function isValidId(id: string | undefined | null): boolean {
  return !!id && id !== NIL_UUID;
}

/**
 * Check if a value is a JsonObject (non-null, non-array object)
 */
function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Extended TaskResponse with context - what we expect from the backend
 * The standard TaskResponse doesn't include context, but our backend adds it
 */
interface TaskResponseWithContext extends TaskResponse {
  context?: ExecutionContext;
}

/**
 * Helper to map transport type to store DeliverableType
 */
function mapDeliverableType(type?: string): DeliverableType | undefined {
  if (!type) return undefined;
  const validTypes = ['document', 'analysis', 'report', 'plan', 'requirements', 'image', 'video'];
  return validTypes.includes(type.toLowerCase())
    ? (type.toLowerCase() as DeliverableType)
    : undefined;
}

/**
 * Helper to map transport format to store DeliverableFormat
 */
function mapDeliverableFormat(format?: string): DeliverableFormat | undefined {
  if (!format) return undefined;
  const validFormats = ['markdown', 'text', 'json', 'html'];
  return validFormats.includes(format.toLowerCase())
    ? (format.toLowerCase() as DeliverableFormat)
    : undefined;
}

/**
 * Helper to map createdByType
 */
function mapCreatedByType(createdByType?: string): DeliverableVersionCreationType {
  const validTypes = ['ai_response', 'manual_edit', 'ai_enhancement', 'user_request'];
  if (createdByType && validTypes.includes(createdByType)) {
    return createdByType as DeliverableVersionCreationType;
  }
  return 'ai_response' as DeliverableVersionCreationType;
}

/**
 * Handles all A2A responses - the response mode determines what we do
 *
 * CRITICAL: The response mode may differ from the request mode!
 * - BUILD request can return HITL response (hitl_waiting)
 * - HITL request can return BUILD response (completed with deliverable)
 *
 * CRITICAL: Updates ExecutionContext store after every response!
 * The backend may have updated the context (added planId/deliverableId),
 * so we must update the store with the returned context.
 *
 * **Context Handling (Store-First Approach):**
 * - Gets ExecutionContext from store internally (never passed as parameter)
 * - Updates ExecutionContext store with response.context after processing
 * - All store updates happen here - single source of truth for response handling
 *
 * @param response - The TaskResponse from the API (with optional context)
 * @returns Unified result that UI can switch on
 */
export async function handleA2AResponse(response: TaskResponse): Promise<A2AResult> {
  // Cast to extended type that may have context
  const responseWithContext = response as TaskResponseWithContext;

  // Get stores
  const executionContextStore = useExecutionContextStore();

  // Update ExecutionContext store with response context (backend may have updated it)
  // This is the ONLY place context changes (besides user changing provider/model)
  if (responseWithContext.context) {
    executionContextStore.update(responseWithContext.context);
  }

  // Get updated context from store for use in this function
  const ctx = executionContextStore.current;

  // Fail-fast on error responses
  // Note: HITL responses use success=true with status='hitl_waiting', so this is safe
  if (!response.success) {
    // TaskResponseDto.failure() stores error in payload.metadata.reason
    // Also check response.error?.message for other error formats
    const payload = response.payload as unknown as Record<string, unknown> | undefined;
    const metadata = payload?.metadata as Record<string, unknown> | undefined;
    const errorMessage =
      (metadata?.reason as string) ||
      response.error ||
      (payload?.error as string) ||
      'Request failed';
    return {
      type: 'error',
      error: errorMessage,
      context: responseWithContext.context,
    };
  }

  const mode = response.mode;
  const content = response.payload?.content as Record<string, unknown> | undefined;
  const metadata = response.payload?.metadata as Record<string, unknown> | undefined;

  switch (mode) {
    // =========================================================================
    // PLAN RESPONSES
    // =========================================================================
    case 'plan': {
      const planStore = usePlanStore();
      const plan = content?.plan as PlanData | undefined;
      const version = content?.version as PlanVersionData | undefined;

      if (plan) {
        planStore.addPlan(plan);
        planStore.associatePlanWithConversation(plan.id, ctx.conversationId);
      }

      if (version && plan) {
        planStore.addVersion(plan.id, version);
        if (version.isCurrent) {
          planStore.setCurrentVersion(plan.id, version.id);
        }
      }

      return {
        type: 'plan',
        plan: plan!,
        version,
        context: responseWithContext.context || ctx,
      };
    }

    // =========================================================================
    // BUILD RESPONSES
    // =========================================================================
    case 'build': {
      console.log('🔍 [RESPONSE-SWITCH] BUILD mode - content:', JSON.stringify(content, null, 2)?.substring(0, 500));

      // Check if this is actually a HITL completed response disguised as BUILD
      // HITL completed responses have status='completed' and deliverableId at top level
      const hitlContent = content as { status?: string; deliverableId?: string } | undefined;
      if (hitlContent?.status === 'completed' && isValidId(hitlContent?.deliverableId)) {
        console.log('🔍 [RESPONSE-SWITCH] BUILD mode - detected HITL completed response, fetching deliverable');
        const deliverablesStore = useDeliverablesStore();
        const conversationsStore = useConversationsStore();
        const deliverableId = hitlContent.deliverableId;

        // Fetch the full deliverable from API
        const deliverable = await getDeliverablesService().getDeliverable(deliverableId!);

        // Add to store
        deliverablesStore.addDeliverable(deliverable);
        deliverablesStore.associateDeliverableWithConversation(
          deliverable.id,
          ctx.conversationId,
        );

        // Add completion message to conversation
        const hitlMessage = (content as { message?: string })?.message;
        conversationsStore.addMessage(ctx.conversationId, {
          conversationId: ctx.conversationId,
          role: 'assistant',
          content: hitlMessage || 'Content finalized!',
          timestamp: new Date().toISOString(),
          metadata: {
            deliverableId,
            custom: {
              hitlCompleted: true,
            },
          },
        });

        // Convert service Deliverable to transport DeliverableData
        const transportDeliverable: DeliverableData = {
          id: deliverable.id,
          agentSlug: ctx.agentSlug,
          organizationSlug: ctx.orgSlug,
          conversationId: ctx.conversationId,
          title: deliverable.title || '',
          type: deliverable.type || 'document',
          status: 'completed',
          currentVersionId: deliverable.currentVersion?.id || '',
          createdAt: deliverable.createdAt,
          updatedAt: deliverable.updatedAt,
        };

        // Convert service DeliverableVersion to transport DeliverableVersionData
        const transportVersion: DeliverableVersionData | undefined = deliverable.currentVersion ? {
          id: deliverable.currentVersion.id,
          deliverableId: deliverable.currentVersion.deliverableId,
          versionNumber: deliverable.currentVersion.versionNumber,
          content: deliverable.currentVersion.content || '',
          format: (deliverable.currentVersion.format as 'markdown' | 'json' | 'html') || 'markdown',
          createdByType: 'agent',
          createdById: null,
          metadata: deliverable.currentVersion.metadata,
          isCurrent: deliverable.currentVersion.isCurrentVersion,
          createdAt: deliverable.currentVersion.createdAt,
        } : undefined;

        return {
          type: 'deliverable',
          deliverable: transportDeliverable,
          version: transportVersion,
          context: responseWithContext.context || ctx,
        };
      }

      const deliverablesStore = useDeliverablesStore();
      const deliverable = content?.deliverable as DeliverableData | undefined;
      const version = content?.version as DeliverableVersionData | undefined;
      console.log('🔍 [RESPONSE-SWITCH] BUILD mode - deliverable:', deliverable?.id, 'version:', version?.id);

      if (deliverable) {
        // Map DeliverableData (transport type) to Deliverable (store type)
        const storeDeliverable: Deliverable = {
          id: deliverable.id,
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          title: deliverable.title || '',
          type: mapDeliverableType(deliverable.type ?? undefined),
          createdAt: deliverable.createdAt || new Date().toISOString(),
          updatedAt: deliverable.updatedAt || new Date().toISOString(),
          currentVersion: version ? {
            id: version.id,
            deliverableId: deliverable.id,
            versionNumber: version.versionNumber,
            content: version.content,
            format: mapDeliverableFormat(version.format),
            createdByType: mapCreatedByType(version.createdByType),
            isCurrentVersion: version.isCurrent ?? true,
            metadata: isJsonObject(version.metadata) ? version.metadata : undefined,
            createdAt: version.createdAt || new Date().toISOString(),
            updatedAt: version.createdAt || new Date().toISOString(),
          } : undefined,
        };

        deliverablesStore.addDeliverable(storeDeliverable);
        deliverablesStore.associateDeliverableWithConversation(
          deliverable.id,
          ctx.conversationId,
        );
      }

      if (version && deliverable) {
        const storeVersion: DeliverableVersion = {
          id: version.id,
          deliverableId: deliverable.id,
          versionNumber: version.versionNumber,
          content: version.content,
          format: mapDeliverableFormat(version.format),
          createdByType: mapCreatedByType(version.createdByType),
          isCurrentVersion: version.isCurrent ?? true,
          metadata: isJsonObject(version.metadata) ? version.metadata : undefined,
          createdAt: version.createdAt || new Date().toISOString(),
          updatedAt: version.createdAt || new Date().toISOString(),
        };

        deliverablesStore.addVersion(deliverable.id, storeVersion);
        if (version.isCurrent) {
          deliverablesStore.setCurrentVersion(deliverable.id, version.id);
        }
      }

      console.log('🔍 [RESPONSE-SWITCH] BUILD mode - returning result:', { type: 'deliverable', hasDeliverable: !!deliverable, hasVersion: !!version });

      // If no deliverable in BUILD response, check if it's a conversational response
      // RAG agents return isConversational: true when they have no results or access
      if (!deliverable) {
        const isConversational = (content as { isConversational?: boolean })?.isConversational;
        const message = (content as { message?: string })?.message;

        if (isConversational && message) {
          console.log('🔍 [RESPONSE-SWITCH] BUILD mode - conversational response (no deliverable):', message);
          return {
            type: 'message',
            message,
            metadata: metadata as Record<string, unknown>,
            context: responseWithContext.context || ctx,
          };
        }

        // Not conversational and no deliverable - this is an error
        const errorMsg = (metadata?.reason as string) || (content?.error as string) || 'Build completed but no deliverable was created';
        console.error('🔍 [RESPONSE-SWITCH] BUILD mode - no deliverable in response:', errorMsg);
        return {
          type: 'error',
          error: errorMsg,
          context: responseWithContext.context || ctx,
        };
      }

      return {
        type: 'deliverable',
        deliverable,
        version,
        context: responseWithContext.context || ctx,
      };
    }

    // =========================================================================
    // CONVERSE RESPONSES
    // =========================================================================
    case 'converse': {
      // NOTE: Do NOT add message here - converse.actions.ts already handles
      // message creation/updating. Adding here would cause duplicates.
      // The action handler creates a placeholder and updates it with the response.
      const message =
        (content?.message as string) ||
        '';
      const thinking = (content?.thinking as string) || undefined;

      return {
        type: 'message',
        message,
        metadata: {
          ...metadata,
          ...(thinking ? { thinking } : {}),
        },
        context: responseWithContext.context || ctx,
      };
    }

    // =========================================================================
    // HITL RESPONSES
    // =========================================================================
    case 'hitl': {
      // Cast to extended HITL content type — backend sends additional fields
      type HitlContentExtended = {
        hitlPending?: boolean;
        taskId?: string;
        topic?: string;
        generatedContent?: HitlDeliverableResponse['generatedContent'];
        status?: string;
        message?: string;
        items?: unknown[];
      };
      const hitlContent = content as HitlContentExtended | undefined;
      const status = hitlContent?.status;

      // HITL still waiting (e.g., after regenerate)
      if (status === 'hitl_waiting' || status === 'regenerating') {
        return {
          type: 'hitl_waiting',
          taskId: hitlContent?.taskId || executionContextStore.taskId || '',
          topic: hitlContent?.topic || '',
          generatedContent: hitlContent?.generatedContent || {},
          context: responseWithContext.context || ctx,
        };
      }

      // HITL completed - fetch the deliverable from API per PRD
      if (status === 'completed') {
        const deliverablesStore = useDeliverablesStore();
        const conversationsStore = useConversationsStore();
        // Get deliverableId from product-local store (not from ExecutionContext capsule)
        const deliverableId = executionContextStore.deliverableId;

        if (isValidId(deliverableId)) {
          // Fetch the full deliverable from API (per PRD)
          const deliverable = await getDeliverablesService().getDeliverable(deliverableId!);

          // Add to store
          deliverablesStore.addDeliverable(deliverable);
          deliverablesStore.associateDeliverableWithConversation(
            deliverable.id,
            ctx.conversationId,
          );

          // Add completion message to conversation
          conversationsStore.addMessage(ctx.conversationId, {
            conversationId: ctx.conversationId,
            role: 'assistant',
            content: hitlContent?.message || 'Content finalized!',
            timestamp: new Date().toISOString(),
            metadata: {
              deliverableId: deliverableId ?? undefined,
              custom: {
                hitlCompleted: true,
              },
            },
          });

          // Convert service Deliverable to transport DeliverableData
          const transportDeliverable: DeliverableData = {
            id: deliverable.id,
            agentSlug: ctx.agentSlug,
            organizationSlug: ctx.orgSlug,
            conversationId: ctx.conversationId,
            title: deliverable.title || hitlContent?.topic || '',
            type: deliverable.type || 'document',
            status: 'completed',
            currentVersionId: deliverable.currentVersion?.id || '',
            createdAt: deliverable.createdAt,
            updatedAt: deliverable.updatedAt,
          };

          // Convert service DeliverableVersion to transport DeliverableVersionData
          const transportVersion: DeliverableVersionData | undefined = deliverable.currentVersion ? {
            id: deliverable.currentVersion.id,
            deliverableId: deliverable.currentVersion.deliverableId,
            versionNumber: deliverable.currentVersion.versionNumber,
            content: deliverable.currentVersion.content || '',
            format: (deliverable.currentVersion.format as 'markdown' | 'json' | 'html') || 'markdown',
            createdByType: 'agent',
            createdById: null,
            metadata: deliverable.currentVersion.metadata,
            isCurrent: deliverable.currentVersion.isCurrentVersion,
            createdAt: deliverable.currentVersion.createdAt,
          } : undefined;

          return {
            type: 'deliverable',
            deliverable: transportDeliverable,
            version: transportVersion,
            context: responseWithContext.context || ctx,
          };
        }

        return {
          type: 'success',
          message: hitlContent?.message,
          context: responseWithContext.context || ctx,
        };
      }

      // HITL rejected
      if (status === 'rejected') {
        return {
          type: 'success',
          message: 'Content rejected',
          context: responseWithContext.context || ctx,
        };
      }

      // HITL pending list response
      if (hitlContent?.items) {
        const items = hitlContent.items;
        return {
          type: 'success',
          message: `${items.length} pending reviews`,
          context: responseWithContext.context || ctx,
        };
      }

      // Default - return whatever we got
      return {
        type: 'success',
        message: hitlContent?.message,
        context: responseWithContext.context || ctx,
      };
    }

    // =========================================================================
    // UNKNOWN MODE
    // =========================================================================
    default:
      console.warn(`Unknown response mode: ${mode}`);
      return {
        type: 'error',
        error: `Unknown response mode: ${mode}`,
        context: responseWithContext.context,
      };
  }
}
