/**
 * Canonical caller-name format for legal-department LLM calls persisted to
 * `public.llm_usage.agent_name`.
 *
 * Format: `legal-department:{specialistKey}-agent`
 * Examples:
 *   - contract-agent     → `legal-department:contract-agent`
 *   - compliance-agent   → `legal-department:compliance-agent`
 *   - synthesis          → `legal-department:synthesis`
 *   - report-generation  → `legal-department:report-generation`
 *
 * Used by:
 *  - Every specialist node, synthesis node, and report-generation node (via
 *    the `callerName` field on each `callLLM` / `callLLMMaybeWithReasoning` call)
 *  - `LegalJobsRepository.findReasoningForSpecialist` (builds the LIKE pattern
 *    from `specialistKey` using this format)
 *  - `LegalJobsController` (builds the query key from `specialistKey` using this format)
 *
 * Keeping these in sync via a shared constant prevents silent 0-result queries
 * when a specialist renames its callerName.
 */
export const LEGAL_CALLER_NAME_PREFIX = 'legal-department' as const;

/**
 * Build the canonical `agent_name` value for a legal-department LLM call
 * that will be persisted to `public.llm_usage`.
 *
 * @param specialistKey - The key portion of the caller name (e.g. "contract-agent",
 *                        "synthesis", "report-generation")
 */
export function buildLegalCallerName(specialistKey: string): string {
  return `${LEGAL_CALLER_NAME_PREFIX}:${specialistKey}`;
}

/**
 * LLM observability event type constants for the legal-department capability.
 *
 * These travel through the existing `ObservabilityService.emitProgress` path
 * and are persisted to `public.observability_events` the same way every other
 * progress event is. No new method on `ObservabilityService` is needed.
 *
 * Phase 4 adds two coarse reasoning-phase signals (one event when the model
 * begins thinking, one when it switches to writing). They are emitted at most
 * once per LLM call and only when the caller opts into
 * `callLLMWithReasoning` / `callLLMMaybeWithReasoning`.
 *
 * The stage ladder on the frontend subscribes to these constants to drive the
 * "🧠 reasoning" → "✍️ writing" visual transition per specialist row.
 */

/**
 * Emitted once when the first thinking token arrives from an Ollama reasoning
 * model. Carries `callerName` and `step` in the metadata so the stage ladder
 * can route the state change to the correct specialist row.
 */
export const AGENT_LLM_THINKING_STARTED = 'agent.llm.thinking_started' as const;

/**
 * Emitted once when the model transitions from thinking to output tokens (or
 * when the stream ends with no output). Carries `callerName`, `step`, and
 * `durationMs` in the metadata.
 */
export const AGENT_LLM_THINKING_COMPLETED =
  'agent.llm.thinking_completed' as const;
