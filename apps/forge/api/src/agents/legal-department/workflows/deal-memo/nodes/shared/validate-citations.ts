/**
 * Citation validation for deal-memo section drafts.
 *
 * Every section-draft node returns `{ draft, citations: CitationRef[] }`. The
 * citations are the only thing tying drafted contract language back to real
 * DD findings — if the LLM fabricates an ID, the memo is worthless (and
 * dangerous). This validator refuses any citation whose ID fields don't
 * resolve against the hydrated parent DD state.
 *
 * Deterministic, synthetic IDs are minted from the parent state:
 *   - findingId          `${specialistKey}:${indexInKeyFindings}`
 *   - documentId         DocumentIndexEntry.documentId (native UUID)
 *   - riskRowId          `${category}:${severity}`
 *   - dealBreakerFlagId  `db-${indexInDealBreakerFlags}`
 *
 * These IDs are surfaced to the LLM through the section prompts (see
 * `section-prompts.ts`). The prompt hands the model the list of valid IDs
 * and says "every citation you emit must be from this list."
 *
 * Rules enforced here:
 *   1. Each ref must carry a non-empty `excerpt` (for attorney review).
 *   2. Each ref must provide at least one ID field (document / finding /
 *      risk row / deal-breaker flag).
 *   3. Every ID field that is present must resolve in the registry.
 *
 * Any violation throws `CitationValidationError` with the full list of
 * unresolved refs — no silent drop, no partial acceptance.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1, §5.
 */
import type { CitationRef } from '../../deal-memo.types';
import type {
  DocumentIndexEntry,
  RunningFindingsSummary,
  RiskMatrix,
  DealBreakerFlag,
} from '../../../due-diligence/due-diligence.types';

export interface CitationRegistrySource {
  documentIndex: DocumentIndexEntry[];
  runningFindings: Record<string, RunningFindingsSummary>;
  riskMatrix?: RiskMatrix;
  dealBreakerFlags: DealBreakerFlag[];
}

/**
 * Compact listing the LLM can be shown verbatim so it knows which IDs are
 * valid. Every field a citation can reference has a mirror here.
 */
export interface CitationRegistry {
  findingIds: Set<string>;
  documentIds: Set<string>;
  riskRowIds: Set<string>;
  dealBreakerFlagIds: Set<string>;
  /** Human-readable table rows — used by the prompt builder, not validation. */
  findingEntries: Array<{
    id: string;
    documentName: string;
    finding: string;
    severity: string;
    specialistKey: string;
    /**
     * Category stamped onto the finding at extraction time. For financial
     * specialists this is `'financial'`; for legal specialists this is the
     * specialist key (legacy shape). Used by the prompt builder to partition
     * findings into legal vs financial buckets for reps-warranties and
     * disclosure-schedules sections (PRD §4.1 Phase 5).
     */
    category: string;
  }>;
  documentEntries: Array<{
    id: string;
    name: string;
    documentType: string;
  }>;
  riskRowEntries: Array<{
    id: string;
    category: string;
    severity: string;
    count: number;
  }>;
  dealBreakerEntries: Array<{ id: string; finding: string; category: string }>;
}

export function buildCitationRegistry(
  source: CitationRegistrySource,
): CitationRegistry {
  const findingIds = new Set<string>();
  const findingEntries: CitationRegistry['findingEntries'] = [];
  for (const [specialistKey, summary] of Object.entries(
    source.runningFindings,
  )) {
    const keyFindings = summary?.keyFindings ?? [];
    keyFindings.forEach((f, i) => {
      const id = `${specialistKey}:${i}`;
      findingIds.add(id);
      findingEntries.push({
        id,
        documentName: f.documentName,
        finding: f.finding,
        severity: f.severity,
        specialistKey,
        category: f.category ?? specialistKey,
      });
    });
  }

  const documentIds = new Set<string>();
  const documentEntries: CitationRegistry['documentEntries'] = [];
  for (const doc of source.documentIndex ?? []) {
    documentIds.add(doc.documentId);
    documentEntries.push({
      id: doc.documentId,
      name: doc.name,
      documentType: doc.documentType,
    });
  }

  const riskRowIds = new Set<string>();
  const riskRowEntries: CitationRegistry['riskRowEntries'] = [];
  for (const cell of source.riskMatrix?.cells ?? []) {
    const id = `${cell.category}:${cell.severity}`;
    riskRowIds.add(id);
    riskRowEntries.push({
      id,
      category: cell.category,
      severity: cell.severity,
      count: cell.count,
    });
  }

  const dealBreakerFlagIds = new Set<string>();
  const dealBreakerEntries: CitationRegistry['dealBreakerEntries'] = [];
  (source.dealBreakerFlags ?? []).forEach((flag, i) => {
    const id = `db-${i}`;
    dealBreakerFlagIds.add(id);
    dealBreakerEntries.push({
      id,
      finding: flag.finding,
      category: flag.category,
    });
  });

  return {
    findingIds,
    documentIds,
    riskRowIds,
    dealBreakerFlagIds,
    findingEntries,
    documentEntries,
    riskRowEntries,
    dealBreakerEntries,
  };
}

export interface UnresolvedCitation {
  ref: CitationRef;
  reasons: string[];
}

export class CitationValidationError extends Error {
  constructor(
    public readonly sectionId: string,
    public readonly unresolved: UnresolvedCitation[],
  ) {
    const lines = unresolved.map((u) => {
      const idFields: string[] = [];
      if (u.ref.findingId !== undefined)
        idFields.push(`findingId=${u.ref.findingId}`);
      if (u.ref.documentId !== undefined)
        idFields.push(`documentId=${u.ref.documentId}`);
      if (u.ref.riskRowId !== undefined)
        idFields.push(`riskRowId=${u.ref.riskRowId}`);
      if (u.ref.dealBreakerFlagId !== undefined)
        idFields.push(`dealBreakerFlagId=${u.ref.dealBreakerFlagId}`);
      return `  - { ${idFields.join(', ') || '(no ids)'} } → ${u.reasons.join('; ')}`;
    });
    super(
      `Citation validation failed for section "${sectionId}" — ` +
        `${unresolved.length} unresolved citation(s) (possible fabrication):\n` +
        lines.join('\n'),
    );
    this.name = 'CitationValidationError';
  }
}

/**
 * Normalize a raw citation object returned by the LLM into the canonical
 * CitationRef shape expected by state + downstream UI.
 *
 * The LLM contract now accepts a single `id` string — the model picks any
 * one of the listed valid IDs and doesn't have to pick the right kind-
 * specific field. This function resolves `id` against the four registries
 * and sets the matching typed field. It is NOT a fallback: if the id
 * doesn't resolve anywhere, we place it on `findingId` so the subsequent
 * validator throws with a clear "does not resolve" message (identical to
 * the legacy fabrication-detection path).
 *
 * Legacy `{findingId?, documentId?, ...}` citations are passed through
 * unchanged so this stays backward-compatible with tests and any LLM
 * that still emits the typed-field form.
 *
 * Deterministic disambiguation order: documentId → riskRowId →
 * dealBreakerFlagId → findingId. This order intentionally puts findingId
 * last because the `specialistKey:index` format is the most likely to
 * accidentally match another kind's format; we prefer to route a match
 * to the more constrained kind when possible.
 */
export function normalizeLLMCitation(
  raw: unknown,
  registry: CitationRegistry,
): CitationRef {
  if (!raw || typeof raw !== 'object') {
    return { excerpt: '' };
  }
  const obj = raw as Record<string, unknown>;
  const excerpt = typeof obj.excerpt === 'string' ? obj.excerpt : '';

  // Legacy shape: any typed field present → pass through.
  const hasTypedField =
    typeof obj.findingId === 'string' ||
    typeof obj.documentId === 'string' ||
    typeof obj.riskRowId === 'string' ||
    typeof obj.dealBreakerFlagId === 'string';
  if (hasTypedField) {
    return {
      findingId: typeof obj.findingId === 'string' ? obj.findingId : undefined,
      documentId:
        typeof obj.documentId === 'string' ? obj.documentId : undefined,
      riskRowId: typeof obj.riskRowId === 'string' ? obj.riskRowId : undefined,
      dealBreakerFlagId:
        typeof obj.dealBreakerFlagId === 'string'
          ? obj.dealBreakerFlagId
          : undefined,
      excerpt,
    };
  }

  // Single-id form: disambiguate by registry lookup.
  const id = typeof obj.id === 'string' ? obj.id : '';
  if (!id) return { excerpt };

  if (registry.documentIds.has(id)) return { documentId: id, excerpt };
  if (registry.riskRowIds.has(id)) return { riskRowId: id, excerpt };
  if (registry.dealBreakerFlagIds.has(id))
    return { dealBreakerFlagId: id, excerpt };
  if (registry.findingIds.has(id)) return { findingId: id, excerpt };

  // Unresolved — place on findingId so the validator emits the standard
  // "findingId does not resolve" fail-loud error. This keeps the error
  // surface identical to the legacy typed-field fabrication case.
  return { findingId: id, excerpt };
}

/**
 * Validate a section's citations against the registry. Throws on any
 * violation; returns void on success. Pure — safe to call from a node.
 */
export function validateCitations(
  sectionId: string,
  refs: CitationRef[] | undefined,
  registry: CitationRegistry,
): void {
  if (!Array.isArray(refs)) {
    throw new CitationValidationError(sectionId, [
      {
        ref: { excerpt: '' } as CitationRef,
        reasons: ['citations field is missing or not an array'],
      },
    ]);
  }

  const unresolved: UnresolvedCitation[] = [];

  for (const ref of refs) {
    const reasons: string[] = [];

    if (typeof ref.excerpt !== 'string' || ref.excerpt.trim().length === 0) {
      reasons.push('excerpt is missing or empty');
    }

    const hasAnyId =
      (typeof ref.findingId === 'string' && ref.findingId.length > 0) ||
      (typeof ref.documentId === 'string' && ref.documentId.length > 0) ||
      (typeof ref.riskRowId === 'string' && ref.riskRowId.length > 0) ||
      (typeof ref.dealBreakerFlagId === 'string' &&
        ref.dealBreakerFlagId.length > 0);

    if (!hasAnyId) {
      reasons.push(
        'at least one of findingId/documentId/riskRowId/dealBreakerFlagId must be set',
      );
    }

    if (ref.findingId && !registry.findingIds.has(ref.findingId)) {
      reasons.push(`findingId "${ref.findingId}" does not resolve`);
    }
    if (ref.documentId && !registry.documentIds.has(ref.documentId)) {
      reasons.push(`documentId "${ref.documentId}" does not resolve`);
    }
    if (ref.riskRowId && !registry.riskRowIds.has(ref.riskRowId)) {
      reasons.push(`riskRowId "${ref.riskRowId}" does not resolve`);
    }
    if (
      ref.dealBreakerFlagId &&
      !registry.dealBreakerFlagIds.has(ref.dealBreakerFlagId)
    ) {
      reasons.push(
        `dealBreakerFlagId "${ref.dealBreakerFlagId}" does not resolve`,
      );
    }

    if (reasons.length > 0) {
      unresolved.push({ ref, reasons });
    }
  }

  if (unresolved.length > 0) {
    throw new CitationValidationError(sectionId, unresolved);
  }
}
