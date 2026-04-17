/**
 * Discovery Review — Classify All Node.
 *
 * Iterates over all ingested documents and runs a lightweight LLM
 * classification call on each to determine:
 *   - documentType: email | attachment | contract | memo | presentation |
 *                   spreadsheet | other
 *   - threadId: optional thread grouping for email threads
 *   - date: approximate document date (ISO or null)
 *   - summary: one-sentence summary
 *
 * Email thread grouping: consecutive emails with the same Subject
 * (minus Re:/Fwd: prefixes) are grouped under a shared threadId.
 *
 * Emits `dr:classification_complete` at the end of all classifications.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §1.6
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type { DocumentIndexEntry } from '../discovery-review.types';

const CLASSIFY_SYSTEM = `You are a document classifier for litigation discovery review.

Given the text of a document, respond with ONLY a JSON object (no markdown fences):
{
  "documentType": "<type>",
  "threadSubject": "<email subject normalized, or null if not an email>",
  "date": "<YYYY-MM-DD or null>",
  "summary": "<one sentence summary>"
}

Document types — choose EXACTLY ONE of the following:
- email: an email or email thread
- attachment: an attachment to an email (image, PDF, spreadsheet, etc.)
- contract: a formal agreement between parties
- memo: an internal memorandum or note
- presentation: a slide deck or presentation
- spreadsheet: a table, spreadsheet, or data extract
- other: none of the above

For emails, set "threadSubject" to the normalized subject (remove Re:, Fwd:, RE:, FW: prefixes).
For non-emails, set "threadSubject" to null.

Be concise. The summary should be one sentence.`;

/** Max characters of document text to send for classification. */
const CLASSIFY_TEXT_LIMIT = 6000;

interface ClassificationResult {
  documentType: string;
  threadSubject: string | null;
  date: string | null;
  summary: string;
}

function parseClassification(text: string): ClassificationResult {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      documentType:
        typeof parsed.documentType === 'string' ? parsed.documentType : 'other',
      threadSubject:
        typeof parsed.threadSubject === 'string' ? parsed.threadSubject : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
      summary:
        typeof parsed.summary === 'string' ? parsed.summary : 'No summary.',
    };
  } catch {
    return {
      documentType: 'other',
      threadSubject: null,
      date: null,
      summary: 'Classification failed — could not parse LLM response.',
    };
  }
}

/**
 * Assign threadIds to grouped email documents.
 * Two documents share a threadId if they both classify as `email` and
 * have the same normalized threadSubject.
 */
function assignThreadIds(
  entries: Array<DocumentIndexEntry & { _threadSubject?: string | null }>,
): DocumentIndexEntry[] {
  const subjectToThreadId = new Map<string, string>();
  let threadCounter = 0;

  return entries.map((entry) => {
    if (entry.documentType !== 'email' || !entry._threadSubject) {
      const { _threadSubject: _, ...rest } = entry;
      return rest;
    }

    const subject = entry._threadSubject.toLowerCase().trim();
    if (!subjectToThreadId.has(subject)) {
      subjectToThreadId.set(subject, `thread-${++threadCounter}`);
    }

    const { _threadSubject: _, ...rest } = entry;
    return { ...rest, threadId: subjectToThreadId.get(subject) };
  });
}

export function createClassifyAllNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function classifyAllNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;
    const total = state.documents.length;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Classifying ${total} documents`,
      { step: 'dr_classification_start', progress: 8 },
    );

    // Build mutable index copy; cast to include interim _threadSubject field
    const updatedIndex: Array<
      DocumentIndexEntry & { _threadSubject?: string | null }
    > = state.documentIndex.map((entry) => ({ ...entry }));

    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i]!;
      const existingEntry = updatedIndex[i];
      if (!existingEntry) continue;

      // Skip already-classified documents (guards against re-classification
      // in future incremental runs).
      if (
        existingEntry.status === 'classified' ||
        existingEntry.status === 'coded' ||
        existingEntry.status === 'failed'
      ) {
        continue;
      }

      const progress = 8 + Math.round((i / total) * 7); // 8→15%
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Classifying document ${i + 1} of ${total}: ${doc.name}`,
        {
          step: 'dr_classifying_document',
          progress,
          documentId: doc.documentId,
          documentName: doc.name,
          current: i + 1,
          total,
        },
      );

      const snippet = doc.content.slice(0, CLASSIFY_TEXT_LIMIT);

      try {
        const response = await llmClient.callLLM({
          context: ctx,
          systemMessage: CLASSIFY_SYSTEM,
          userMessage: `Document name: "${doc.name}"\n\nDocument text (first ${CLASSIFY_TEXT_LIMIT} chars):\n\n${snippet}`,
          callerName: 'legal-department:dr-classify',
          temperature: 0.1,
          maxTokens: 300,
        });

        const classification = parseClassification(response.text);

        updatedIndex[i] = {
          ...updatedIndex[i]!,
          documentType: classification.documentType,
          date: classification.date,
          summary: classification.summary,
          status: 'classified',
          _threadSubject: classification.threadSubject,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        updatedIndex[i] = {
          ...updatedIndex[i]!,
          documentType: 'other',
          summary: `Classification failed: ${errMsg}`,
          status: 'classified',
          _threadSubject: null,
        };
      }
    }

    // Assign thread IDs and strip the interim _threadSubject field
    const finalIndex = assignThreadIds(updatedIndex);

    // Build type breakdown for the completion event
    const typeBreakdown: Record<string, number> = {};
    for (const entry of finalIndex) {
      typeBreakdown[entry.documentType] =
        (typeBreakdown[entry.documentType] ?? 0) + 1;
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Classification complete: ${total} documents classified`,
      {
        step: 'dr:classification_complete',
        progress: 15,
        totalDocuments: total,
        typeBreakdown,
      },
    );

    return {
      documentIndex: finalIndex,
      status: 'coding',
    };
  };
}
