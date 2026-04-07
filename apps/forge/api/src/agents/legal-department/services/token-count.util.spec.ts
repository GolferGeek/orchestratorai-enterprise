import {
  countTokens,
  getModelBudget,
  MAX_INPUT_TOKENS,
} from './token-count.util';

describe('token-count.util', () => {
  describe('countTokens', () => {
    it('returns 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('produces deterministic counts for known strings', () => {
      // These exact counts come from cl100k_base — pinning them ensures
      // the encoder isn't silently swapped in a future js-tiktoken bump.
      expect(countTokens('hello world')).toBe(2);
      expect(countTokens('The quick brown fox jumps over the lazy dog.')).toBe(
        10,
      );
    });

    it('counts whitespace and punctuation as part of tokens', () => {
      const a = countTokens('foo bar');
      const b = countTokens('foo  bar');
      // Different whitespace should produce different counts (cl100k_base
      // is whitespace-sensitive). We don't pin the exact numbers — just
      // that they differ — so we don't couple the test to encoder internals.
      expect(a).not.toBe(b);
    });

    it('counts a 100k-character string in well under 200ms', () => {
      const text = 'a '.repeat(50_000); // ~100k chars
      const start = Date.now();
      const tokens = countTokens(text);
      const elapsed = Date.now() - start;
      expect(tokens).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('getModelBudget', () => {
    it('returns OpenAI gpt-4o budget', () => {
      const b = getModelBudget('gpt-4o-2024-08-06');
      expect(b.contextWindow).toBe(128_000);
      expect(b.reservedOutput).toBe(4_000);
    });

    it('returns Anthropic claude budget', () => {
      const b = getModelBudget('claude-3-5-sonnet-20240620');
      expect(b.contextWindow).toBe(200_000);
    });

    it('falls back to a conservative default for unknown models', () => {
      const b = getModelBudget('totally-made-up-model');
      expect(b.contextWindow).toBe(32_000);
      expect(b.reservedOutput).toBe(4_000);
    });

    it('handles undefined model id', () => {
      const b = getModelBudget(undefined);
      expect(b.contextWindow).toBeGreaterThan(0);
    });
  });

  it('exposes a positive MAX_INPUT_TOKENS ceiling', () => {
    expect(MAX_INPUT_TOKENS).toBeGreaterThan(0);
  });
});
