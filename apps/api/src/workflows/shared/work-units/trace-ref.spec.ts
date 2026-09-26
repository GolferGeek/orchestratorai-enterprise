import { traceRef, TRACE_LIMITS } from './trace-ref';

describe('traceRef', () => {
  it('keeps small JSON values whole', () => {
    expect(traceRef({ a: [1, 'x', null, true] })).toEqual({ truncated: false, value: { a: [1, 'x', null, true] } });
  });

  it('cuts long strings, arrays and objects, and says so', () => {
    const long = traceRef('x'.repeat(TRACE_LIMITS.maxStringLength + 5));
    expect(long.truncated).toBe(true);
    expect(String(long.value)).toMatch(/\[truncated 5 chars\]$/);
    const items = traceRef(Array.from({ length: 60 }, (_, i) => i));
    expect((items.value as number[]).length).toBe(TRACE_LIMITS.maxArrayItems);
    const keys = traceRef(Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`k${i}`, i])));
    expect(Object.keys(keys.value as object)).toHaveLength(TRACE_LIMITS.maxObjectKeys);
    expect(keys.truncated).toBe(true);
  });

  it('stops at the depth limit and survives cycles and non-JSON values', () => {
    const cyclic: Record<string, unknown> = { n: Number.NaN, f: () => 1, u: undefined };
    cyclic.self = cyclic;
    expect(traceRef(cyclic).value).toEqual({ n: 'NaN', f: '[function]', u: '[undefined]', self: '[circular]' });
    let deep: unknown = 'bottom';
    for (let i = 0; i < 10; i++) deep = { deep };
    expect(JSON.stringify(traceRef(deep).value)).toContain('[max depth reached]');
  });
});
