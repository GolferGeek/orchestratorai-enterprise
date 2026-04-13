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

const CLASSIFY_SYSTEM = `You are a legal document classifier for M&A due diligence.

Given the text of a legal document, respond with ONLY a JSON object (no markdown fences):
{
  "documentType": "<type>",
  "parties": ["<party1>", "<party2>"],
  "date": "<YYYY-MM-DD or null>",
  "summary": "<one sentence summary>"
}

Document types: contract, nda, employment_agreement, lease, ip_assignment, privacy_policy, corporate_governance, regulatory_filing, financial_statement, insurance_policy, litigation, amendment, schedule, exhibit, other.

Be concise. The summary should be one sentence describing what the document is about.`;

/** Max characters of document text to send for classification. */
const CLASSIFY_TEXT_LIMIT = 8000;

interface ClassificationResult {
  documentType: string;
  parties: string[];
  date: string | null;
  summary: string;
}

function parseClassification(text: string): ClassificationResult {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      documentType:
        typeof parsed.documentType === 'string' ? parsed.documentType : 'other',
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
