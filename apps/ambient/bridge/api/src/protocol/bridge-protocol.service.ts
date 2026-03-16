import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * BridgeProtocolService — Circuit breaker and retry abstraction for external agent calls.
 *
 * Currently provides a simplified circuit breaker interface. Will integrate with
 * apps/ambient/core/shared-protocols ProtocolFactory when available.
 *
 * Responsibilities:
 * - Circuit breaker for external agent calls
 * - Retry with exponential backoff (future)
 * - Protocol configuration management
 */

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure: number;
  resetTimeoutMs: number;
  failureThreshold: number;
}

@Injectable()
export class BridgeProtocolService implements OnModuleInit {
  private readonly logger = new Logger(BridgeProtocolService.name);

  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();

  onModuleInit(): void {
    this.logger.log('Bridge Protocol Service initialized');
  }

  /**
   * Check if an agent's circuit breaker is open (i.e. requests are blocked).
   *
   * Returns true when the circuit is OPEN and the request must not be sent.
   * Returns false when the circuit is CLOSED or HALF-OPEN (allow request through).
   */
  isCircuitOpen(agentId: string): boolean {
    const state = this.circuitBreakers.get(agentId);

    if (!state) {
      // No recorded state — circuit is closed, OK to send
      return false;
    }

    if (state.state === 'open') {
      const elapsed = Date.now() - state.lastFailure;

      if (elapsed > state.resetTimeoutMs) {
        // Enough time has passed — move to half-open and allow one test request
        state.state = 'half-open';
        this.logger.log(`Circuit breaker HALF-OPEN for agent ${agentId} — allowing test request`);
        return false;
      }

      // Still within the reset window — block the request
      return true;
    }

    return false;
  }

  /**
   * Record a successful request for the given agent.
   * Closes the circuit breaker and resets the failure count.
   */
  recordSuccess(agentId: string): void {
    const state = this.circuitBreakers.get(agentId);

    if (state) {
      if (state.state !== 'closed') {
        this.logger.log(`Circuit breaker CLOSED for agent ${agentId} after successful request`);
      }
      state.state = 'closed';
      state.failureCount = 0;
    }
  }

  /**
   * Record a failed request for the given agent.
   * Increments the failure counter and opens the circuit when the threshold is reached.
   */
  recordFailure(agentId: string): void {
    let state = this.circuitBreakers.get(agentId);

    if (!state) {
      state = {
        state: 'closed',
        failureCount: 0,
        lastFailure: 0,
        resetTimeoutMs: 30_000, // 30 seconds
        failureThreshold: 5,
      };
      this.circuitBreakers.set(agentId, state);
    }

    state.failureCount++;
    state.lastFailure = Date.now();

    if (state.failureCount >= state.failureThreshold) {
      state.state = 'open';
      this.logger.warn(
        `Circuit breaker OPEN for agent ${agentId} after ${state.failureCount} failures`,
      );
    }
  }

  /**
   * Return circuit breaker status for all tracked agents.
   * Used by health/status endpoints.
   */
  getCircuitBreakerStatus(): Record<string, { state: string; failureCount: number }> {
    const status: Record<string, { state: string; failureCount: number }> = {};

    for (const [agentId, state] of this.circuitBreakers) {
      status[agentId] = {
        state: state.state,
        failureCount: state.failureCount,
      };
    }

    return status;
  }
}
