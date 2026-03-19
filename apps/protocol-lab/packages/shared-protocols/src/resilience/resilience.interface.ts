export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export interface BulkheadOptions {
  maxConcurrent: number;
  maxQueue: number;
}

export interface IResilienceProvider {
  readonly providerId: string;

  withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
  withCircuitBreaker<T>(fn: () => Promise<T>, options?: Partial<CircuitBreakerOptions>): Promise<T>;
  withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T>;
  withBulkhead<T>(fn: () => Promise<T>, options?: Partial<BulkheadOptions>): Promise<T>;
}
