/**
 * Parse a JSON object out of an LLM response.
 *
 * Models fence JSON in ```json blocks or add a sentence before it often enough
 * that stripping those is normal handling, not leniency. What this does NOT do
 * is substitute a default when parsing fails: a dimension that returns
 * unreadable output must stop the run, because a risk score quietly computed
 * from nine dimensions while claiming ten is exactly the silent failure this
 * codebase forbids.
 */
export function parseJsonResponse<T>(raw: string, what: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? raw).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `${what}: response contained no JSON object. Received: ${truncate(raw)}`,
    );
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch (error) {
    throw new Error(
      `${what}: response was not valid JSON (${(error as Error).message}). ` +
        `Received: ${truncate(raw)}`,
    );
  }
}

function truncate(text: string, max = 300): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** A number the model was told to bound, checked rather than trusted. */
export function requireBoundedNumber(
  value: unknown,
  what: string,
  min: number,
  max: number,
): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw new Error(`${what} must be a number, received: ${String(value)}`);
  }
  if (num < min || num > max) {
    throw new Error(`${what} must be between ${min} and ${max}, received: ${num}`);
  }
  return num;
}
