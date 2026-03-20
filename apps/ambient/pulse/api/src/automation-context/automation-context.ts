/**
 * Pulse Automation Context Contract
 *
 * Defines when and how Pulse system-triggered automation may originate
 * ExecutionContext, how it is validated, and how it is distinguished
 * from user-originated calls.
 *
 * Rules:
 * 1. Only Pulse internal automation services may construct ExecutionContext
 * 2. System-originated contexts use NIL_UUID for userId
 * 3. orgSlug must be 'system' or a real org slug from the trigger source
 * 4. conversationId is NIL_UUID (no user conversation)
 * 5. agentSlug must identify the processing agent
 * 6. agentType should be 'system' for automated processing
 * 7. provider/model must come from configuration, never hardcoded
 *
 * Validation:
 * - isSystemTriggered() distinguishes system-originated from user-originated
 * - Products receiving Pulse-originated context should validate it against
 *   these rules before processing
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { NIL_UUID, createExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Parameters for creating a system-triggered ExecutionContext.
 * Intentionally minimal — only fields the automation source knows.
 */
export interface SystemTriggerContextParams {
  /** Organization slug — from trigger source or 'system' for global automation */
  orgSlug: string;

  /** Agent slug — identifies the processing agent */
  agentSlug: string;

  /** LLM provider from configuration */
  provider: string;

  /** LLM model from configuration */
  model: string;

  /** Optional: conversation ID for ambient processing that creates a trace conversation */
  conversationId?: string;
}

/**
 * Create an ExecutionContext for system-triggered automation.
 *
 * This is the ONLY sanctioned way for Pulse backend services to construct
 * ExecutionContext. All other backend code must receive context from the
 * frontend/edge.
 *
 * The resulting context is distinguishable from user-originated context
 * via isSystemTriggered().
 */
export function createSystemTriggeredContext(
  params: SystemTriggerContextParams,
): ExecutionContext {
  return createExecutionContext({
    orgSlug: params.orgSlug,
    userId: NIL_UUID,
    conversationId: params.conversationId || NIL_UUID,
    agentSlug: params.agentSlug,
    agentType: 'system',
    provider: params.provider,
    model: params.model,
  });
}

/**
 * Check if an ExecutionContext was created by system-triggered automation.
 *
 * System-triggered contexts have:
 * - userId === NIL_UUID (no user initiated this)
 * - agentType === 'system'
 */
export function isSystemTriggered(context: ExecutionContext): boolean {
  return context.userId === NIL_UUID && context.agentType === 'system';
}

/**
 * Validate a system-triggered ExecutionContext.
 * Returns an error message if invalid, undefined if valid.
 */
export function validateSystemContext(context: ExecutionContext): string | undefined {
  if (context.userId !== NIL_UUID) {
    return 'System-triggered context must have userId === NIL_UUID';
  }
  if (context.agentType !== 'system') {
    return 'System-triggered context must have agentType === "system"';
  }
  if (!context.orgSlug) {
    return 'System-triggered context must have orgSlug';
  }
  if (!context.agentSlug) {
    return 'System-triggered context must have agentSlug';
  }
  if (!context.provider || !context.model) {
    return 'System-triggered context must have provider and model from configuration';
  }
  return undefined;
}
