import { ProviderConcurrencyRegistry } from './provider-concurrency';

describe('ProviderConcurrencyRegistry', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults Ollama to 1, Anthropic to 10', () => {
    delete process.env.OLLAMA_MAX_CONCURRENT;
    delete process.env.ANTHROPIC_MAX_CONCURRENT;
    const reg = new ProviderConcurrencyRegistry();
    expect(reg.max('ollama')).toBe(1);
    expect(reg.max('anthropic')).toBe(10);
  });

  it('respects env-var overrides', () => {
    process.env.OLLAMA_MAX_CONCURRENT = '3';
    const reg = new ProviderConcurrencyRegistry();
    expect(reg.max('ollama')).toBe(3);
  });

  it('serializes Ollama acquisitions when max=1', async () => {
    process.env.OLLAMA_MAX_CONCURRENT = '1';
    const reg = new ProviderConcurrencyRegistry();
    const order: string[] = [];

    const r1Promise = reg.acquire('ollama').then((release) => {
      order.push('a-acquired');
      return release;
    });
    const r2Promise = reg.acquire('ollama').then((release) => {
      order.push('b-acquired');
      return release;
    });

    const r1 = await r1Promise;
    expect(reg.inUse('ollama')).toBe(1);
    // r2 must still be pending
    expect(order).toEqual(['a-acquired']);

    r1();
    const r2 = await r2Promise;
    expect(order).toEqual(['a-acquired', 'b-acquired']);
    r2();
    expect(reg.inUse('ollama')).toBe(0);
  });

  it('allows parallel cloud acquisitions up to max', async () => {
    process.env.ANTHROPIC_MAX_CONCURRENT = '3';
    const reg = new ProviderConcurrencyRegistry();
    const releases = await Promise.all([
      reg.acquire('anthropic'),
      reg.acquire('anthropic'),
      reg.acquire('anthropic'),
    ]);
    expect(reg.inUse('anthropic')).toBe(3);
    releases.forEach((r) => r());
    expect(reg.inUse('anthropic')).toBe(0);
  });

  it('treats unknown providers conservatively (max=1)', async () => {
    const reg = new ProviderConcurrencyRegistry();
    const r = await reg.acquire('mystery');
    expect(reg.max('mystery')).toBe(1);
    expect(reg.inUse('mystery')).toBe(1);
    r();
  });
});
