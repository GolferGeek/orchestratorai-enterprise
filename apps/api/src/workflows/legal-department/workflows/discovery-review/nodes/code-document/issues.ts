/**
 * Discovery Review — Issue Tag Coding.
 *
 * Scores each ReviewProtocol.issueTags entry for the document.
 * One LLM call per tag (sequential). Returns empty array if no tags defined.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.4
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type {
  DocumentCoding,
  ReviewProtocol,
} from '../../discovery-review.types';

const ISSUES_SYSTEM = `Given document text and an issue tag definition, score the document's relevance to that issue.
Respond with ONLY JSON (no markdown fences):
{ "confidence": 0.0-1.0 }`;

/** Max characters of document text to send for issue scoring. */
const TEXT_LIMIT = 8000;

function parseConfidence(text: string): number {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const confidence =
      typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    return Math.max(0, Math.min(1, confidence));
  } catch {
    return 0;
  }
}

export async function codeIssues(
  doc: { documentId: string; name: string; content: string },
  reviewProtocol: ReviewProtocol,
  llmClient: LLMHttpClientService,
  ctx: ExecutionContext,
): Promise<DocumentCoding['issueTags']> {
  if (reviewProtocol.issueTags.length === 0) {
    return [];
  }

  const results: DocumentCoding['issueTags'] = [];

  for (const tag of reviewProtocol.issueTags) {
    const userMessage = `Issue tag: "${tag.tagName}"
Description: ${tag.description}

Document name: "${doc.name}"
Document text (first ${TEXT_LIMIT} chars):
${doc.content.slice(0, TEXT_LIMIT)}`;

    const response = await llmClient.callLLM({
      context: ctx,
      systemMessage: ISSUES_SYSTEM,
      userMessage,
      callerName: 'legal-department:dr-issues',
      temperature: 0.1,
      maxTokens: 100,
    });

    const confidence = parseConfidence(response.text);
    results.push({ tagId: tag.tagId, confidence });
  }

  return results;
}
