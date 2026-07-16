/**
 * Due Diligence Room — Classify All Node.
 *
 * Iterates over all documents in the room, runs a lightweight LLM
 * classification on each (type, parties, date, one-line summary), and
 * populates the document index. Classification is sequential to avoid
 * overwhelming local providers.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 2)
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';
import type { DocumentIndexEntry } from '../due-diligence.types';

const CLASSIFY_SYSTEM = `You are a document classifier for M&A due diligence. The corpus may contain both legal and financial documents.

Given the text of a document, respond with ONLY a JSON object (no markdown fences):
{
  "documentType": "<type>",
  "parties": ["<party1>", "<party2>"],
  "date": "<YYYY-MM-DD or null>",
  "summary": "<one sentence summary>"
}

Document types — choose EXACTLY ONE of the following:

Legal:
- contract: a bilateral/multilateral commercial agreement (MSA, supply, licensing, services).
- nda: a non-disclosure or confidentiality agreement (one or two-way).
- employment_agreement: employment, executive, consulting, or contractor agreement.
- lease: real property or equipment lease.
- ip_assignment: an intellectual property assignment, work-for-hire, or IP license.
- privacy_policy: a privacy or data-protection policy (consumer-facing or internal).
- corporate_governance: charter, bylaws, board resolutions, shareholder agreements.
- regulatory_filing: regulatory submission (SEC, FDA, EPA, foreign regulators).
- insurance_policy: an insurance policy or binder.
- litigation: a complaint, answer, motion, settlement agreement, or litigation schedule.
- amendment: an amendment to an earlier agreement.
- schedule: a schedule or exhibit supplement referenced by another agreement.
- exhibit: an exhibit attached to a primary agreement.

Financial:
- balance_sheet: a statement of assets, liabilities, and equity at a point in time.
- profit_and_loss: an income statement (revenue, expenses, net income) over a period. (Also called P&L or statement of operations.)
- cash_flow: a statement of cash flows (operating, investing, financing) over a period.
- cap_table: a capitalization table showing share classes, holders, preferences, and anti-dilution terms.
- debt_schedule: a schedule of outstanding debt facilities, covenants, maturities, and change-of-control triggers.
- audit_letter: an independent auditor's report, opinion letter, or emphasis-of-matter letter.
- projections: forward-looking financial projections, forecasts, or scenario models (NOT a historical statement).
- board_deck: a board-of-directors meeting deck, minutes, or update (may cover revenue, headcount, risks, strategy).

Fallback:
- other: none of the above. Prefer a specific type over "other" whenever possible.

Be concise. The summary should be one sentence describing what the document is about.`;

/** Max characters of document text to send for classification. */
const CLASSIFY_TEXT_LIMIT = 8000;

interface ClassificationResult {
  documentType: string;
  parties: string[];
  date: string | null;
  summary: string;
}

const LEGACY_TYPE_ALIASES: Record<string, string> = {
  // The v1 DD workflow used a single generic `financial_statement` bucket.
  // Financial analysis (2026-04) splits it into subtypes. If an older LLM
  // response, a replayed checkpoint, or prompt drift still emits the legacy
  // token, route it to `other` — the dispatch table no longer has a
  // `financial_statement` key and we will not silently pick a subtype.
  financial_statement: 'other',
};

function normalizeDocumentType(raw: string): string {
  const aliased = LEGACY_TYPE_ALIASES[raw];
  return aliased ?? raw;
}

function parseClassification(text: string): ClassificationResult {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const rawType =
      typeof parsed.documentType === 'string' ? parsed.documentType : 'other';
    return {
      documentType: normalizeDocumentType(rawType),
      parties: Array.isArray(parsed.parties)
        ? (parsed.parties as unknown[]).filter(
            (p): p is string => typeof p === 'string',
          )
        : [],
      date: typeof parsed.date === 'string' ? parsed.date : null,
      summary:
        typeof parsed.summary === 'string' ? parsed.summary : 'No summary',
    };
  } catch {
    return {
      documentType: 'other',
      parties: [],
      date: null,
      summary: 'Classification failed — could not parse LLM response.',
    };
  }
}

export function createClassifyAllNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function classifyAllNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;
    const total = state.documents.length;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Classifying ${total} documents`,
      { step: 'dd_classification_start', progress: 5 },
    );

    const updatedIndex: DocumentIndexEntry[] = [...state.documentIndex];

    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i]!;

      // Skip documents that have no index entry (safety: protects against
      // orphan documents from failed incremental attempts)
      const existingEntry = updatedIndex[i];
      if (!existingEntry) {
        continue;
      }

      // Skip documents already classified or completed (incremental mode)
      if (
        existingEntry.status === 'classified' ||
        existingEntry.status === 'complete' ||
        existingEntry.status === 'failed' ||
        existingEntry.status === 'analyzing'
      ) {
        continue;
      }

      // Mark classifying
      updatedIndex[i] = { ...updatedIndex[i]!, status: 'classifying' };

      const progress = 5 + Math.round((i / total) * 5); // 5-10% range
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Classifying document ${i + 1} of ${total}: ${doc.name}`,
        {
          step: 'dd_classifying_document',
          progress,
          documentId: doc.documentId,
          documentName: doc.name,
          current: i + 1,
          total,
        },
      );

      // Truncate document text for classification
      const snippet = doc.content.slice(0, CLASSIFY_TEXT_LIMIT);

      try {
        const response = await llmClient.callLLM({
          context: ctx,
          systemMessage: CLASSIFY_SYSTEM,
          userMessage: `Document name: "${doc.name}"\n\nDocument text (first ${CLASSIFY_TEXT_LIMIT} chars):\n\n${snippet}`,
          callerName: 'legal-department:dd-classify',
          temperature: 0.1,
          maxTokens: 500,
        });

        const classification = parseClassification(response.text);

        updatedIndex[i] = {
          ...updatedIndex[i]!,
          documentType: classification.documentType,
          parties: classification.parties,
          date: classification.date,
          summary: classification.summary,
          status: 'classified',
        };

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Classified: ${doc.name} → ${classification.documentType}`,
          {
            step: 'dd:document_classified',
            documentId: doc.documentId,
            name: doc.name,
            documentType: classification.documentType,
            summary: classification.summary,
          },
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        updatedIndex[i] = {
          ...updatedIndex[i]!,
          documentType: 'unknown',
          summary: `Classification failed: ${errMsg}`,
          status: 'classified', // Still classified, just with unknown type
        };
      }
    }

    // Build type breakdown for completion event
    const typeBreakdown: Record<string, number> = {};
    for (const entry of updatedIndex) {
      typeBreakdown[entry.documentType] =
        (typeBreakdown[entry.documentType] ?? 0) + 1;
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Classification complete: ${total} documents classified`,
      {
        step: 'dd:classification_complete',
        progress: 10,
        totalDocuments: total,
        typeBreakdown,
      },
    );

    return {
      documentIndex: updatedIndex,
      status: 'analyzing',
    };
  };
}
