/**
 * Deal Memo — Synthesis Node.
 *
 * Stitches the five section drafts produced by Phase 2 into one markdown
 * memo, emits a cross-reference appendix, and re-validates every citation
 * against the hydrated parent DD state.
 *
 * **Implementation choice: deterministic stitch (no LLM call).**
 *
 * Rationale (documented per Phase 3 plan step 3.1):
 *   - The legal prose is already produced by the five section nodes.
 *   - A deterministic stitch has no fabrication surface area — the only
 *     work left is layout, heading hierarchy, and a references appendix.
 *     Running another LLM pass here adds a failure mode (rephrasing the
 *     attorney-facing prose, hallucinating cross-refs) without adding
 *     meaningful value.
 *   - It is faster and cheaper, matching the "no fallbacks / no cheats"
 *     philosophy: the single LLM risk stays inside the section nodes
 *     where the citation validator gates it.
 *
 * On resume (after the HITL modify path re-runs synthesis), the section
 * drafts may have been replaced in state; the stitch is recomputed end
 * to end against current state — nothing is cached.
 *
 * Inline citation markers stay as the `[CITE:<id>]` tokens the section
 * prompts emit. The synthesis node appends a "References" section listing
 * every unique id with its resolved human-readable label.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1 (node 7)
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';
import type { CitationRef, SectionDraft, SectionId } from '../deal-memo.types';
import { SECTION_ORDER, sectionTitle } from './shared/section-constants';
import {
  buildCitationRegistry,
  validateCitations,
  type CitationRegistry,
} from './shared/validate-citations';
import { dealStructureLabel } from './shared/section-prompts';

export function createMemoSynthesisNode(observability: ObservabilityService) {
  return async function memoSynthesisNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Synthesizing deal memo from section drafts',
      {
        step: 'deal_memo_synthesis_start',
        progress: 80,
        resynthesisCount: state.resynthesisCount,
      },
    );

    // Fail loud if any section is missing — synthesis must run AFTER all
    // five section nodes. The graph's sequential wiring guarantees this,
    // so a missing key here is a programmer error, not a graceful
    // degradation opportunity.
    const drafts =
      state.sectionDrafts ?? ({} as Record<SectionId, SectionDraft>);
    const missing = SECTION_ORDER.filter((id) => !drafts[id]);
    if (missing.length > 0) {
      throw new Error(
        `memo_synthesis called before all section drafts were populated. ` +
          `Missing: ${missing.join(', ')}. This is a graph-wiring bug.`,
      );
    }

    // Re-validate every citation against the registry. Redundant with the
    // per-section validators (which ran in Phase 2 nodes) but it protects
    // the modify path, where the reviewer-edited draft may introduce a
    // new fabricated ID that never passed through a node-level validator.
    const registry = buildCitationRegistry({
      documentIndex: state.documentIndex,
      runningFindings: state.runningFindings,
      riskMatrix: state.riskMatrix,
      dealBreakerFlags: state.dealBreakerFlags,
    });
    for (const sectionId of SECTION_ORDER) {
      validateCitations(sectionId, drafts[sectionId].citations, registry);
    }

    const memoMarkdown = buildMemoMarkdown(state, drafts, registry);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Synthesized deal memo (${memoMarkdown.length} chars)`,
      {
        step: 'deal_memo_synthesis_complete',
        progress: 85,
        memoLength: memoMarkdown.length,
        resynthesisCount: state.resynthesisCount,
      },
    );

    return {
      memoMarkdown,
      status: 'synthesizing',
    };
  };
}

// ── Deterministic markdown builder ──────────────────────────────────

function buildMemoMarkdown(
  state: DealMemoState,
  drafts: Record<SectionId, SectionDraft>,
  registry: CitationRegistry,
): string {
  const dc = state.dealContext;
  const title = dc
    ? `Deal Memo — ${dc.targetCompany} (${dealStructureLabel(state.dealStructure)})`
    : `Deal Memo — ${dealStructureLabel(state.dealStructure)}`;

  const header: string[] = [`# ${title}`, ''];
  if (dc) {
    header.push('## Overview', '');
    header.push(`- **Transaction type:** ${dc.transactionType}`);
    header.push(`- **Target:** ${dc.targetCompany}`);
    header.push(`- **Buyer:** ${dc.buyerCompany}`);
    if (dc.dealValueRange)
      header.push(`- **Deal value:** ${dc.dealValueRange}`);
    if (dc.jurisdictions.length)
      header.push(`- **Jurisdictions:** ${dc.jurisdictions.join(', ')}`);
    if (dc.focusAreas.length)
      header.push(`- **Focus areas:** ${dc.focusAreas.join(', ')}`);
    if (dc.knownIssues.length)
      header.push(`- **Known issues:** ${dc.knownIssues.join('; ')}`);
    header.push(
      `- **Documents in DD room:** ${state.documentIndex.length}`,
      `- **Deal-breaker flags:** ${state.dealBreakerFlags.length}`,
      `- **Missing documents flagged:** ${state.missingDocuments.length}`,
    );
    header.push('');
  }

  const body: string[] = [];
  SECTION_ORDER.forEach((sectionId, idx) => {
    const draft = drafts[sectionId].draft.trim();
    body.push(`## ${idx + 1}. ${sectionTitle(sectionId)}`, '', draft, '');
  });

  // References appendix. Collects every unique citation id across sections
  // with its resolved label (finding text / document name / risk cell /
  // deal-breaker excerpt). Produces a table attorneys can use to trace
  // any inline [CITE:<id>] marker back to the underlying DD finding.
  const references = buildReferencesAppendix(drafts, registry);

  return [...header, ...body, ...references].join('\n').trim() + '\n';
}

function buildReferencesAppendix(
  drafts: Record<SectionId, SectionDraft>,
  registry: CitationRegistry,
): string[] {
  const out: string[] = [];
  out.push('---', '', '## References', '');
  out.push(
    'Inline citation markers in the sections above use the form `[CITE:<id>]`. ' +
      'The table below resolves every unique id cited in this memo back to the ' +
      'underlying DD finding, document, risk row, or deal-breaker flag.',
    '',
  );

  const findingEntries = mapEntries(registry.findingEntries);
  const documentEntries = mapEntries(registry.documentEntries);
  const riskEntries = mapEntries(registry.riskRowEntries);
  const dbEntries = mapEntries(registry.dealBreakerEntries);

  // Union of ids cited per source kind. Per section, collect and dedupe.
  const findingIdsUsed = new Set<string>();
  const documentIdsUsed = new Set<string>();
  const riskIdsUsed = new Set<string>();
  const dbIdsUsed = new Set<string>();
  const sectionByRef = new Map<string, Set<SectionId>>();

  function track(id: string, sectionId: SectionId) {
    if (!sectionByRef.has(id)) sectionByRef.set(id, new Set());
    sectionByRef.get(id)!.add(sectionId);
  }

  for (const sectionId of SECTION_ORDER) {
    for (const c of drafts[sectionId].citations) {
      if (c.findingId) {
        findingIdsUsed.add(c.findingId);
        track(c.findingId, sectionId);
      }
      if (c.documentId) {
        documentIdsUsed.add(c.documentId);
        track(c.documentId, sectionId);
      }
      if (c.riskRowId) {
        riskIdsUsed.add(c.riskRowId);
        track(c.riskRowId, sectionId);
      }
      if (c.dealBreakerFlagId) {
        dbIdsUsed.add(c.dealBreakerFlagId);
        track(c.dealBreakerFlagId, sectionId);
      }
    }
  }

  const sectionsFor = (id: string) =>
    Array.from(sectionByRef.get(id) ?? [])
      .map((s) => sectionTitle(s))
      .join(', ');

  if (findingIdsUsed.size > 0) {
    out.push('### Findings', '');
    out.push('| ID | Severity | Document | Finding | Cited in |');
    out.push('|---|---|---|---|---|');
    for (const id of Array.from(findingIdsUsed).sort()) {
      const f = findingEntries.get(id);
      const label = f
        ? `| \`${id}\` | ${f.severity} | ${escapeCell(f.documentName)} | ${escapeCell(f.finding)} | ${sectionsFor(id)} |`
        : `| \`${id}\` | — | — | (unresolved) | ${sectionsFor(id)} |`;
      out.push(label);
    }
    out.push('');
  }
  if (documentIdsUsed.size > 0) {
    out.push('### Documents', '');
    out.push('| ID | Name | Type | Cited in |');
    out.push('|---|---|---|---|');
    for (const id of Array.from(documentIdsUsed).sort()) {
      const d = documentEntries.get(id);
      const label = d
        ? `| \`${id}\` | ${escapeCell(d.name)} | ${escapeCell(d.documentType)} | ${sectionsFor(id)} |`
        : `| \`${id}\` | (unresolved) | — | ${sectionsFor(id)} |`;
      out.push(label);
    }
    out.push('');
  }
  if (riskIdsUsed.size > 0) {
    out.push('### Risk Matrix Cells', '');
    out.push('| ID | Category | Severity | Count | Cited in |');
    out.push('|---|---|---|---|---|');
    for (const id of Array.from(riskIdsUsed).sort()) {
      const r = riskEntries.get(id);
      const label = r
        ? `| \`${id}\` | ${escapeCell(r.category)} | ${r.severity} | ${r.count} | ${sectionsFor(id)} |`
        : `| \`${id}\` | — | — | — | ${sectionsFor(id)} |`;
      out.push(label);
    }
    out.push('');
  }
  if (dbIdsUsed.size > 0) {
    out.push('### Deal-Breaker Flags', '');
    out.push('| ID | Category | Finding | Cited in |');
    out.push('|---|---|---|---|');
    for (const id of Array.from(dbIdsUsed).sort()) {
      const db = dbEntries.get(id);
      const label = db
        ? `| \`${id}\` | ${escapeCell(db.category)} | ${escapeCell(db.finding)} | ${sectionsFor(id)} |`
        : `| \`${id}\` | — | (unresolved) | ${sectionsFor(id)} |`;
      out.push(label);
    }
    out.push('');
  }

  if (
    findingIdsUsed.size === 0 &&
    documentIdsUsed.size === 0 &&
    riskIdsUsed.size === 0 &&
    dbIdsUsed.size === 0
  ) {
    out.push('_No citations recorded in this memo._', '');
  }

  return out;
}

function mapEntries<T extends { id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

function escapeCell(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 240);
}

// ── Re-synthesis edit application (used by the decision branch) ────

/**
 * Apply a `modify` decision's editedOutputs to the section drafts map.
 *
 * The decision payload is shaped by the reviewer modal — accept either
 * `editedOutputs: Record<SectionId, SectionDraft>` or a legacy
 * `editedOutputs: { [sectionId]: { draft, citations } }` where ids may be
 * camelCase. Only keys that match known SectionIds are applied; unknown
 * keys are ignored (no silent failure — caller validates the decision
 * before it reaches here).
 */
export function applyModifyEdits(
  currentDrafts: Record<SectionId, SectionDraft>,
  editedOutputs: Record<string, unknown>,
): Record<SectionId, SectionDraft> {
  const next: Record<SectionId, SectionDraft> = { ...currentDrafts };
  for (const [rawKey, value] of Object.entries(editedOutputs)) {
    const sectionId = normalizeSectionKey(rawKey);
    if (!sectionId) continue;
    if (!value || typeof value !== 'object') continue;
    const obj = value as Record<string, unknown>;
    const draft = typeof obj.draft === 'string' ? obj.draft : undefined;
    const citations = Array.isArray(obj.citations)
      ? (obj.citations as CitationRef[])
      : undefined;
    if (!draft || !citations) continue;
    next[sectionId] = { draft, citations };
  }
  return next;
}

function normalizeSectionKey(k: string): SectionId | undefined {
  const slug = k
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  if ((SECTION_ORDER as readonly string[]).includes(slug)) {
    return slug as SectionId;
  }
  return undefined;
}
