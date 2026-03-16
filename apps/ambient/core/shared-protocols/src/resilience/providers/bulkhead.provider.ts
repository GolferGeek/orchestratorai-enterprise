import { IResilienceProvider, RetryOptions, CircuitBreakerOptions, BulkheadOptions } from '../resilience.interface';

const DEFAULT_BULKHEAD: BulkheadOptions = {
  maxConcurrent: 10,
  maxQueue: 50,
};

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 3000,
  jitter: true,
};

export class BulkheadResilienceProvider implements IResilienceProvider {
  readonly providerId = 'bulkhead';

  private active = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  async withBulkhead<T>(fn: () => Promise<T>, options?: Partial<BulkheadOptions>): Promise<T> {
    const opts = { ...DEFAULT_BULKHEAD, ...options };

    if (this.active < opts.maxConcurrent) {
      this.active++;
      try {
        return await fn();
      } finally {
        this.active--;
        this.drainQueue();
      }
    }

    if (this.queue.length >= opts.maxQueue) {
      throw new Error(`Bulkhead queue is full (${opts.maxQueue} pending) — request rejected`);
    }

    await new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.drainQueue();
    }
  }

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

  async withCircuitBreaker<T>(fn: () => Promise<T>, _options?: Partial<CircuitBreakerOptions>): Promise<T> {
    return fn();
  }

  async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private drainQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }
}
