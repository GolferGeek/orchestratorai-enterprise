import type { DecisionState, Question, SystemOneRequest, SystemOneResponse } from './types';

export interface DecisionClientOptions {
  /** The /v1/systemone endpoint's origin, e.g. http://gg-macstudio:11434 (Ollama). */
  baseUrl: string;
  /** clef or clef-flash on Ollama. */
  model: string;
  /** Sent as a Bearer token when set (a hosted endpoint); Ollama ignores it. */
  apiKey: string;
  /** A cold Clef load takes tens of seconds. */
  timeoutMs: number;
  /** Injected for tests; defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export class DecisionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

export interface DecisionModel {
  name: string;
  parameterSize?: string;
}

export const DEFAULT_DECISION_MODEL = 'clef';
export const DEFAULT_DECISION_TIMEOUT_MS = 120_000;

/** Ollama wants raw base64; callers carry data:image/... URLs. */
export function toRawBase64(image: string): string {
  return image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image;
}

/**
 * Client for a /v1/systemone endpoint (Ollama today, hosted Jev later: the
 * base URL, key and model are the whole difference). fetch only.
 */
export class DecisionClient {
  readonly baseUrl: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DecisionClientOptions) {
    if (!options.baseUrl) throw new DecisionError('DECISION_BASE_URL is not set: point it at Ollama, e.g. http://gg-macstudio:11434');
    if (!options.model) throw new DecisionError('DECISION_MODEL is empty');
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /**
   * Ask any mix of questions about one state in a single request. Every
   * question must come back answered with its own type: a missing answer
   * would let routing fall through to a default it never earned.
   */
  async ask(state: DecisionState, questions: Record<string, Question>, images: string[] = []): Promise<SystemOneResponse> {
    const body: SystemOneRequest = { state, model: this.model, questions, ...(images.length ? { images: images.map(toRawBase64) } : {}) };
    const res = (await this.request('/v1/systemone', { method: 'POST', body: JSON.stringify(body) })) as Partial<SystemOneResponse>;
    if (
      typeof res !== 'object' ||
      typeof res.model !== 'string' ||
      typeof res.usage?.input_tokens !== 'number' ||
      typeof res.usage.output_tokens !== 'number' ||
      typeof res.answers !== 'object'
    ) {
      throw new DecisionError(`decision model returned an unreadable response: ${JSON.stringify(res).slice(0, 200)}`);
    }
    for (const [id, question] of Object.entries(questions)) {
      const answer = res.answers[id];
      if (!answer || answer.type !== question.type) {
        throw new DecisionError(`decision model returned no ${question.type} answer for "${id}": ${JSON.stringify(answer ?? null).slice(0, 200)}`);
      }
    }
    return res as SystemOneResponse;
  }

  /** The decision models the endpoint has pulled (Ollama marks them with the `decision` capability). */
  async models(): Promise<DecisionModel[]> {
    const res = (await this.request('/api/tags', { method: 'GET' }, 5_000)) as {
      models?: Array<{ name: string; capabilities?: string[]; details?: { parameter_size?: string } }>;
    };
    if (!Array.isArray(res.models)) throw new DecisionError(`decision endpoint listed no models: ${JSON.stringify(res).slice(0, 200)}`);
    return res.models
      .filter((m) => m.capabilities?.includes('decision'))
      .map((m) => ({ name: m.name.replace(/:latest$/, ''), parameterSize: m.details?.parameter_size }));
  }

  private async request(path: string, init: RequestInit, timeoutMs = this.timeoutMs): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new DecisionError(`decision model unreachable at ${url}: ${(error as Error).message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (parsed.error !== undefined) detail = String(parsed.error);
      } catch {
        // Not JSON: the raw body is the detail.
      }
      throw new DecisionError(`decision model ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new DecisionError(`decision model returned non-JSON from ${path}: ${text.slice(0, 200)}`);
    }
  }
}
