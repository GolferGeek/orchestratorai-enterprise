/**
 * Discovery Review — Privilege Coding.
 *
 * Determines if a document is privileged. Applies a hardcoded safety rule:
 * if the LLM says "not_privileged" but confidence < 0.95, the classification
 * is upgraded to "potentially_privileged". This threshold is never configurable.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.3
 */
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type {
  DocumentCoding,
  ReviewProtocol,
} from '../../discovery-review.types';

const PRIVILEGE_SYSTEM = `You are a privilege analyst. Determine if this document is privileged.
Respond with ONLY JSON (no markdown fences):
{
  "classification": "privileged|not_privileged|potentially_privileged",
  "confidence": 0.0-1.0,
  "privilegeType": "attorney_client|work_product|both|none",
  "reasoning": "..."
}`;

/** Max characters of document text to send for privilege analysis. */
const TEXT_LIMIT = 8000;

/**
 * Hardcoded privilege confidence threshold.
 * If classification === 'not_privileged' AND confidence < this value,
 * the classification is forced to 'potentially_privileged'.
 * NEVER configurable.
 */
const PRIVILEGE_CONFIDENCE_THRESHOLD = 0.95;

interface PrivilegeResult {
  classification: 'privileged' | 'not_privileged' | 'potentially_privileged';
  confidence: number;
  privilegeType: 'attorney_client' | 'work_product' | 'both' | 'none';
  reasoning: string;
}

function parsePrivilegeResult(text: string): PrivilegeResult {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const classification = (
      ['privileged', 'not_privileged', 'potentially_privileged'] as const
    ).find((v) => v === parsed.classification);

    const privilegeType = (
      ['attorney_client', 'work_product', 'both', 'none'] as const
    ).find((v) => v === parsed.privilegeType);

    return {
      classification: classification ?? 'potentially_privileged',
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      privilegeType: privilegeType ?? 'none',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return {
      classification: 'potentially_privileged',
      confidence: 0.5,
      privilegeType: 'none',
      reasoning:
        'Could not parse LLM response — defaulting to potentially_privileged.',
    };
  }
}

/**
 * Apply the hardcoded safety rule:
 * "not_privileged" with confidence < 0.95 → "potentially_privileged".
 * This rule is applied unconditionally after LLM output is parsed.
 */
function applySafetyRule(result: PrivilegeResult): PrivilegeResult {
  if (
    result.classification === 'not_privileged' &&
    result.confidence < PRIVILEGE_CONFIDENCE_THRESHOLD
  ) {
    return { ...result, classification: 'potentially_privileged' };
  }
  return result;
}

export async function codePrivilege(
  doc: { documentId: string; name: string; content: string },
  reviewProtocol: ReviewProtocol,
  llmClient: LLMHttpClientService,
  ctx: ExecutionContext,
): Promise<DocumentCoding['privilege']> {
  const holdersDescription = [
    reviewProtocol.privilegeHolders.attorneys.length
      ? `Attorneys: ${reviewProtocol.privilegeHolders.attorneys.join(', ')}`
      : null,
    reviewProtocol.privilegeHolders.firms.length
      ? `Firms: ${reviewProtocol.privilegeHolders.firms.join(', ')}`
      : null,
    reviewProtocol.privilegeHolders.inHouseCounsel.length
      ? `In-house counsel: ${reviewProtocol.privilegeHolders.inHouseCounsel.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userMessage = `Matter: ${reviewProtocol.matterName}

Known privilege holders:
${holdersDescription}

Document name: "${doc.name}"
Document text (first ${TEXT_LIMIT} chars):
${doc.content.slice(0, TEXT_LIMIT)}`;

  const response = await llmClient.callLLM({
    context: ctx,
    systemMessage: PRIVILEGE_SYSTEM,
    userMessage,
    callerName: 'legal-department:dr-privilege',
    temperature: 0.1,
    maxTokens: 400,
  });

  const parsed = parsePrivilegeResult(response.text);
  return applySafetyRule(parsed);
}
