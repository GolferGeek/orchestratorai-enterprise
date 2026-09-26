/**
 * Read an agent's answer. Reasoning blocks are dropped and one fence around
 * the whole answer is removed; the rest must be the answer itself. JSON is
 * parsed as-is: no repair, no brace hunting, no unwrapping. Returns the
 * value, or the reason it could not be read.
 */
export function readAgentAnswer(
  format: 'json' | 'text',
  raw: string,
): { value: unknown } | { issue: string } {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(withoutThinking);
  const body = (fenced ? fenced[1]! : withoutThinking).trim();
  if (format === 'text') {
    return body === '' ? { issue: 'the answer is empty' } : { value: body };
  }
  try {
    return { value: JSON.parse(body) as unknown };
  } catch (error) {
    return { issue: `the answer is not JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}
