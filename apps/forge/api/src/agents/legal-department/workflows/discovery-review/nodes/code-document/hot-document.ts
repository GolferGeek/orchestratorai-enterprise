/**
 * Discovery Review — Hot Document Detection.
 *
 * Only runs when:
 *   - relevance.classification === 'relevant'
 *   - privilege.classification !== 'privileged'
 *   - privilege.classification !== 'potentially_privileged'
 *
 * Otherwise returns { hotDocument: false }.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.5
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type {
  DocumentCoding,
  ReviewProtocol,
} from '../../discovery-review.types';

const HOT_DOCUMENT_SYSTEM = `Is this document a "hot document" — unusually important, damaging, or significant for this case?
Respond ONLY JSON (no markdown fences):
{ "hotDocument": boolean, "hotDocumentReason": "..." }`;

/** Max characters of document text to send for hot-document analysis. */
const TEXT_LIMIT = 8000;

interface HotDocumentResult {
  hotDocument: boolean;
  hotDocumentReason?: string;
}

function parseHotDocumentResult(text: string): HotDocumentResult {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const hotDocument =
      typeof parsed.hotDocument === 'boolean' ? parsed.hotDocument : false;
    const hotDocumentReason =
      typeof parsed.hotDocumentReason === 'string' &&
      parsed.hotDocumentReason.length > 0
        ? parsed.hotDocumentReason
        : undefined;
    return { hotDocument, hotDocumentReason };
  } catch {
    return { hotDocument: false };
  }
}

export async function codeHotDocument(
  doc: { documentId: string; name: string; content: string },
  relevance: DocumentCoding['relevance'],
  privilege: DocumentCoding['privilege'],
  reviewProtocol: ReviewProtocol,
  llmClient: LLMHttpClientService,
  ctx: ExecutionContext,
): Promise<HotDocumentResult> {
  // Skip hot-document analysis for non-relevant or privileged documents.
  if (
    relevance.classification !== 'relevant' ||
    privilege.classification === 'privileged' ||
    privilege.classification === 'potentially_privileged'
  ) {
    return { hotDocument: false };
  }

  const userMessage = `Matter: ${reviewProtocol.matterName}
Claims: ${reviewProtocol.relevanceCriteria.claims.join(', ')}

Document name: "${doc.name}"
Document text (first ${TEXT_LIMIT} chars):
${doc.content.slice(0, TEXT_LIMIT)}`;

  const response = await llmClient.callLLM({
    context: ctx,
    systemMessage: HOT_DOCUMENT_SYSTEM,
    userMessage,
    callerName: 'legal-department:dr-hot-document',
    temperature: 0.1,
    maxTokens: 200,
  });

  return parseHotDocumentResult(response.text);
}
