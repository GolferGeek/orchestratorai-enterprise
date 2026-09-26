import {
  ProviderConcurrencyRegistry,
  parseProviderLimits,
} from './provider-concurrency.registry';

describe('ProviderConcurrencyRegistry', () => {
  it('holds a caller until a slot frees, then admits it', async () => {
    const registry = new ProviderConcurrencyRegistry({ ollama: 1 });
    const releaseFirst = await registry.acquire('ollama');

    let secondAdmitted = false;
    const second = registry.acquire('Ollama').then((release) => {
      secondAdmitted = true;
      return release;
    });
    await Promise.resolve();
    expect(secondAdmitted).toBe(false);
    expect(registry.inUse('ollama')).toBe(1);

    releaseFirst();
    const releaseSecond = await second;
    expect(secondAdmitted).toBe(true);
    releaseSecond();
    expect(registry.inUse('ollama')).toBe(0);
  });

  it('ignores a second release of the same slot', async () => {
    const registry = new ProviderConcurrencyRegistry({ anthropic: 2 });
    const release = await registry.acquire('anthropic');
    await registry.acquire('anthropic');
    release();
    release();
    expect(registry.inUse('anthropic')).toBe(1);
  });

  it('refuses a provider with no configured limit', async () => {
    const registry = new ProviderConcurrencyRegistry({ ollama: 1 });
    await expect(registry.acquire('openai')).rejects.toThrow(
      'No concurrency limit is configured for provider "openai"',
    );
  });

  it('rejects a non-positive limit', () => {
    expect(() => new ProviderConcurrencyRegistry({ ollama: 0 })).toThrow('positive integer');
  });
});

describe('parseProviderLimits', () => {
  it('lowercases provider names', () => {
    expect(parseProviderLimits('{"Ollama":2,"anthropic":8}')).toEqual({ ollama: 2, anthropic: 8 });
  });

  it.each(['not json', '[1,2]', '{"ollama":"2"}'])('rejects %s', (raw) => {
    expect(() => parseProviderLimits(raw)).toThrow('WORKFLOW_PROVIDER_CONCURRENCY');
  });
});
