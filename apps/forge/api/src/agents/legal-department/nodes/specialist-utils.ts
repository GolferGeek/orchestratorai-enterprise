import { LegalDepartmentState } from '../legal-department.state';
import type {
  RagStorageService,
  RagSearchResult,
} from '@orchestratorai/planes/rag';

/**
 * Query a RAG collection for relevant context
 *
 * RAG enrichment is optional — specialists proceed without it if:
 * - ragService is not configured
 * - collection does not exist
 * - collection has no matching results
 *
 * Per PRD: "If a collection is empty, the specialist proceeds without RAG
 * context (no error, just no enrichment)."
 */
export async function queryCollectionForContext(
  ragService: RagStorageService | undefined,
  orgSlug: string,
  collectionSlug: string,
  queryText: string,
  topK: number = 3,
): Promise<string> {
  if (!ragService) return '';

  try {
    const collection = await ragService.getCollectionBySlug(
      collectionSlug,
      orgSlug,
    );
    if (!collection) return '';

    const results = await ragService.keywordSearch(
      collection.id,
      orgSlug,
      queryText,
      topK,
    );
    if (!results || results.length === 0) return '';

    return results
      .map((r: RagSearchResult) => `[${r.documentFilename}] ${r.content}`)
      .join('\n\n');
  } catch {
    // RAG is best-effort enrichment — don't fail the specialist if RAG is unavailable
    return '';
  }
}

/**
 * Get document text from state
 *
 * Shared across all 8 specialist nodes. Checks documents array first,
 * then falls back to extracting content from legalMetadata sections.
 */
export function getDocumentText(
  state: LegalDepartmentState,
): string | undefined {
  if (state.documents && state.documents.length > 0) {
    return state.documents[0]!.content;
  }

  if (state.legalMetadata?.sections?.sections) {
    return state.legalMetadata.sections.sections
      .map((s) => s.content)
      .join('\n\n');
  }

  return undefined;
}

/**
 * Strip markdown code fences from LLM JSON responses
 *
 * Handles ```json ... ``` and ``` ... ``` wrapping that LLMs often add
 * despite being instructed to return raw JSON.
 */
export function stripMarkdownFences(text: string): string {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  return jsonStr.trim();
}

/**
 * Build the shared metadata/party/date section of a specialist user message
 *
 * Shared across all 8 specialist nodes. Each specialist prepends its own
 * intro line before calling this function.
 *
 * Does NOT include the document type confidence percentage — kept simple
 * so all specialists produce a consistent metadata section.
 */
export function buildBaseUserMessage(
  documentText: string,
  state: LegalDepartmentState,
): string {
  let message = documentText;

  if (state.legalMetadata) {
    const metadata = state.legalMetadata;
    message += `\n\n---\nDocument Metadata:`;
    message += `\n- Document Type: ${metadata.documentType.type}`;

    if (metadata.parties.contractingParties) {
      const [party1, party2] = metadata.parties.contractingParties;
      const names = [party1?.name, party2?.name].filter(Boolean);
      if (names.length > 0) {
        message += `\n- Contracting Parties: ${names.join(' and ')}`;
      }
    }

    if (metadata.dates.primaryDate) {
      message += `\n- Primary Date: ${metadata.dates.primaryDate.normalizedDate}`;
    }
  }

  if (state.userMessage && state.userMessage.toLowerCase() !== 'analyze') {
    message += `\n\n---\nUser Request: ${state.userMessage}`;
  }

  return message;
}
