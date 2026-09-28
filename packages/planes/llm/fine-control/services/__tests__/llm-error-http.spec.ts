import { LLMError, LLMErrorMapper, LLMErrorType } from '../llm-error-handling';
import { completedAnswer } from '../../../openrouter/openrouter.client';

describe('LLMErrorMapper.fromHttpError', () => {
  const mapped = (error: unknown) => LLMErrorMapper.fromHttpError(error, 'openrouter', 'm');
  const http = (status: number) => ({ message: `status ${status}`, response: { status } });

  it.each([
    [401, LLMErrorType.API_KEY_INVALID, false],
    [403, LLMErrorType.API_KEY_INVALID, false],
    [402, LLMErrorType.QUOTA_EXCEEDED, false],
    [429, LLMErrorType.RATE_LIMIT, true],
    [400, LLMErrorType.INVALID_REQUEST, false],
    [404, LLMErrorType.MODEL_NOT_FOUND, false],
    [408, LLMErrorType.GATEWAY_TIMEOUT, true],
    [504, LLMErrorType.GATEWAY_TIMEOUT, true],
    [500, LLMErrorType.SERVER_ERROR, true],
    [502, LLMErrorType.SERVER_ERROR, true],
  ])('maps HTTP %i to %s (retryable %s)', (status, type, retryable) => {
    expect(mapped(http(status))).toMatchObject({ type, retryable, provider: 'openrouter', model: 'm' });
  });

  it('reads a status set on the error itself', () => {
    expect(mapped({ message: 'x', status: 503 }).type).toBe(LLMErrorType.SERVER_ERROR);
  });

  it('keeps retry-after from a 429', () => {
    expect(mapped({ message: 'x', response: { status: 429, headers: { 'retry-after': '3' } } }).retryAfterMs).toBe(3000);
  });

  it.each([
    ['ECONNABORTED', LLMErrorType.GATEWAY_TIMEOUT],
    ['ETIMEDOUT', LLMErrorType.GATEWAY_TIMEOUT],
    ['ECONNRESET', LLMErrorType.NETWORK_ERROR],
    ['ECONNREFUSED', LLMErrorType.NETWORK_ERROR],
    ['ENOTFOUND', LLMErrorType.NETWORK_ERROR],
    ['EAI_AGAIN', LLMErrorType.NETWORK_ERROR],
  ])('maps network code %s to a retryable %s', (code, type) => {
    expect(mapped({ message: 'x', code })).toMatchObject({ type, retryable: true });
  });

  it('leaves anything else UNKNOWN and not retryable', () => {
    expect(mapped(new Error('odd'))).toMatchObject({ type: LLMErrorType.UNKNOWN, retryable: false });
  });
});

describe('LLMErrorMapper.fromGenericError', () => {
  it('returns an LLMError as it is', () => {
    const original = new LLMError('x', LLMErrorType.CONTENT_FILTER, 'openrouter');
    expect(LLMErrorMapper.fromGenericError(original, 'openai')).toBe(original);
  });

  it('classifies an error from a provider with no mapper of its own by HTTP status', () => {
    expect(LLMErrorMapper.fromGenericError({ message: 'x', response: { status: 429 } }, 'openrouter').type).toBe(LLMErrorType.RATE_LIMIT);
  });
});

describe('completedAnswer (OpenRouter)', () => {
  const refusal = (choice: Parameters<typeof completedAnswer>[0]): LLMError => {
    try {
      completedAnswer(choice, 'vendor/model', 512);
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError);
      return error as LLMError;
    }
    throw new Error('completedAnswer accepted the answer');
  };

  it('accepts an answer that stopped normally', () => {
    expect(() => completedAnswer({ finish_reason: 'stop' }, 'vendor/model', 512)).not.toThrow();
  });

  it('refuses an answer the provider broke off, as retryable', () => {
    expect(refusal({ finish_reason: 'error' })).toMatchObject({ type: LLMErrorType.SERVICE_UNAVAILABLE, retryable: true });
    expect(refusal({ finish_reason: 'stop', error: { message: 'upstream reset' } })).toMatchObject({ type: LLMErrorType.SERVICE_UNAVAILABLE, retryable: true });
  });

  it('refuses an answer cut off at max_tokens, not retryable', () => {
    const error = refusal({ finish_reason: 'length' });
    expect(error).toMatchObject({ type: LLMErrorType.OUTPUT_TOO_LONG, retryable: false });
    expect(error.message).toContain('512');
  });

  it('refuses a filtered or unexplained ending', () => {
    expect(refusal({ finish_reason: 'content_filter' }).type).toBe(LLMErrorType.CONTENT_FILTER);
    expect(refusal({ finish_reason: null }).type).toBe(LLMErrorType.RESPONSE_PARSING_ERROR);
    expect(refusal({}).type).toBe(LLMErrorType.RESPONSE_PARSING_ERROR);
  });
});
