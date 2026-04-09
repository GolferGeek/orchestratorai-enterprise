/**
 * Request Switch - Maps triggers to transport mode x action and builds requests
 *
 * This module routes A2ATriggers to the appropriate request builder.
 *
 * **Store-First Approach (PRD Compliant):**
 * Each builder function gets context from the ExecutionContext store internally.
 * This function only maps triggers to the appropriate builder - NO context handling here.
 * Context is NEVER passed between methods.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Request Switch Implementation
 */

import type { A2ATrigger, A2APayload } from './forge-orchestrator-types';
import type { StrictA2ARequest, HitlGeneratedContent } from '@/types/forge-types';
import { buildRequest } from './agent2agent/utils/builders';

/**
 * Maps triggers to transport mode x action and builds the request
 *
 * **Key Principle:** Context is handled internally by each builder.
 * This function only maps triggers and passes action-specific payload data.
 * No metadata construction - builders get context from store directly.
 *
 * @param trigger - What action triggered this call (e.g., 'plan.create', 'hitl.approve')
 * @param payload - Trigger-specific payload data (versionId, feedback, etc.)
 * @returns A fully-formed JSON-RPC request ready to send to the API
 */
export function buildA2ARequest(
  trigger: A2ATrigger,
  payload: A2APayload,
): StrictA2ARequest {
  switch (trigger) {
    // =========================================================================
    // PLAN TRIGGERS
    // =========================================================================
    case 'plan.create':
      return buildRequest.plan.create({
        userMessage: payload.userMessage!,
        planData: payload.planData,
        documents: payload.documents,
      });

    case 'plan.read':
      return buildRequest.plan.read({
        versionId: payload.versionId,
      });

    case 'plan.list':
      return buildRequest.plan.list();

    case 'plan.edit':
      return buildRequest.plan.edit({
        userMessage: payload.userMessage,
        content: payload.editedContent as string,
      });

    case 'plan.rerun':
      if (!payload.versionId) {
        throw new Error('versionId is required for plan.rerun');
      }
      if (!payload.rerunLlmOverride) {
        throw new Error('rerunLlmOverride is required for plan.rerun');
      }
      return buildRequest.plan.rerun({
        versionId: payload.versionId,
        config: payload.rerunLlmOverride as unknown as Record<string, unknown>,
        userMessage: payload.userMessage,
      });

    case 'plan.set_current':
      if (!payload.versionId) {
        throw new Error('versionId is required for plan.set_current');
      }
      return buildRequest.plan.setCurrent({
        versionId: payload.versionId,
      });

    case 'plan.delete_version':
      if (!payload.versionId) {
        throw new Error('versionId is required for plan.delete_version');
      }
      return buildRequest.plan.deleteVersion({
        versionId: payload.versionId,
      });

    case 'plan.merge_versions':
      if (!payload.versionIds || payload.versionIds.length < 2) {
        throw new Error('At least 2 versionIds are required for plan.merge_versions');
      }
      if (!payload.mergePrompt) {
        throw new Error('mergePrompt is required for plan.merge_versions');
      }
      return buildRequest.plan.mergeVersions({
        versionIds: payload.versionIds,
        mergePrompt: payload.mergePrompt,
        userMessage: payload.userMessage,
      });

    case 'plan.copy_version':
      if (!payload.versionId) {
        throw new Error('versionId is required for plan.copy_version');
      }
      return buildRequest.plan.copyVersion({
        versionId: payload.versionId,
      });

    case 'plan.delete':
      return buildRequest.plan.delete();

    // =========================================================================
    // BUILD TRIGGERS
    // =========================================================================
    case 'build.create':
      return buildRequest.build.execute({
        userMessage: payload.userMessage!,
        documents: payload.documents,
      });

    case 'build.read':
      return buildRequest.build.read({
        versionId: payload.versionId,
      });

    case 'build.list':
      return buildRequest.build.list();

    case 'build.edit':
      return buildRequest.build.edit({
        userMessage: payload.userMessage,
        content: payload.editedContent as string,
      });

    case 'build.rerun':
      if (!payload.versionId) {
        throw new Error('versionId is required for build.rerun');
      }
      if (!payload.rerunLlmOverride) {
        throw new Error('rerunLlmOverride is required for build.rerun');
      }
      return buildRequest.build.rerun({
        versionId: payload.versionId,
        config: payload.rerunLlmOverride as unknown as Record<string, unknown>,
        userMessage: payload.userMessage,
      });

    case 'build.set_current':
      if (!payload.versionId) {
        throw new Error('versionId is required for build.set_current');
      }
      return buildRequest.build.setCurrent({
        versionId: payload.versionId,
      });

    case 'build.delete_version':
      if (!payload.versionId) {
        throw new Error('versionId is required for build.delete_version');
      }
      return buildRequest.build.deleteVersion({
        versionId: payload.versionId,
      });

    case 'build.merge_versions':
      if (!payload.versionIds || payload.versionIds.length < 2) {
        throw new Error('At least 2 versionIds are required for build.merge_versions');
      }
      if (!payload.mergePrompt) {
        throw new Error('mergePrompt is required for build.merge_versions');
      }
      return buildRequest.build.mergeVersions({
        versionIds: payload.versionIds,
        mergePrompt: payload.mergePrompt,
        userMessage: payload.userMessage,
      });

    case 'build.copy_version':
      if (!payload.versionId) {
        throw new Error('versionId is required for build.copy_version');
      }
      return buildRequest.build.copyVersion({
        versionId: payload.versionId,
      });

    case 'build.delete':
      return buildRequest.build.delete();

    // =========================================================================
    // CONVERSE TRIGGERS
    // =========================================================================
    case 'converse.send':
      return buildRequest.converse.send({
        userMessage: payload.userMessage!,
        messages: payload.messages,
        documents: payload.documents,
        interactionMode: payload.interactionMode,
      });

    // =========================================================================
    // HITL TRIGGERS
    // All HITL resume operations require originalTaskId (the checkpointed task)
    // =========================================================================
    case 'hitl.approve':
      if (!payload.originalTaskId) {
        throw new Error('originalTaskId is required for hitl.approve');
      }
      return buildRequest.hitl.resume({
        decision: 'approve',
        originalTaskId: payload.originalTaskId,
      });

    case 'hitl.reject':
      if (!payload.originalTaskId) {
        throw new Error('originalTaskId is required for hitl.reject');
      }
      return buildRequest.hitl.resume({
        decision: 'reject',
        originalTaskId: payload.originalTaskId,
      });

    case 'hitl.regenerate':
      if (!payload.feedback) {
        throw new Error('feedback is required for hitl.regenerate');
      }
      if (!payload.originalTaskId) {
        throw new Error('originalTaskId is required for hitl.regenerate');
      }
      return buildRequest.hitl.resume({
        decision: 'regenerate',
        feedback: payload.feedback,
        originalTaskId: payload.originalTaskId,
      });

    case 'hitl.replace':
      if (!payload.content) {
        throw new Error('content is required for hitl.replace');
      }
      if (!payload.originalTaskId) {
        throw new Error('originalTaskId is required for hitl.replace');
      }
      return buildRequest.hitl.resume({
        decision: 'replace',
        content: payload.content as HitlGeneratedContent,
        originalTaskId: payload.originalTaskId,
      });

    case 'hitl.skip':
      if (!payload.originalTaskId) {
        throw new Error('originalTaskId is required for hitl.skip');
      }
      return buildRequest.hitl.resume({
        decision: 'skip',
        originalTaskId: payload.originalTaskId,
      });

    case 'hitl.status':
      return buildRequest.hitl.status();

    case 'hitl.history':
      return buildRequest.hitl.history();

    case 'hitl.pending':
      return buildRequest.hitl.pending({
        agentSlug: payload.agentSlug,
      });

    // =========================================================================
    // UNKNOWN TRIGGER
    // =========================================================================
    default:
      throw new Error(`Unknown trigger: ${trigger}`);
  }
}
