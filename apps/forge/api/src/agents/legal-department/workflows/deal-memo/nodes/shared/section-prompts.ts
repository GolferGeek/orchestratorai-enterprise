/**
 * Prompt builders for the five deal-memo section-draft nodes.
 *
 * Each section draft is produced by a single LLM call. The prompt:
 *   1. Tells the model its role (senior M&A associate) and the target
 *      deal structure (stock-purchase / asset-purchase / merger).
 *   2. Describes the required structure of the section it's drafting.
 *   3. Hands it hydrated DD context — deal context, document index,
 *      findings (with IDs), risk matrix, deal-breakers, missing docs.
 *   4. Prints the list of VALID citation IDs explicitly and tells the
 *      model that every citation it emits MUST be drawn from that list.
 *   5. Demands a strict JSON response shape: `{ draft, citations: [...] }`.
 *
 * Anti-fabrication is the whole point of the ID list: the validator in
 * `validate-citations.ts` rejects any ID that isn't in the registry, so
 * the model has no incentive to invent IDs.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1 (nodes 2-6)
 */
import type { CitationRegistry } from './validate-citations';
import type { DealMemoState } from '../../deal-memo.state';
import type { SectionId, DealStructure } from '../../deal-memo.types';

// ── Section descriptors ────────────────────────────────────────────

interface SectionDescriptor {
  title: string;
  /** Short purpose for the system prompt. */
  purpose: string;
  /** Required section outline (one-liner per sub-clause). */
  outline: string[];
  /** Any section-specific emphasis ("focus heavily on missing docs", etc.). */
  emphasis?: string;
}

const SECTION_DESCRIPTORS: Record<SectionId, SectionDescriptor> = {
  'reps-warranties': {
    title: 'Representations & Warranties',
    purpose:
      'Draft the representations and warranties section of the acquisition agreement. ' +
      'Reps cover the state of the target company. Base every rep on real DD findings — ' +
      'never draft a rep for a risk that the DD did not surface.',
    outline: [
      'Organization and authority',
      'Capitalization',
      'Financial statements and absence of undisclosed liabilities',
      'Material contracts',
      'Intellectual property',
      'Employee matters and benefits',
      'Compliance with laws and permits',
      'Litigation',
      'Taxes',
      'Environmental matters',
    ],
    emphasis:
      'Where DD findings expose known issues, the rep should be explicitly qualified ' +
      '(e.g., "Except as set forth in Schedule X, ...") with a citation to the finding.',
  },
  indemnification: {
    title: 'Indemnification',
    purpose:
      'Draft the indemnification provisions. Structure caps, baskets, and survival ' +
      'periods proportional to the severity and count of risks surfaced in DD. ' +
      'Do NOT invent numbers — frame caps as percentages or tiers and cite findings ' +
      'that justify each tier.',
    outline: [
      'General indemnification obligations (buyer and seller)',
      'Survival periods (general reps vs. fundamental reps vs. tax)',
      'Caps and baskets (tiered based on DD risk severity)',
      'Exclusive remedy + materiality scrape',
      'Third-party claim procedures',
      'Special indemnities for DD-surfaced deal breakers',
    ],
    emphasis:
      'Every special indemnity must cite the specific deal-breaker flag or ' +
      'critical finding that triggered it.',
  },
  'disclosure-schedules': {
    title: 'Disclosure Schedules',
    purpose:
      'Draft the disclosure schedules framework: the list of schedules attached ' +
      'to the agreement, each enumerating known exceptions to the reps. ' +
      'This is a scaffold with populated entries drawn from DD findings.',
    outline: [
      'Schedule of material contracts (including MFN, change-of-control, exclusivity)',
      'Schedule of IP ownership and licenses',
      'Schedule of employee-related arrangements and stock options',
      'Schedule of litigation and regulatory matters',
      'Schedule of known environmental or compliance issues',
      'Schedule of related-party transactions',
    ],
    emphasis:
      'Each schedule entry must correspond to a real DD finding. If the DD flagged ' +
      'missing documents, note them in the relevant schedule as "pending production".',
  },
  'conditions-precedent': {
    title: 'Conditions Precedent to Closing',
    purpose:
      'Draft the conditions each party must satisfy before closing. The list of ' +
      'conditions is driven by DD deal-breakers and missing documents — resolve ' +
      'them before close or walk.',
    outline: [
      'Accuracy of reps and warranties (with materiality standard)',
      'Performance of covenants',
      'Required third-party consents (including change-of-control)',
      'Regulatory approvals (HSR, industry-specific)',
      'Delivery of missing / outstanding documents',
      'Resolution of specified deal-breaker risks',
      'Absence of MAC / litigation',
    ],
    emphasis:
      'DEAL BREAKERS AND MISSING DOCUMENTS ARE CENTRAL HERE. Every deal-breaker ' +
      'flag should map to either (a) a closing condition requiring its resolution, ' +
      'or (b) a special indemnity (in which case note that the indemnification ' +
      'section handles it).',
  },
  covenants: {
    title: 'Covenants',
    purpose:
      'Draft the pre-closing and post-closing covenants. Pre-closing covenants ' +
      'govern target behavior between signing and closing. Post-closing covenants ' +
      'protect the buyer after closing.',
    outline: [
      'Conduct of business in the ordinary course (with carve-outs)',
      'Access to information and cooperation',
      'No solicitation / no-shop',
      'Required regulatory filings and consents',
      'Non-competition and non-solicitation (if applicable)',
      'Tax matters and transfer taxes',
      'Employee matters (benefit plan continuation, severance)',
      'Further assurances',
    ],
  },
};

// ── Hydration context block ────────────────────────────────────────

function safeJson(value: unknown, maxChars: number): string {
  try {
    const str = JSON.stringify(value, null, 2);
    if (str.length <= maxChars) return str;
    return (
      str.slice(0, maxChars) +
      `\n/* ...truncated from ${str.length} to ${maxChars} chars for prompt budget */`
    );
  } catch {
    return '"<unserializable>"';
  }
}

function buildDealContextBlock(state: DealMemoState): string {
  const dc = state.dealContext;
  if (!dc) return 'Deal context: (missing)';
  const lines = [
    `Transaction type: ${dc.transactionType}`,
    `Target: ${dc.targetCompany}`,
    `Buyer: ${dc.buyerCompany}`,
    dc.dealValueRange ? `Deal value: ${dc.dealValueRange}` : null,
    dc.jurisdictions.length
      ? `Jurisdictions: ${dc.jurisdictions.join(', ')}`
      : null,
    dc.focusAreas.length ? `Focus areas: ${dc.focusAreas.join(', ')}` : null,
    dc.knownIssues.length ? `Known issues: ${dc.knownIssues.join('; ')}` : null,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

function buildCitationLegendBlock(registry: CitationRegistry): string {
  const sections: string[] = [];

  sections.push('VALID findingIds (format specialistKey:index):');
  if (registry.findingEntries.length === 0) {
    sections.push('  (none — DD room produced no running findings)');
  } else {
    for (const f of registry.findingEntries) {
      sections.push(
        `  - ${f.id} | [${f.severity}] ${f.documentName}: ${f.finding.slice(0, 180)}`,
      );
    }
  }

  sections.push(
    '\nVALID documentIds (the ID is the string BEFORE the `|` separator; the human-readable name after `|` is NEVER a valid documentId):',
  );
  if (registry.documentEntries.length === 0) {
    sections.push('  (none)');
  } else {
    for (const d of registry.documentEntries) {
      sections.push(`  - ${d.id} | ${d.name} (${d.documentType})`);
    }
  }

  sections.push('\nVALID riskRowIds (format category:severity):');
  if (registry.riskRowEntries.length === 0) {
    sections.push('  (none)');
  } else {
    for (const r of registry.riskRowEntries) {
      sections.push(`  - ${r.id} | count=${r.count}`);
    }
  }

  sections.push('\nVALID dealBreakerFlagIds (format db-<index>):');
  if (registry.dealBreakerEntries.length === 0) {
    sections.push('  (none)');
  } else {
    for (const db of registry.dealBreakerEntries) {
      sections.push(`  - ${db.id} | [${db.category}] ${db.finding}`);
    }
  }

  return sections.join('\n');
}

function buildMissingDocsBlock(state: DealMemoState): string {
  if (!state.missingDocuments || state.missingDocuments.length === 0) {
    return 'Missing documents: (none identified)';
  }
  const lines = state.missingDocuments.map(
    (md) =>
      `  - [${md.importance}] ${md.description} (referenced in ${md.referencedIn.documentName}` +
      (md.referencedIn.clauseRef ? ` @ ${md.referencedIn.clauseRef}` : '') +
      `)`,
  );
  return `Missing documents (${state.missingDocuments.length}):\n${lines.join('\n')}`;
}

function buildOverviewBlock(state: DealMemoState): string {
  const findingCount = Object.values(state.runningFindings).reduce(
    (acc, s) => acc + (s?.keyFindings?.length ?? 0),
    0,
  );
  const cellsCount = state.riskMatrix?.cells?.length ?? 0;
  return [
    `Documents in DD room: ${state.documentIndex.length}`,
    `Specialists that produced findings: ${Object.keys(state.runningFindings).length}`,
    `Total keyFindings across specialists: ${findingCount}`,
    `Risk matrix cells: ${cellsCount}`,
    `Deal-breaker flags: ${state.dealBreakerFlags.length}`,
    state.prunedForBudget
      ? 'NOTE: per-document specialist outputs were pruned for prompt budget; ' +
        'rely on runningFindings and riskMatrix, not raw specialistOutputs.'
      : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

// ── Public API ─────────────────────────────────────────────────────

export interface SectionPromptMessages {
  systemMessage: string;
  userMessage: string;
}

export function dealStructureLabel(s: DealStructure): string {
  switch (s) {
    case 'stock-purchase':
      return 'Stock Purchase';
    case 'asset-purchase':
      return 'Asset Purchase';
    case 'merger':
      return 'Merger';
  }
}

/**
 * Build the system+user prompt pair for a single section.
 *
 * The system prompt encodes role + output contract. The user prompt carries
 * all hydrated DD context and the valid-citation legend.
 */
export function buildSectionPromptMessages(
  sectionId: SectionId,
  state: DealMemoState,
  registry: CitationRegistry,
): SectionPromptMessages {
  const descriptor = SECTION_DESCRIPTORS[sectionId];

  const outline = descriptor.outline
    .map((line, i) => `  ${i + 1}. ${line}`)
    .join('\n');

  const systemMessage = `You are a senior M&A associate drafting the "${descriptor.title}" section of a ${dealStructureLabel(
    state.dealStructure,
  )} acquisition-agreement memo.

PURPOSE:
${descriptor.purpose}

SECTION OUTLINE (follow this order; number each clause):
${outline}
${descriptor.emphasis ? `\nEMPHASIS:\n${descriptor.emphasis}` : ''}

OUTPUT FORMAT — respond with ONE JSON object, NO prose outside it:
{
  "draft": "<markdown string — the full drafted section with numbered clauses and inline citation markers of the form [CITE:<id>]>",
  "citations": [
    {
      "id": "<one ID, copied VERBATIM from any of the VALID lists below>",
      "excerpt": "<short quote from the real DD finding for attorney review — required, non-empty>"
    }
  ]
}

HARD RULES:
- Every citation is a single {id, excerpt} pair. The "id" MUST appear verbatim in one of the "VALID ..." lists below.
- Do NOT invent IDs. Do NOT use a filename / document title / clause reference as an id. Do NOT combine or modify IDs.
- If you want to cite something but are unsure which id fits, pick the finding that best matches from VALID findingIds — its id is "specialistKey:index" (like "contract:0"). Only use ids that appear in the lists below.
- Every citation's "excerpt" must be a short quote from the real finding — never empty.
- If a clause relies on a DD finding, include the corresponding inline marker in "draft" AND a citation object with that id.
- If the DD did not surface any material risk in an area, say so in one sentence rather than inventing content.
- Return ONLY the JSON object. No preamble, no trailing text, no markdown fences.`;

  const userMessage = `DEAL CONTEXT:
${buildDealContextBlock(state)}

DD OVERVIEW:
${buildOverviewBlock(state)}

${buildCitationLegendBlock(registry)}

RUNNING FINDINGS (full summaries, for context beyond the ID list):
${safeJson(state.runningFindings, 40_000)}

RISK MATRIX:
${safeJson(state.riskMatrix ?? { cells: [] }, 20_000)}

DEAL BREAKER FLAGS:
${safeJson(state.dealBreakerFlags, 20_000)}

${buildMissingDocsBlock(state)}

${
  state.reviewerNotes
    ? `\nREVIEWER NOTES (from the attorney who requested this memo):\n${state.reviewerNotes}\n`
    : ''
}
Draft the "${descriptor.title}" section now. Return ONLY the JSON object.`;

  return { systemMessage, userMessage };
}

/**
 * Caller-name suffixes used in LLM observability + DB capability_slug rows.
 * Exported so section nodes and the capability-role preload list stay in sync.
 */
export const SECTION_CALLER_NAMES: Record<SectionId, string> = {
  'reps-warranties': 'legal-department:deal-memo:reps-warranties',
  indemnification: 'legal-department:deal-memo:indemnification',
  'disclosure-schedules': 'legal-department:deal-memo:disclosure-schedules',
  'conditions-precedent': 'legal-department:deal-memo:conditions-precedent',
  covenants: 'legal-department:deal-memo:covenants',
};
