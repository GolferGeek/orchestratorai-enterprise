import {
  LegalDepartmentState,
  LegalDocumentMetadata,
} from '../legal-department.state';
import type { ClauseAnnotation } from '../legal-department.types';
import type {
  RagStorageService,
  RagSearchResult,
} from '@orchestratorai/planes/rag';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { countTokens, getModelBudget } from '../services/token-count.util';
import { callLLMMaybeWithReasoning } from '../../shared/services/llm-maybe-reasoning.helper';

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
 * Enumerate all documents in the state, paired with their metadata.
 *
 * Returns one entry per document in state.documents[]. The metadata field
 * is index-aligned: documentsMetadata[i] corresponds to documents[i]. If
 * the metadata array is shorter than the documents array (e.g., metadata
 * extraction partially failed), the trailing entries will have undefined
 * metadata — specialists must handle that case gracefully.
 *
 * Phase 3 replacement for `getDocumentText`. Every specialist that used to
 * call `getDocumentText(state)` now calls `enumerateDocuments(state)` and
 * iterates over the returned entries.
 */
export interface DocumentEntry {
  index: number;
  name: string;
  content: string;
  type?: string;
  metadata: LegalDocumentMetadata | undefined;
}

export function enumerateDocuments(
  state: LegalDepartmentState,
): DocumentEntry[] {
  if (!state.documents || state.documents.length === 0) return [];
  return state.documents.map((doc, i) => ({
    index: i,
    name: doc.name,
    content: doc.content,
    type: doc.type,
    metadata: state.documentsMetadata?.[i],
  }));
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
 * Build the shared metadata/party/date section of a specialist user message.
 *
 * Shared across all 8 specialist nodes. Each specialist prepends its own
 * intro line before calling this function.
 *
 * `metadata` is the per-document metadata for the chunk being analyzed.
 * It may be undefined when extraction failed or was not run for that doc.
 *
 * Does NOT include the document type confidence percentage — kept simple
 * so all specialists produce a consistent metadata section.
 */
export function buildBaseUserMessage(
  documentText: string,
  state: LegalDepartmentState,
  metadata?: LegalDocumentMetadata,
): string {
  let message = documentText;

  const meta = metadata ?? state.documentsMetadata?.[0];

  if (meta) {
    message += `\n\n---\nDocument Metadata:`;
    message += `\n- Document Type: ${meta.documentType.type}`;

    if (meta.parties.contractingParties) {
      const [party1, party2] = meta.parties.contractingParties;
      const names = [party1?.name, party2?.name].filter(Boolean);
      if (names.length > 0) {
        message += `\n- Contracting Parties: ${names.join(' and ')}`;
      }
    }

    if (meta.dates.primaryDate) {
      message += `\n- Primary Date: ${meta.dates.primaryDate.normalizedDate}`;
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
    const response = await callLLMMaybeWithReasoning(opts.llmClient, {
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
  //
  // Each chunk needs to leave room for the metadata/RAG/instructions
  // framing that buildUserMessage wraps around it. We measure the actual
  // framing overhead, but cap it at half the per-call budget — otherwise
  // a heavy RAG context (which is fixed-size per call, independent of
  // doc size) could shrink the per-chunk doc allowance to zero and send
  // the chunker into hard-split mode producing thousands of microchunks.
  // The cap means: if RAG returns a lot of context, we still guarantee
  // the doc gets at least half the budget; the other half holds framing
  // (truncation of which is the LLM's problem, not ours).
  const measuredFraming =
    fullUserTokens - countTokens(opts.documentText, ctx.model);
  const framingHeadroom = Math.min(
    Math.floor(perCallInputBudget / 2),
    Math.max(256, measuredFraming),
  );
  // Floor the per-chunk target at 1000 tokens so even a pathological
  // budget never sends the chunker into character-level slicing.
  const targetChunkTokens = Math.max(
    1000,
    perCallInputBudget - framingHeadroom,
  );
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
    const response = await callLLMMaybeWithReasoning(opts.llmClient, {
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

// ─────────────────────────────────────────────────────────────────────────
// runSpecialistOverDocuments — multi-document fan-out (Phase 3)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Options for running a specialist across multiple documents.
 * Extends SpecialistRunOptions to allow per-document metadata context.
 */
export interface SpecialistRunDocumentsOptions<T> extends Omit<
  SpecialistRunOptions<T>,
  'documentText'
> {
  /** The enumerated document entries from enumerateDocuments(). */
  documents: DocumentEntry[];
}

/**
 * Runs a specialist across all documents in the job.
 *
 * Strategy per token budget:
 *   - For each document, call `runSpecialistOverDocument` (which itself
 *     handles chunking if the single doc is oversized).
 *   - After all documents are processed, merge all per-document results
 *     into a single final output via the caller's `merge` function.
 *   - If there is only one document, delegates directly to
 *     `runSpecialistOverDocument` — no merge overhead.
 *
 * The `buildUserMessage` callback receives the chunk text and state. For
 * the multi-document path, the state's first documentsMetadata entry is
 * used as context unless the caller overrides it in the callback itself.
 *
 * Merge rules across documents use the same merge function as across
 * chunks: risk flags are concat+dedupe by name; clauses first-non-empty-
 * wins; classification from first doc; confidence is min; summary is join.
 */
export async function runSpecialistOverDocuments<T>(
  opts: SpecialistRunDocumentsOptions<T>,
): Promise<SpecialistRunResult<T>> {
  const { documents } = opts;

  if (documents.length === 0) {
    throw new Error('runSpecialistOverDocuments: no documents provided');
  }

  if (documents.length === 1) {
    // Single-document path — delegate to the existing helper unchanged.
    return runSpecialistOverDocument<T>({
      ...opts,
      documentText: documents[0]!.content,
    });
  }

  // Multi-document path: fan out per document then merge.
  const ctx = opts.state.executionContext;
  await opts.observability.emitProgress(
    ctx,
    ctx.conversationId,
    `${opts.progressLabel}: processing ${documents.length} documents`,
    {
      step: `${opts.progressStepPrefix ?? opts.callerName}_multi_doc_start`,
      documentCount: documents.length,
    },
  );

  const perDocResults: T[] = [];
  let totalChunks = 0;

  for (let di = 0; di < documents.length; di++) {
    const doc = documents[di]!;
    // Build a per-document opts that injects the document's metadata into
    // the user message via a wrapped buildUserMessage that passes metadata.
    // We carry the document metadata through by temporarily patching state's
    // documentsMetadata to surface the right metadata for this document.
    const docState: LegalDepartmentState = {
      ...opts.state,
      documentsMetadata: [
        doc.metadata ?? opts.state.documentsMetadata?.[di],
      ].filter((m): m is LegalDocumentMetadata => m !== undefined),
    };

    const perDocOpts: SpecialistRunOptions<T> = {
      ...opts,
      state: docState,
      documentText: doc.content,
      progressLabel: `${opts.progressLabel} [doc ${di + 1}/${documents.length}]`,
      progressStepPrefix: `${opts.progressStepPrefix ?? opts.callerName}_doc${di}`,
    };

    const docResult = await runSpecialistOverDocument<T>(perDocOpts);
    perDocResults.push(docResult.result);
    totalChunks += docResult.chunks;
  }

  const merged = opts.merge(perDocResults);

  await opts.observability.emitProgress(
    ctx,
    ctx.conversationId,
    `${opts.progressLabel}: merged ${documents.length} documents`,
    {
      step: `${opts.progressStepPrefix ?? opts.callerName}_multi_doc_merge`,
      documentCount: documents.length,
      totalChunks,
      merged: true,
    },
  );

  return { result: merged, chunks: totalChunks };
}

// ─────────────────────────────────────────────────────────────────────────
// Contract-review mode helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * System prompt fragment for contract-review mode. Specialists include
 * their own domain preamble, then append this standard output schema.
 */
export const CLAUSE_ANNOTATION_SCHEMA = `
OUTPUT FORMAT (contract-review mode):
Return a JSON array of clause annotations. Each annotation references a clauseId from the provided clause map.

[
  {
    "clauseId": "s1-c1",
    "riskLevel": "critical|high|medium|low|acceptable",
    "category": "string (e.g. indemnification, IP assignment, non-compete, data-protection, termination)",
    "finding": "string (2-4 sentences: what you found)",
    "suggestedLanguage": "string or null (replacement clause text if you have a recommendation)",
    "reasoning": "string (1-2 sentences: why this matters)"
  }
]

Rules:
- Only annotate clauses within your domain expertise.
- If no clauses in your domain are concerning, return an empty array [].
- clauseId MUST reference an entry from the clause map provided.
- Return ONLY the JSON array. No markdown, no preamble, no postamble.`;

/**
 * Build the user message for contract-review mode, including the clause map.
 */
export function buildContractReviewUserMessage(
  state: LegalDepartmentState,
): string {
  const clauseMap = state.clauseMap;
  if (!clauseMap) return '';

  let msg = 'CLAUSE MAP (analyze these clauses):\n\n';
  for (const entry of clauseMap.entries) {
    msg += `[${entry.clauseId}] (${entry.entryType}, section ${entry.sectionPath})\n`;
    msg += `${entry.text}\n\n`;
  }

  if (Object.keys(clauseMap.definedTerms).length > 0) {
    msg += '\nDEFINED TERMS:\n';
    for (const [term, def] of Object.entries(clauseMap.definedTerms)) {
      msg += `- "${term}": ${def}\n`;
    }
  }

  return msg;
}

/**
 * Parse an LLM response as ClauseAnnotation[].
 *
 * Handles: raw JSON arrays, arrays wrapped in markdown fences, and
 * arrays nested inside an object with an "annotations" key.
 */
export function parseClauseAnnotations(
  responseText: string,
): ClauseAnnotation[] {
  const stripped = stripMarkdownFences(responseText).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Try to extract a JSON array from the response
    const arrayMatch = stripped.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];
    parsed = JSON.parse(arrayMatch[0]);
  }

  // Handle both direct arrays and { annotations: [...] } wrappers
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.annotations)
      ? (parsed as Record<string, unknown>).annotations
      : [];

  if (!Array.isArray(arr)) return [];

  const validRiskLevels = new Set([
    'critical',
    'high',
    'medium',
    'low',
    'acceptable',
  ]);

  return (arr as Record<string, unknown>[])
    .filter(
      (a) =>
        typeof a.clauseId === 'string' &&
        a.clauseId &&
        typeof a.finding === 'string',
    )
    .map(
      (a): ClauseAnnotation => ({
        clauseId: a.clauseId as string,
        riskLevel: validRiskLevels.has(a.riskLevel as string)
          ? (a.riskLevel as ClauseAnnotation['riskLevel'])
          : 'medium',
        category: typeof a.category === 'string' ? a.category : 'general',
        finding: a.finding as string,
        suggestedLanguage:
          typeof a.suggestedLanguage === 'string'
            ? a.suggestedLanguage
            : undefined,
        reasoning: typeof a.reasoning === 'string' ? a.reasoning : '',
      }),
    );
}

/**
 * Runs a specialist in contract-review mode. Issues a single LLM call
 * with the clause map and the specialist's domain prompt, returning
 * ClauseAnnotation[].
 */
export async function runContractReviewSpecialist(opts: {
  llmClient: LLMHttpClientService;
  observability: ObservabilityService;
  state: LegalDepartmentState;
  domainPrompt: string;
  callerName: string;
  progressLabel: string;
}): Promise<ClauseAnnotation[]> {
  const ctx = opts.state.executionContext;
  const systemMessage = `${opts.domainPrompt}\n${CLAUSE_ANNOTATION_SCHEMA}`;
  const userMessage = buildContractReviewUserMessage(opts.state);

  if (!userMessage) {
    return [];
  }

  const response = await callLLMMaybeWithReasoning(opts.llmClient, {
    context: ctx,
    systemMessage,
    userMessage,
    callerName: opts.callerName,
    temperature: 0.3,
    maxTokens: 4000,
  });

  const annotations = parseClauseAnnotations(response.text);

  await opts.observability.emitProgress(
    ctx,
    ctx.conversationId,
    `${opts.progressLabel}: ${annotations.length} clause annotations`,
    {
      step: `${opts.callerName.replace('legal-department:', '')}_contract_review_done`,
      annotationCount: annotations.length,
    },
  );

  return annotations;
}
