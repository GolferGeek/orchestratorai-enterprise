import type { JsonValue, TraceRef } from '@orchestrator-ai/transport-types';

/** Limits on what a trace keeps of an input or output (ported from local). */
export const TRACE_LIMITS = {
  maxStringLength: 12_000,
  maxArrayItems: 50,
  maxObjectKeys: 80,
  maxDepth: 6,
} as const;

/**
 * A bounded, JSON-safe copy of a value for the trace. Long strings, arrays
 * and objects are cut with a marker, deep values are replaced, and
 * `truncated` records whether anything was lost.
 */
export function traceRef(value: unknown): TraceRef {
  const state = { truncated: false, seen: new WeakSet<object>() };
  return { value: copy(value, 0, state), truncated: state.truncated };
}

function copy(
  value: unknown,
  depth: number,
  state: { truncated: boolean; seen: WeakSet<object> },
): JsonValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') {
    if (value.length <= TRACE_LIMITS.maxStringLength) return value;
    state.truncated = true;
    return `${value.slice(0, TRACE_LIMITS.maxStringLength)}... [truncated ${value.length - TRACE_LIMITS.maxStringLength} chars]`;
  }
  if (value === undefined) return '[undefined]';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return '[function]';
  if (value instanceof Error) {
    return { name: value.name, message: copy(value.message, depth + 1, state) };
  }
  if (depth >= TRACE_LIMITS.maxDepth) {
    state.truncated = true;
    return '[max depth reached]';
  }
  if (state.seen.has(value)) return '[circular]';
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > TRACE_LIMITS.maxArrayItems) state.truncated = true;
      return value.slice(0, TRACE_LIMITS.maxArrayItems).map((item) => copy(item, depth + 1, state));
    }
    const entries = Object.entries(value);
    if (entries.length > TRACE_LIMITS.maxObjectKeys) state.truncated = true;
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of entries.slice(0, TRACE_LIMITS.maxObjectKeys)) {
      out[key] = copy(item, depth + 1, state);
    }
    return out;
  } finally {
    state.seen.delete(value);
  }
}
