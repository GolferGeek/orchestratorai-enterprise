/**
 * Discovery Review — Relevance Coding.
 *
 * Given a document and the case's relevance criteria, classifies the document
 * as relevant | not_relevant | potentially_relevant.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.2
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type {
  DocumentCoding,
  ReviewProtocol,
} from '../../discovery-review.types';

const RELEVANCE_SYSTEM = `You are a relevance analyst for litigation discovery. Given document text and the case's relevance criteria, classify the document.
Respond with ONLY JSON (no markdown fences):
{
  "classification": "relevant|not_relevant|potentially_relevant",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "matchingCriteria": ["criterion1", ...]
}`;

/** Max characters of document text to send for relevance analysis. */
const TEXT_LIMIT = 8000;

interface RelevanceResult {
  classification: 'relevant' | 'not_relevant' | 'potentially_relevant';
  confidence: number;
  reasoning: string;
  matchingCriteria: string[];
}

function parseRelevanceResult(text: string): RelevanceResult {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const classification = (
      ['relevant', 'not_relevant', 'potentially_relevant'] as const
    ).find((v) => v === parsed.classification);
    return {
      classification: classification ?? 'potentially_relevant',
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      matchingCriteria: Array.isArray(parsed.matchingCriteria)
        ? (parsed.matchingCriteria as unknown[]).filter(
            (c): c is string => typeof c === 'string',
          )
        : [],
    };
  } catch {
    return {
      classification: 'potentially_relevant',
      confidence: 0.5,
      reasoning:
        'Could not parse LLM response — defaulting to potentially_relevant.',
      matchingCriteria: [],
    };
  }
}

export async function codeRelevance(
  doc: { documentId: string; name: string; content: string },
  reviewProtocol: ReviewProtocol,
  llmClient: LLMHttpClientService,
  ctx: ExecutionContext,
): Promise<DocumentCoding['relevance']> {
  const criteriaDescription = [
    `Claims: ${reviewProtocol.relevanceCriteria.claims.join(', ')}`,
    `Key parties: ${reviewProtocol.relevanceCriteria.keyParties.join(', ')}`,
    `Key topics: ${reviewProtocol.relevanceCriteria.keyTopics.join(', ')}`,
    reviewProtocol.relevanceCriteria.dateRange
      ? `Date range: ${reviewProtocol.relevanceCriteria.dateRange.start} to ${reviewProtocol.relevanceCriteria.dateRange.end}`
      : null,
    reviewProtocol.relevanceCriteria.exclusions?.length
      ? `Exclusions: ${reviewProtocol.relevanceCriteria.exclusions.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userMessage = `Matter: ${reviewProtocol.matterName}

Relevance criteria:
${criteriaDescription}

Document name: "${doc.name}"
Document text (first ${TEXT_LIMIT} chars):
${doc.content.slice(0, TEXT_LIMIT)}`;

  const response = await llmClient.callLLM({
    context: ctx,
    systemMessage: RELEVANCE_SYSTEM,
    userMessage,
    callerName: 'legal-department:dr-relevance',
    temperature: 0.1,
    maxTokens: 400,
  });

  return parseRelevanceResult(response.text);
}
