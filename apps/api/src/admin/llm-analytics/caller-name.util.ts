/**
 * parseCallerName — parses LLM `callerName` / `agent_name` strings into structured fields.
 *
 * Caller-name convention audit (2026-04-08):
 * - COMPLIANT (`{workflowSlug}:{nodeName}` format): marketing-swarm, legal-department,
 *   dual-track-processor.
 * - NON-COMPLIANT (plain AGENT_SLUG, no colon, no node): data-analyst, customer-service,
 *   extended-post-writer, business-automation-advisor, cad-agent.
 *
 * Normalization was deferred; this parser handles both formats. Follow-up: standardise
 * the 5 non-compliant workflows to emit `{workflow}:{node}` in a future PR.
 */

export interface ParsedCallerName {
  workflowSlug: string | null;
  nodeName: string | null;
}

/**
 * Parse a raw caller name string into `workflowSlug` and `nodeName`.
 *
 * Rules:
 * - `null` | `undefined` | `""` → `{ workflowSlug: null, nodeName: null }`
 * - No colon → `{ workflowSlug: name, nodeName: null }`
 * - Has colon → split on FIRST colon only:
 *     `{ workflowSlug: before, nodeName: after }`
 *     Multiple colons (e.g. `marketing-swarm:evaluator:initial`) →
 *     `workflowSlug = 'marketing-swarm'`, `nodeName = 'evaluator:initial'`
 * - Whitespace-only segments become `null`.
 */
export function parseCallerName(
  name: string | null | undefined,
): ParsedCallerName {
  if (name == null || name.trim() === '') {
    return { workflowSlug: null, nodeName: null };
  }

  const colonIdx = name.indexOf(':');

  if (colonIdx === -1) {
    const slug = name.trim();
    return { workflowSlug: slug === '' ? null : slug, nodeName: null };
  }

  const before = name.slice(0, colonIdx).trim();
  const after = name.slice(colonIdx + 1).trim();

  return {
    workflowSlug: before === '' ? null : before,
    nodeName: after === '' ? null : after,
  };
}
