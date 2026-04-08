/**
 * callLLMMaybeWithReasoning — shared opt-in helper for reasoning capture.
 *
 * USAGE
 * -----
 * Any forge-api workflow that wants to capture reasoning tokens (when the
 * active provider supports it) replaces:
 *
 *   const response = await llmClient.callLLM(params);
 *
 * with:
 *
 *   const response = await callLLMMaybeWithReasoning(llmClient, params);
 *
 * The helper does a `typeof` check at runtime:
 *  - If `llmClient.callLLMWithReasoning` exists (Ollama in Phase 4, all
 *    providers in Phase 4.5+), it routes there and the returned
 *    `LLMCallResponse` will have `thinkingContent` populated when the model
 *    produced thinking tokens.
 *  - If the method doesn't exist (any non-Ollama provider before Phase 4.5),
 *    it falls through to the standard buffered `callLLM` path and
 *    `thinkingContent` is `undefined`. Zero behavior change for every existing
 *    caller.
 *
 * PHASE 4 SCOPE
 * -------------
 * Only `OllamaLLMService` implements `callLLMWithReasoning` in Phase 4.
 * Phase 4.5 (committed in docs/efforts/current/intention.md) adds the
 * remaining providers before Phase 5 Hardening. Specialist code that calls
 * this helper does not need to change in Phase 4.5 — the fall-through path
 * becomes a real implementation per-provider, transparently.
 */

import type {
  LLMHttpClientService,
  LLMCallRequest,
  LLMCallResponse,
} from './llm-http-client.service';

/**
 * Route an LLM call through `callLLMWithReasoning` when the client supports
 * it, falling back to the standard `callLLM` otherwise.
 *
 * This is the single place that does the `typeof` guard so specialist nodes,
 * the synthesis node, and the report-generation node all get the same routing
 * logic without duplicating it.
 */
export async function callLLMMaybeWithReasoning(
  llmClient: LLMHttpClientService,
  params: LLMCallRequest,
): Promise<LLMCallResponse> {
  if (typeof llmClient.callLLMWithReasoning === 'function') {
    return llmClient.callLLMWithReasoning(params);
  }
  return llmClient.callLLM(params);
}
