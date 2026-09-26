/**
 * Caps how many runs use one LLM provider at a time, so a burst of queued
 * runs cannot swamp a local model or a rate-limited API. Limits come from
 * configuration; a provider without a configured limit is refused rather
 * than given a guessed one.
 */
export class ProviderConcurrencyRegistry {
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(private readonly limits: Readonly<Record<string, number>>) {
    for (const [provider, limit] of Object.entries(limits)) {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`Concurrency limit for "${provider}" must be a positive integer`);
      }
    }
  }

  /** Resolves when a slot is free; the returned function releases it. */
  async acquire(provider: string): Promise<() => void> {
    const key = provider.toLowerCase();
    const limit = this.limits[key];
    if (limit === undefined) {
      throw new Error(`No concurrency limit is configured for provider "${provider}"`);
    }
    while ((this.active.get(key) ?? 0) >= limit) {
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(key) ?? [];
        queue.push(resolve);
        this.waiters.set(key, queue);
      });
    }
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.set(key, (this.active.get(key) ?? 1) - 1);
      this.waiters.get(key)?.shift()?.();
    };
  }

  inUse(provider: string): number {
    return this.active.get(provider.toLowerCase()) ?? 0;
  }
}

/** Parse `{"ollama":2,"anthropic":8}` from configuration. */
export function parseProviderLimits(raw: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('WORKFLOW_PROVIDER_CONCURRENCY must be a JSON object of provider limits');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('WORKFLOW_PROVIDER_CONCURRENCY must be a JSON object of provider limits');
  }
  const limits: Record<string, number> = {};
  for (const [provider, limit] of Object.entries(parsed)) {
    if (typeof limit !== 'number') {
      throw new Error(`WORKFLOW_PROVIDER_CONCURRENCY.${provider} must be a number`);
    }
    limits[provider.toLowerCase()] = limit;
  }
  return limits;
}
