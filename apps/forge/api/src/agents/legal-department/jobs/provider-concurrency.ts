/**
 * ProviderConcurrencyRegistry — per-provider semaphores enforced at the worker.
 *
 * Local LLMs (Ollama) are throughput-bound, not latency-bound: a Mac Studio
 * effectively serializes Ollama calls inside the daemon, so running multiple
 * Ollama-backed jobs concurrently buys nothing and risks per-call timeouts.
 * Cloud providers (Anthropic, OpenAI) fan out cleanly, so they can run many
 * jobs in parallel.
 *
 * Limits are read once at module init from env vars:
 *   OLLAMA_MAX_CONCURRENT     (default 1)
 *   ANTHROPIC_MAX_CONCURRENT  (default 10)
 *   OPENAI_MAX_CONCURRENT     (default 10)
 *
 * Unknown providers default to 1 (safe).
 *
 * See: docs/efforts/current/prd.md §4.5
 */
import { Injectable, Logger } from '@nestjs/common';

interface Slot {
  max: number;
  inUse: number;
  waiters: Array<() => void>;
}

@Injectable()
export class ProviderConcurrencyRegistry {
  private readonly logger = new Logger(ProviderConcurrencyRegistry.name);
  private readonly slots = new Map<string, Slot>();

  constructor() {
    this.configure('ollama', this.intFromEnv('OLLAMA_MAX_CONCURRENT', 1));
    this.configure(
      'anthropic',
      this.intFromEnv('ANTHROPIC_MAX_CONCURRENT', 10),
    );
    this.configure('openai', this.intFromEnv('OPENAI_MAX_CONCURRENT', 10));
  }

  private intFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private configure(provider: string, max: number): void {
    this.slots.set(provider, { max, inUse: 0, waiters: [] });
    this.logger.log(`Provider concurrency: ${provider} max=${max}`);
  }

  /**
   * Acquire a slot for the given provider. Returns a release function the
   * caller MUST call (in finally) when the work completes.
   */
  async acquire(provider: string): Promise<() => void> {
    const key = (provider || '').toLowerCase();
    let slot = this.slots.get(key);
    if (!slot) {
      // Unknown provider — default to 1, log once at first sighting.
      this.configure(key, 1);
      slot = this.slots.get(key)!;
    }

    if (slot.inUse < slot.max) {
      slot.inUse++;
      return () => this.release(key);
    }

    // Wait for an open slot.
    await new Promise<void>((resolve) => {
      slot.waiters.push(resolve);
    });
    slot.inUse++;
    return () => this.release(key);
  }

  private release(provider: string): void {
    const slot = this.slots.get(provider);
    if (!slot) return;
    slot.inUse = Math.max(0, slot.inUse - 1);
    const next = slot.waiters.shift();
    if (next) next();
  }

  /** Test/observability helper. */
  inUse(provider: string): number {
    return this.slots.get(provider.toLowerCase())?.inUse ?? 0;
  }

  /** Test/observability helper. */
  max(provider: string): number {
    return this.slots.get(provider.toLowerCase())?.max ?? 0;
  }
}
