/**
 * Client for the suite's Jev MCP server (orchestratorai-jev, Streamable HTTP):
 * typed decisions (noul / choice / score) and rubric verdicts
 * (pass / review / block) instead of prose. Ported from orchestratorai-local.
 *
 * The server is stateless: every call is one JSON-RPC `tools/call` POST. It
 * answers as plain JSON or as one SSE `data:` frame with the same envelope;
 * the tool result is a text block holding JSON.
 */
export interface JevMcpConfig {
  url: string;
  token: string;
}

export class JevMcpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'JevMcpError';
  }
}

export interface JevAnswer {
  type: 'noul' | 'choice' | 'score';
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  certainty?: number;
  probabilities?: Record<string, number>;
  agreement?: number;
}

export interface JevRubricResult {
  rubric: string;
  version: number;
  decision: 'pass' | 'review' | 'block';
  reason?: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
  /** The back that answered, e.g. `readout/corroborate-poe` (the local ensemble). */
  model: string;
}

export class JevMcpClient {
  constructor(private readonly config: JevMcpConfig) {}

  /** Run a rubric on its declared inputs. */
  async check(rubric: string, inputs: Record<string, unknown>): Promise<JevRubricResult> {
    const result = await this.call<Partial<JevRubricResult>>('jev_check', { rubric, inputs });
    if (
      !['pass', 'review', 'block'].includes(result.decision as string) ||
      typeof result.version !== 'number' ||
      typeof result.model !== 'string' ||
      typeof result.usage?.input_tokens !== 'number' ||
      typeof result.answers !== 'object'
    ) {
      throw new JevMcpError(`Jev returned an unreadable verdict for ${rubric}: ${JSON.stringify(result).slice(0, 200)}`);
    }
    return result as JevRubricResult;
  }

  /** One JSON-RPC tools/call; tool errors surface as JevMcpError with the server's text. */
  async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (err) {
      throw new JevMcpError(`Jev MCP unreachable at ${this.config.url}: ${(err as Error).message}`);
    }
    const body = await response.text();
    if (!response.ok) throw new JevMcpError(`Jev MCP ${response.status}: ${body.slice(0, 200)}`, response.status);
    return JevMcpClient.parse<T>(body);
  }

  static parse<T>(body: string): T {
    const payload = body.startsWith('{')
      ? body
      : body
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim();
    if (!payload) throw new JevMcpError(`Jev MCP: unrecognised response: ${body.slice(0, 120)}`);
    const envelope = JSON.parse(payload) as {
      error?: { message?: string };
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    if (envelope.error) throw new JevMcpError(envelope.error.message ?? payload);
    const text = envelope.result?.content?.[0]?.text;
    if (text === undefined) throw new JevMcpError('Jev MCP: no content in response');
    if (envelope.result?.isError) throw new JevMcpError(text);
    return JSON.parse(text) as T;
  }
}
