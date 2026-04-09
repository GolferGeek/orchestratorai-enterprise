/**
 * Bridge External-Origin Context Contract
 *
 * Defines when and how Bridge may originate ExecutionContext for inbound A2A
 * requests that arrive without one. This is the Bridge equivalent of Pulse's
 * createSystemTriggeredContext(): a single, sanctioned factory so that raw
 * object literals never appear in backend code.
 *
 * Rules:
 * 1. Only Bridge inbound services may call createExternalOriginContext()
 * 2. External-origin contexts use a prefixed userId to indicate the external
 *    agent identity (e.g. "external:agent-xyz")
 * 3. orgSlug must come from configuration (DEFAULT_ORG_SLUG) — never hardcoded
 * 4. conversationId is generated fresh per inbound request (randomUUID)
 * 5. agentSlug is always 'bridge-inbound' for external-origin requests
 * 6. agentType is always 'external'
 * 7. provider/model are 'default' — Bridge does not invoke LLMs itself
 *
 * Validation:
 * - isExternalOrigin() distinguishes external-origin from user-originated context
 */

import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import { randomUUID } from 'crypto';

/**
 * Parameters for creating an external-origin ExecutionContext.
 */
export interface ExternalOriginContextParams {
  /** Organization slug — from configuration (DEFAULT_ORG_SLUG) */
  orgSlug: string;

  /** External agent ID — becomes "external:<agentId>" in userId */
  agentId?: string;
}

/**
 * Create an ExecutionContext for an inbound external A2A request that arrives
 * without a context.
 *
 * This is the ONLY sanctioned way for Bridge inbound services to construct
 * ExecutionContext. All other backend code must receive context from the
 * frontend/edge or from the inbound request params.
 *
 * The resulting context is distinguishable from user-originated context
 * via isExternalOrigin().
 */
export function createExternalOriginContext(
  params: ExternalOriginContextParams,
): ExecutionContext {
  return createExecutionContext({
    orgSlug: params.orgSlug,
    userId: `external:${params.agentId ?? 'unknown'}`,
    conversationId: randomUUID(),
    agentSlug: 'bridge-inbound',
    agentType: 'external',
    provider: 'default',
    model: 'default',
  });
}

/**
 * Check if an ExecutionContext was created for an external-origin inbound request.
 *
 * External-origin contexts have:
 * - userId starting with "external:"
 * - agentType === 'external'
 * - agentSlug === 'bridge-inbound'
 */
export function isExternalOrigin(context: ExecutionContext): boolean {
  return (
    context.userId.startsWith('external:') &&
    context.agentType === 'external' &&
    context.agentSlug === 'bridge-inbound'
  );
}
