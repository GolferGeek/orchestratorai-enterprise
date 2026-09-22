/**
 * Privacy summary carried on assistant message metadata.
 *
 * Mirrors `PrivacySummary` in
 * `packages/planes/llm/fine-control/services/llm-interfaces.ts`. Counts and
 * data-type labels only — the server deliberately keeps original values,
 * pseudonyms and redacted spans out of anything that reaches the browser.
 */
export interface PrivacySummary {
  /** Whether the detector flagged anything at all. */
  piiDetected: boolean;
  /** Matches the detector flagged but did not necessarily replace. */
  flaggedCount: number;
  /** Dictionary pseudonyms swapped in before the provider call. */
  pseudonymCount: number;
  /** Pattern redactions applied after pseudonymization. */
  redactionCount: number;
  /** Distinct data types involved, e.g. ['email', 'phone']. */
  dataTypes: string[];
  /** What the boundary did with this request. */
  status: 'none' | 'applied' | 'blocked';
  /** Local providers never leave the building; external ones do. */
  routing: 'local' | 'external';
  /** Whether pseudonyms and redactions were restored in the reply. */
  reversed: boolean;
}

/**
 * Narrow loose message metadata to a privacy summary.
 *
 * Metadata crosses the wire as `Record<string, unknown>`, and older messages
 * predate the field entirely, so every read goes through here.
 */
export function readPrivacySummary(
  metadata: Record<string, unknown> | undefined | null,
): PrivacySummary | null {
  const candidate = metadata?.privacy as Partial<PrivacySummary> | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.routing !== 'string') return null;

  return {
    piiDetected: candidate.piiDetected === true,
    flaggedCount: Number(candidate.flaggedCount ?? 0),
    pseudonymCount: Number(candidate.pseudonymCount ?? 0),
    redactionCount: Number(candidate.redactionCount ?? 0),
    dataTypes: Array.isArray(candidate.dataTypes) ? candidate.dataTypes : [],
    status: candidate.status ?? 'none',
    routing: candidate.routing === 'local' ? 'local' : 'external',
    reversed: candidate.reversed === true,
  };
}
