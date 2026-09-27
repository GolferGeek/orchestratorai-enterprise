/** A value in an event payload by dotted path ('new.id'); undefined if the path is absent. */
export function eventValue(payload: Record<string, unknown>, path: string): unknown {
  let value: unknown = payload;
  for (const key of path.split('.')) {
    value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  }
  return value;
}
