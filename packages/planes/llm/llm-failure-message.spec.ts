import { FAILURE_REASON_LIMIT, llmFailureMessage } from './llm-failure-message';

describe('llmFailureMessage', () => {
  it('says what failed and why on one line', () => {
    expect(
      llmFailureMessage('LLM call failed', new Error('Failed to load model qwen3:8b:\n  Model qwen3:8b not found')),
    ).toBe('LLM call failed: Failed to load model qwen3:8b: Model qwen3:8b not found');
  });

  it('shortens a long reason', () => {
    const message = llmFailureMessage('LLM call failed', new Error('x'.repeat(500)));
    expect(message.length).toBe('LLM call failed: '.length + FAILURE_REASON_LIMIT);
    expect(message.endsWith('…')).toBe(true);
  });

  it('keeps the label alone when there is no reason', () => {
    expect(llmFailureMessage('LLM call failed', '')).toBe('LLM call failed');
  });
});
