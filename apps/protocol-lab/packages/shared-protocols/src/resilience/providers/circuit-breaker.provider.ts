import { IResilienceProvider, RetryOptions, CircuitBreakerOptions, BulkheadOptions } from '../resilience.interface';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitInfo {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
  halfOpenSuccesses: number;
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
};

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 3000,
  jitter: true,
};

const DEFAULT_BULKHEAD: BulkheadOptions = {
  maxConcurrent: 10,
  maxQueue: 50,
};

export class CircuitBreakerResilienceProvider implements IResilienceProvider {
  readonly providerId = 'circuit-breaker';

  private circuits = new Map<string, CircuitInfo>();
  private bulkheadActive = 0;
  private bulkheadQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  private getCircuit(name: string): CircuitInfo {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenAttempts: 0,
        halfOpenSuccesses: 0,
      };
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  async withCircuitBreaker<T>(
    fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
    circuitName = 'default',
  ): Promise<T> {
    const opts = { ...DEFAULT_CIRCUIT_BREAKER, ...options };
    const circuit = this.getCircuit(circuitName);

    if (circuit.state === CircuitState.OPEN) {
      const elapsed = Date.now() - circuit.lastFailureTime;
      if (elapsed >= opts.resetTimeoutMs) {
        circuit.state = CircuitState.HALF_OPEN;
        circuit.halfOpenAttempts = 0;
        circuit.halfOpenSuccesses = 0;
      } else {
        throw new Error('Circuit breaker is OPEN — requests are being rejected');
      }
    }

    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.halfOpenAttempts >= opts.halfOpenMaxAttempts) {
        throw new Error('Circuit breaker is OPEN — requests are being rejected');
      }
      circuit.halfOpenAttempts++;

      try {
        const result = await fn();
        circuit.halfOpenSuccesses++;
        if (circuit.halfOpenSuccesses >= opts.halfOpenMaxAttempts) {
          circuit.state = CircuitState.CLOSED;
          circuit.failureCount = 0;
        }
        return result;
      } catch (error) {
        circuit.state = CircuitState.OPEN;
        circuit.lastFailureTime = Date.now();
        throw error;
      }
    }

    // CLOSED state
    try {
      const result = await fn();
      circuit.failureCount = 0;
      return result;
    } catch (error) {
      circuit.failureCount++;
      if (circuit.failureCount >= opts.failureThreshold) {
        circuit.state = CircuitState.OPEN;
        circuit.lastFailureTime = Date.now();
      }
      throw error;
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

  async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  async withBulkhead<T>(fn: () => Promise<T>, options?: Partial<BulkheadOptions>): Promise<T> {
    const opts = { ...DEFAULT_BULKHEAD, ...options };

    if (this.bulkheadActive < opts.maxConcurrent) {
      this.bulkheadActive++;
      try {
        return await fn();
      } finally {
        this.bulkheadActive--;
        this.drainQueue();
      }
    }

    if (this.bulkheadQueue.length >= opts.maxQueue) {
      throw new Error(`Bulkhead queue is full (${opts.maxQueue} pending) — request rejected`);
    }

    await new Promise<void>((resolve, reject) => {
      this.bulkheadQueue.push({ resolve, reject });
    });

    this.bulkheadActive++;
    try {
      return await fn();
    } finally {
      this.bulkheadActive--;
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    if (this.bulkheadQueue.length > 0) {
      const next = this.bulkheadQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }
}
