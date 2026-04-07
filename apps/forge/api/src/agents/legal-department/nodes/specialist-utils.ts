import { LegalDepartmentState } from '../legal-department.state';
import type {
  RagStorageService,
  RagSearchResult,
} from '@orchestratorai/planes/rag';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { countTokens, getModelBudget } from '../services/token-count.util';

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

  // If an attorney has rejected a prior pass with feedback, surface it to
  // the specialist so the re-run explicitly addresses the reviewer's concerns.
  const decision = state.orchestration?.hitlDecision;
  if (
    decision?.decision === 'reject' &&
    'feedback' in decision &&
    decision.feedback
  ) {
    message += `\n\n---\nReviewer Feedback (previous pass was rejected — address these concerns):\n${decision.feedback}`;
  }

  return message;
}

// ─────────────────────────────────────────────────────────────────────────
// runSpecialistOverDocument — token-budget-aware specialist runner
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tunables for one specialist invocation. The same shape works for the
 * single-call and chunked paths — `runSpecialistOverDocument` decides
 * which to use based on the model's token budget.
 *
 * The caller supplies:
 *  - the prebuilt `systemMessage` so we can include it in the budget math
 *  - a `buildUserMessage(chunk, state)` that produces the per-call user
 *    message from a (possibly chunked) slice of the document text
 *  - a `parse` function that turns LLM text into the specialist's typed
 *    output, and a `merge` function that combines per-chunk outputs into
 *    a single result. The merge contract is "deterministic for the same
 *    inputs" — see PRD §8 Phase 2.
 */
export interface SpecialistRunOptions<T> {
  llmClient: LLMHttpClientService;
  observability: ObservabilityService;
  state: LegalDepartmentState;
  documentText: string;
  systemMessage: string;
  callerName: string;
  temperature?: number;
  /** Max output tokens per LLM call. Also reserved from the input budget. */
  maxTokens?: number;
  /** Builds the per-call user message from a (possibly partial) text slice. */
  buildUserMessage: (chunkText: string, state: LegalDepartmentState) => string;
  /** Parses one LLM response into the typed specialist output. */
  parse: (responseText: string) => T;
  /** Merges per-chunk outputs into a single deterministic result. */
  merge: (results: T[]) => T;
  /** Human label used in observability events (e.g. "Contract Agent"). */
  progressLabel: string;
  /**
   * Step prefix used for chunking observability events. Should match the
   * `stepPrefix` the legal presentation file uses for this specialist
   * (e.g. "contract_agent") so the stage ladder picks the chunked ticker
   * up under the right stage row. Defaults to `callerName`.
   */
  progressStepPrefix?: string;
}

export interface SpecialistRunResult<T> {
  result: T;
  /** Number of LLM calls actually issued. 1 = single-call path. */
  chunks: number;
}

/**
 * Splits `text` into chunks where each chunk fits within `targetTokens`
 * tokens (measured with the same encoder as the rest of the system).
 *
 * Strategy: paragraph-first split (double-newline), then for any paragraph
 * that itself blows the budget, fall back to a sentence split, and finally
 * to a hard character split. Always returns at least one chunk.
 *
 * The merge contract relies on chunks being non-overlapping and in order,
 * so we never duplicate text across chunks.
 */
export function chunkTextByTokens(
  text: string,
  targetTokens: number,
  model?: string,
): string[] {
  if (targetTokens <= 0) return [text];
  if (countTokens(text, model) <= targetTokens) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  let currentTokens = 0;

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = '';
      currentTokens = 0;
    }
  };

  const pushPiece = (piece: string) => {
    const pieceTokens = countTokens(piece, model);
    if (pieceTokens > targetTokens) {
      // Hard-split overlong piece by character count proportional to tokens.
      flush();
      const ratio = targetTokens / pieceTokens;
      const charsPerSlice = Math.max(1, Math.floor(piece.length * ratio * 0.9));
      for (let i = 0; i < piece.length; i += charsPerSlice) {
        chunks.push(piece.slice(i, i + charsPerSlice));
      }
      return;
    }
    if (currentTokens + pieceTokens > targetTokens) {
      flush();
    }
    current = current ? `${current}\n\n${piece}` : piece;
    currentTokens += pieceTokens;
  };

  for (const paragraph of paragraphs) {
    const pTokens = countTokens(paragraph, model);
    if (pTokens <= targetTokens) {
      pushPiece(paragraph);
      continue;
    }
    // Paragraph too big — split on sentence boundaries.
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      pushPiece(sentence);
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Runs a specialist's LLM call against the document, automatically
 * chunking when the input would exceed the model's per-call budget.
 *
 * Single-call path: when the full user message fits, we issue exactly
 * one LLM call and parse the response. The chunked path issues one call
 * per chunk and feeds all parsed outputs through the caller's `merge`.
 *
 * The function emits an observability progress event when chunking
 * actually happens so the stage ladder can show "chunked: N segments"
 * (PRD §8 Phase 2).
 */
export async function runSpecialistOverDocument<T>(
  opts: SpecialistRunOptions<T>,
): Promise<SpecialistRunResult<T>> {
  const ctx = opts.state.executionContext;
  const budget = getModelBudget(ctx.model);
  const reservedOutput = opts.maxTokens ?? budget.reservedOutput;
  // System message + framing overhead — count once. We add a small fudge
  // factor for chat-template tokens the encoder doesn't see directly.
  const systemTokens = countTokens(opts.systemMessage, ctx.model) + 64;
  // Per-call input budget = window − output reservation − system overhead.
  // Floor at 1 so the chunker always has something positive to work with.
  const perCallInputBudget = Math.max(
    1,
    budget.contextWindow - reservedOutput - systemTokens,
  );

  // Measure the FULL user message once to decide single vs chunked.
  const fullUserMessage = opts.buildUserMessage(opts.documentText, opts.state);
  const fullUserTokens = countTokens(fullUserMessage, ctx.model);

  if (fullUserTokens <= perCallInputBudget) {
    const response = await opts.llmClient.callLLM({
      context: ctx,
      systemMessage: opts.systemMessage,
      userMessage: fullUserMessage,
      callerName: opts.callerName,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    return { result: opts.parse(response.text), chunks: 1 };
  }

  // Chunked path: split the *document text* (not the framed user message)
  // so each chunk's user message stays self-contained and well-formed.
  // We give each chunk a slightly smaller target to leave room for the
  // metadata/RAG framing the buildUserMessage callback wraps around it.
  const framingHeadroom = Math.max(
    256,
    fullUserTokens - countTokens(opts.documentText, ctx.model),
  );
  const targetChunkTokens = Math.max(1, perCallInputBudget - framingHeadroom);
  const chunks = chunkTextByTokens(
    opts.documentText,
    targetChunkTokens,
    ctx.model,
  );

  const stepPrefix = opts.progressStepPrefix ?? opts.callerName;
  await opts.observability.emitProgress(
    ctx,
    ctx.conversationId,
    `${opts.progressLabel}: chunked: ${chunks.length} segments`,
    {
      step: `${stepPrefix}_chunking`,
      chunks: chunks.length,
      perCallInputBudget,
    },
  );

  const perChunkResults: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const userMessage = opts.buildUserMessage(chunk, opts.state);
    const response = await opts.llmClient.callLLM({
      context: ctx,
      systemMessage: opts.systemMessage,
      userMessage,
      callerName: opts.callerName,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    perChunkResults.push(opts.parse(response.text));
  }

  const merged = opts.merge(perChunkResults);
  await opts.observability.emitProgress(
    ctx,
    ctx.conversationId,
    `${opts.progressLabel}: merged ${chunks.length} chunks`,
    {
      step: `${stepPrefix}_chunk_merge`,
      chunks: chunks.length,
      merged: true,
    },
  );
  return { result: merged, chunks: chunks.length };
}
