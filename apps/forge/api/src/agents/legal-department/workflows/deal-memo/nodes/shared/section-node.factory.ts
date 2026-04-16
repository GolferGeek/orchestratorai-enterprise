/**
 * Shared factory for deal-memo section-draft nodes.
 *
 * All five section-draft nodes (reps-warranties, indemnification,
 * disclosure-schedules, conditions-precedent, covenants) share the same
 * skeleton:
 *
 *   1. Emit a progress event.
 *   2. Build the citation registry from hydrated parent DD state.
 *   3. Build the section-specific prompt (system + user).
 *   4. Call the LLM via `callLLMMaybeWithReasoning` so reasoning tokens
 *      are captured when the provider supports it.
 *   5. Strip code fences, parse the JSON result into `{ draft, citations }`.
 *   6. Validate every citation's ID against the registry — throw on
 *      fabrication.
 *   7. Return a partial state update of the form
 *      `{ sectionDrafts: { [sectionId]: { draft, citations } } }`.
 *
 * Any failure (parse, validation) throws a descriptive error; the graph's
 * `handle_error` branch flips status to `failed` and propagates the message
 * to the job row. NO silent fallback. NO empty-draft shortcut.
 */
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../../nodes/specialist-utils';
import type { DealMemoState } from '../../deal-memo.state';
import type { SectionId, SectionDraft } from '../../deal-memo.types';
import {
  buildCitationRegistry,
  normalizeLLMCitation,
  validateCitations,
} from './validate-citations';
import {
  buildSectionPromptMessages,
  SECTION_CALLER_NAMES,
} from './section-prompts';

export interface SectionNodeOptions {
  /** LLM temperature. Drafting legal prose wants low variance. */
  temperature?: number;
  /** Max tokens for the section draft (not including reasoning). */
  maxTokens?: number;
  /** Progress percent to emit on start (0-100). */
  progressOnStart?: number;
}

/**
 * Create a LangGraph node function for a given section.
 *
 * The returned node is self-contained: pass the compiled graph-level
 * services once at factory time and the node receives state at runtime.
 */
export function createSectionDraftNode(
  sectionId: SectionId,
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  options: SectionNodeOptions = {},
) {
  // Temperature 0 for local Ollama models — they produce notably more
  // reliable structured output at 0 vs 0.2. Legal prose doesn't need
  // variance; deterministic output is the goal.
  const temperature = options.temperature ?? 0.0;
  // Section drafts are verbose legal prose — numbered clauses with embedded
  // citation markers plus the citations array. 12k tokens keeps us well under
  // Claude Sonnet 4.5's 64k output cap while leaving headroom for long
  // indemnification/reps sections. Override per-section via options if a
  // particular section consistently blows through.
  const maxTokens = options.maxTokens ?? 12000;
  const progressOnStart = options.progressOnStart ?? 20;
  const callerName = SECTION_CALLER_NAMES[sectionId];

  // Per-section LLM retry budget. Local Ollama models occasionally emit
  // malformed JSON or fabricate an out-of-range id; we retry up to
  // MAX_ATTEMPTS with increasingly explicit clarification in the user
  // message. Every attempt still hits the same strict validator — this
  // is resilience against transient stochastic failures, NOT a fallback
  // that accepts bad output. If all attempts fail we throw the final
  // error so the graph handler flips the job to `failed` with the
  // underlying message (same behavior as the pre-retry version).
  const MAX_ATTEMPTS = 3;
  const firstLine = (s: string): string => s.split('\n')[0] ?? s;

  return async function sectionDraftNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Drafting deal-memo section: ${sectionId}`,
      {
        step: `deal_memo_section_${sectionId.replace(/-/g, '_')}_start`,
        progress: progressOnStart,
        sectionId,
      },
    );

    // Build registry once per node invocation — hydrated state is frozen by
    // memo_intake, so this is deterministic.
    const registry = buildCitationRegistry({
      documentIndex: state.documentIndex,
      runningFindings: state.runningFindings,
      riskMatrix: state.riskMatrix,
      dealBreakerFlags: state.dealBreakerFlags,
    });

    const { systemMessage, userMessage } = buildSectionPromptMessages(
      sectionId,
      state,
      registry,
    );

    let parsed: SectionDraft | undefined;
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // On retries, prepend a clarification summarizing the previous
      // failure so the LLM can self-correct. The clarification is
      // diagnostic, not permissive — we still run the same strict
      // validator on the output.
      const attemptUserMessage =
        attempt === 1 || !lastError
          ? userMessage
          : [
              `Your previous attempt failed validation. Error: ${firstLine(lastError.message).slice(0, 400)}.`,
              `Re-read the HARD RULES. Use ONLY ids that appear verbatim in the VALID lists. Return ONE JSON object with {draft, citations:[{id, excerpt}, ...]}. No prose outside the JSON.`,
              '',
              userMessage,
            ].join('\n');

      try {
        const response = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage,
          userMessage: attemptUserMessage,
          temperature,
          maxTokens,
          callerName,
        });
        const cleaned = stripMarkdownFences(response.text);
        const raw = JSON.parse(cleaned) as unknown;
        if (!raw || typeof raw !== 'object') {
          throw new Error('parsed JSON is not an object');
        }
        const obj = raw as Record<string, unknown>;
        if (typeof obj.draft !== 'string' || obj.draft.trim().length === 0) {
          throw new Error('response is missing a non-empty "draft" string');
        }
        if (!Array.isArray(obj.citations)) {
          throw new Error('response is missing a "citations" array');
        }
        // Normalize each raw LLM citation into the canonical CitationRef
        // shape. The LLM emits the simplified `{id, excerpt}` form; the
        // normalizer resolves `id` against the registry and assigns it to
        // the correct typed field. Legacy `{findingId, ...}` citations
        // pass through unchanged.
        const candidate: SectionDraft = {
          draft: obj.draft,
          citations: (obj.citations as unknown[]).map((c) =>
            normalizeLLMCitation(c, registry),
          ),
        };
        // Strict citation validation — throws CitationValidationError on
        // any fabricated / unresolved ID. We catch here so the retry loop
        // can re-try; if we exhaust attempts we re-throw the last error.
        validateCitations(sectionId, candidate.citations, registry);
        parsed = candidate;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_ATTEMPTS) {
          await observability.emitProgress(
            ctx,
            ctx.conversationId,
            `Section "${sectionId}" attempt ${attempt}/${MAX_ATTEMPTS} failed: ${firstLine(lastError.message).slice(0, 180)} — retrying`,
            {
              step: `deal_memo_section_${sectionId.replace(/-/g, '_')}_retry`,
              attempt,
              sectionId,
            },
          );
          continue;
        }
      }
    }
    if (!parsed) {
      // All attempts exhausted — propagate the final error so the graph's
      // handle_error branch flips status to failed. Same fail-loud
      // behavior as the pre-retry version; we just tried harder.
      const msg = lastError?.message ?? 'unknown';
      if (msg.startsWith('Citation validation failed') && lastError) {
        // Preserve the CitationValidationError shape for tests / callers.
        throw lastError;
      }
      throw new Error(
        `Section "${sectionId}" LLM response was not parseable JSON matching ` +
          `{draft, citations} after ${MAX_ATTEMPTS} attempts: ${msg}`,
      );
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Drafted deal-memo section: ${sectionId} (${parsed.citations.length} citations)`,
      {
        step: `deal_memo_section_${sectionId.replace(/-/g, '_')}_complete`,
        progress: progressOnStart + 10,
        sectionId,
        citationCount: parsed.citations.length,
        draftLength: parsed.draft.length,
      },
    );

    return {
      sectionDrafts: { [sectionId]: parsed } as Record<SectionId, SectionDraft>,
    };
  };
}
