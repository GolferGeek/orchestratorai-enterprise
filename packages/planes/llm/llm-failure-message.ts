/** Longest reason an event-log line carries; the full error stays in the payload. */
export const FAILURE_REASON_LIMIT = 200;

/**
 * The message of an `agent.llm.failed` event: what failed and why, readable
 * at a glance in the admin event log.
 */
export function llmFailureMessage(label: string, error: unknown): string {
  const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim();
  const short =
    reason.length > FAILURE_REASON_LIMIT ? `${reason.slice(0, FAILURE_REASON_LIMIT - 1)}…` : reason;
  return short ? `${label}: ${short}` : label;
}
