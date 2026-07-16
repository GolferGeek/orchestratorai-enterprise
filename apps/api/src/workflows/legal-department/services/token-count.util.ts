/**
 * Deterministic token counting + per-model budgets used by the legal
 * department to enforce input-size limits and to chunk large documents
 * before fanning a specialist call out across multiple LLM calls.
 *
 * We use `js-tiktoken` (pure-JS, synchronous) with the `cl100k_base`
 * encoding. This is the encoding shared by all current OpenAI chat models
 * and produces a stable, model-agnostic token count that's accurate enough
 * for budget enforcement across providers (OpenAI, Anthropic, Vertex AI).
 * For non-OpenAI models the count is slightly conservative — fine for an
 * upper-bound limit.
 */
import { Tiktoken, getEncoding } from 'js-tiktoken';

let cachedEncoder: Tiktoken | undefined;

function getEncoder(): Tiktoken {
  if (!cachedEncoder) {
    cachedEncoder = getEncoding('cl100k_base');
  }
  return cachedEncoder;
}

/**
 * Count tokens for a string using the cl100k_base encoding.
 *
 * The `model` parameter is currently informational — js-tiktoken's
 * `getEncoding` is fast and stable, and using a single encoding lets us
 * keep counts deterministic across providers. Pass it through anyway so
 * future per-family encodings can be wired in without changing call sites.
 */
export function countTokens(text: string, _model?: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}

export interface ModelBudget {
  /** Total context window in tokens (input + output). */
  contextWindow: number;
  /** Tokens we reserve for the model's output (max generation). */
  reservedOutput: number;
}

/**
 * Conservative per-model budgets. Numbers are deliberately a little under
 * the published limits so we never push a request right to the edge.
 *
 * The lookup is prefix-based on the lowercased model id so families
 * (`gpt-4o-2024-…`, `claude-3-5-sonnet-…`) hit the right budget without
 * an exhaustive enum.
 */
const MODEL_BUDGETS: Array<{ prefix: string; budget: ModelBudget }> = [
  // OpenAI
  {
    prefix: 'gpt-4o-mini',
    budget: { contextWindow: 128_000, reservedOutput: 4_000 },
  },
  {
    prefix: 'gpt-4o',
    budget: { contextWindow: 128_000, reservedOutput: 4_000 },
  },
  {
    prefix: 'gpt-4-turbo',
    budget: { contextWindow: 128_000, reservedOutput: 4_000 },
  },
  {
    prefix: 'gpt-4.1',
    budget: { contextWindow: 1_000_000, reservedOutput: 8_000 },
  },
  { prefix: 'gpt-4', budget: { contextWindow: 8_000, reservedOutput: 1_500 } },
  {
    prefix: 'gpt-3.5',
    budget: { contextWindow: 16_000, reservedOutput: 1_500 },
  },
  { prefix: 'o1', budget: { contextWindow: 128_000, reservedOutput: 8_000 } },
  { prefix: 'o3', budget: { contextWindow: 200_000, reservedOutput: 8_000 } },
  // Anthropic
  {
    prefix: 'claude-opus-4',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'claude-sonnet-4',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'claude-haiku-4',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'claude-3-5',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'claude-3',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'claude',
    budget: { contextWindow: 200_000, reservedOutput: 8_000 },
  },
  // Google
  {
    prefix: 'gemini-2',
    budget: { contextWindow: 1_000_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'gemini-1.5',
    budget: { contextWindow: 1_000_000, reservedOutput: 8_000 },
  },
  {
    prefix: 'gemini',
    budget: { contextWindow: 32_000, reservedOutput: 4_000 },
  },
];

/** Conservative fallback when we can't recognize the model id. */
const DEFAULT_BUDGET: ModelBudget = {
  contextWindow: 32_000,
  reservedOutput: 4_000,
};

/**
 * Returns the (contextWindow, reservedOutput) budget for a model id.
 * Unrecognized models fall through to a conservative 32k/4k default
 * rather than throwing — chunking degrades gracefully.
 */
export function getModelBudget(model: string | undefined): ModelBudget {
  if (!model) return DEFAULT_BUDGET;
  const id = model.toLowerCase();
  for (const entry of MODEL_BUDGETS) {
    if (id.startsWith(entry.prefix)) return entry.budget;
  }
  return DEFAULT_BUDGET;
}

/**
 * The hard ceiling we apply at the controller's job-enqueue boundary.
 * Anything above this is rejected with HTTP 413 before it ever reaches
 * a worker — we want oversized payloads to fail fast at the edge, not
 * deep inside an LLM call.
 *
 * 250k tokens ≈ ~1MB of plain text and comfortably exceeds a 100-page
 * contract while still leaving room for chunking + multi-document jobs
 * within the largest model windows we currently use.
 */
export const MAX_INPUT_TOKENS = 250_000;
