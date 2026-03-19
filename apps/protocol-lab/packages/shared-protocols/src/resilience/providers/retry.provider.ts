import { IResilienceProvider, RetryOptions, CircuitBreakerOptions, BulkheadOptions } from '../resilience.interface';

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  jitter: true,
};

export class RetryResilienceProvider implements IResilienceProvider {
  readonly providerId = 'retry';

  async withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T> {
    const opts = { ...DEFAULT_RETRY, ...options };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === opts.maxRetries) break;

        let delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        if (opts.jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  async withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    // Phase 1: pass-through, circuit breaker implemented in Phase 3
    return fn();
  }

  async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  async withBulkhead<T>(fn: () => Promise<T>): Promise<T> {
    // Phase 1: pass-through, bulkhead implemented in Phase 3
    return fn();
  }
}
