import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { LLMServiceFactory } from '@llm/services/llm-service-factory';
import {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
  RoutingDecision as LLMRoutingDecision,
} from '@llm/services/llm-interfaces';
import { RoutingDecision } from '@llm/centralized-routing.service';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import { PromptPayload } from './agent-runtime-prompt.service';
import {
  TaskRequestDto,
  AgentTaskMode,
} from '@agent2agent/dto/task-request.dto';
import { AgentRuntimeMetricsService } from './agent-runtime-metrics.service';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export interface AgentRuntimeDispatchOptions {
  definition: AgentRuntimeDefinition;
  routingDecision: RoutingDecision;
  prompt: PromptPayload;
  request: TaskRequestDto;
  executionContext: ExecutionContext;
  stream?: boolean;
  onStreamChunk?: (chunk: AgentRuntimeStreamChunk) => void;
  overrides?: {
    config?: Partial<LLMServiceConfig>;
    options?: Partial<GenerateResponseParams['options']>;
  };
}

export interface AgentRuntimeStreamChunk {
  type: 'partial' | 'final' | 'progress';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeDispatchResult {
  response: LLMResponse;
  config: LLMServiceConfig;
  params: GenerateResponseParams;
  routingDecision: RoutingDecision;
}

export interface AgentRuntimeStreamingResult {
  response: Promise<AgentRuntimeDispatchResult>;
  stream: AsyncIterable<AgentRuntimeStreamChunk>;
  cancel: () => void;
}

interface StreamController {
  push: (chunk: AgentRuntimeStreamChunk) => void;
  close: () => void;
  error: (error: unknown) => void;
  iterator: AsyncIterable<AgentRuntimeStreamChunk>;
}

@Injectable()
export class AgentRuntimeDispatchService {
  private readonly logger = new Logger(AgentRuntimeDispatchService.name);
  constructor(
    private readonly llmFactory: LLMServiceFactory,
    private readonly http: HttpService,
    private readonly metrics: AgentRuntimeMetricsService,
  ) {}

  async dispatch(
    options: AgentRuntimeDispatchOptions,
  ): Promise<AgentRuntimeDispatchResult> {
    const transport = options.definition.transport?.kind;
    if (transport === 'api') {
      return this.dispatchApi(options);
    }
    if (transport === 'external') {
      return this.dispatchExternal(options);
    }

    const config = this.buildConfig(
      options.definition,
      options.routingDecision,
      options.overrides?.config,
    );

    const params = this.buildParams(options, config);

    const response = await this.llmFactory.generateResponse(config, params);

    if (options.onStreamChunk) {
      options.onStreamChunk({
        type: 'final',
        content: response.content,
        metadata: response.metadata as unknown as Record<string, unknown>,
      });
    }

    return {
      response,
      config,
      params,
      routingDecision: options.routingDecision,
    };
  }

  dispatchStream(
    options: AgentRuntimeDispatchOptions,
  ): AgentRuntimeStreamingResult {
    const controller = this.createStreamController();
    const transport = options.definition.transport?.kind;
    if (transport === 'api' || transport === 'external') {
      // Best-effort streaming: perform single request and push as one chunk
      const responsePromise = this.dispatch(options)
        .then((result) => {
          controller.push({
            type: 'final',
            content: result.response.content,
            metadata: result.response.metadata as unknown as Record<
              string,
              unknown
            >,
          });
          controller.close();
          return result;
        })
        .catch((error) => {
          controller.error(error);
          throw error;
        });

      return {
        response: responsePromise,
        stream: controller.iterator,
        cancel: () => controller.close(),
      };
    }
    const mergedOptions: AgentRuntimeDispatchOptions = {
      ...options,
      stream: true,
      overrides: {
        ...(options.overrides ?? {}),
        options: {
          ...(options.overrides?.options ?? {}),
          stream: true,
        },
      },
      onStreamChunk: (chunk) => {
        options.onStreamChunk?.(chunk);
        controller.push(chunk);
      },
    };

    const responsePromise = this.dispatch(mergedOptions)
      .then((result) => {
        controller.close();
        return result;
      })
      .catch((error) => {
        controller.error(error);
        throw error;
      });

    return {
      response: responsePromise,
      stream: controller.iterator,
      cancel: () => controller.close(),
    };
  }

  private buildConfig(
    definition: AgentRuntimeDefinition,
    decision: RoutingDecision,
    overrides: Partial<LLMServiceConfig> | undefined,
  ): LLMServiceConfig {
    const decisionExtras = decision as unknown as Record<string, unknown>;

    return {
      provider: decision.provider ?? definition.llm?.provider ?? 'openai',
      model: decision.model ?? definition.llm?.model ?? 'gpt-4o-mini',
      temperature:
        overrides?.temperature ??
        (decisionExtras.temperature as number | undefined) ??
        definition.llm?.temperature,
      maxTokens:
        overrides?.maxTokens ??
        (decisionExtras.maxTokens as number | undefined) ??
        definition.llm?.maxTokens,
      apiKey:
        overrides?.apiKey ?? (decisionExtras.apiKey as string | undefined),
      baseUrl:
        overrides?.baseUrl ?? (decisionExtras.baseUrl as string | undefined),
      timeout:
        overrides?.timeout ?? (decisionExtras.timeout as number | undefined),
    };
  }

  private buildParams(
    options: AgentRuntimeDispatchOptions,
    config: LLMServiceConfig,
  ): GenerateResponseParams {
    const { request, prompt, routingDecision, overrides } = options;
    const payload = request.payload ?? {};
    const rawOptions: Record<string, unknown> = { ...(payload.options ?? {}) };
    const {
      metadata: _ignoredMetadata,
      stream,
      maxComplexity: _rawMaxComplexity,
      ...restOptions
    } = rawOptions;

    const overrideOptions = overrides?.options ?? {};
    const {
      maxComplexity: overrideMaxComplexity,
      stream: overrideStream,
      ...otherOverrides
    } = overrideOptions;

    // Determine maxComplexity value early to avoid type issues
    const finalMaxComplexity:
      | 'simple'
      | 'medium'
      | 'complex'
      | 'reasoning'
      | undefined =
      typeof overrideMaxComplexity === 'string'
        ? overrideMaxComplexity
        : typeof prompt.metadata?.maxComplexity === 'string'
          ? (prompt.metadata.maxComplexity as
              | 'simple'
              | 'medium'
              | 'complex'
              | 'reasoning')
          : undefined;

    const finalOptions: NonNullable<GenerateResponseParams['options']> = {
      callerType: 'agent',
      callerName: options.definition.name ?? options.definition.slug,
      temperature: config.temperature,
      piiMetadata: routingDecision.piiMetadata,
      routingDecision: {
        provider: routingDecision.provider,
        model: routingDecision.model,
        tier: routingDecision.isLocal ? 'local' : 'centralized',
        reason: 'agent-dispatch',
        confidence: 1.0,
      } as LLMRoutingDecision,
      preferLocal: routingDecision.isLocal,
      stream:
        overrideStream ??
        options.stream ??
        (stream as boolean | undefined) ??
        false,
      maxComplexity: finalMaxComplexity,
      ...restOptions,
      ...otherOverrides,
      // ExecutionContext is the single source of truth
      executionContext: options.executionContext,
    };

    return {
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      config,
      options: finalOptions,
    };
  }

  private createStreamController(): StreamController {
    const queue: AgentRuntimeStreamChunk[] = [];
    const pending: Array<{
      resolve: (value: IteratorResult<AgentRuntimeStreamChunk>) => void;
      reject: (error: unknown) => void;
    }> = [];
    let closed = false;
    let error: unknown = null;

    const flush = () => {
      while (queue.length && pending.length) {
        const chunk = queue.shift()!;
        const { resolve } = pending.shift()!;
        resolve({ value: chunk, done: false });
      }

      if (error) {
        while (pending.length) {
          const { reject } = pending.shift()!;
          reject(error);
        }
        return;
      }

      if (closed) {
        while (pending.length) {
          const { resolve } = pending.shift()!;
          resolve({
            value: undefined as unknown as AgentRuntimeStreamChunk,
            done: true,
          });
        }
      }
    };

    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next(): Promise<IteratorResult<AgentRuntimeStreamChunk>> {
        if (error) {
          let errorMessage: string;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'object' && error !== null) {
            errorMessage = JSON.stringify(error);
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (typeof error === 'number' || typeof error === 'boolean') {
            errorMessage = String(error);
          } else {
            errorMessage = 'Unknown error';
          }
          return Promise.reject(
            error instanceof Error ? error : new Error(errorMessage),
          );
        }
        if (queue.length) {
          const chunk = queue.shift()!;
          return Promise.resolve({ value: chunk, done: false });
        }
        if (closed) {
          return Promise.resolve({
            value: undefined as unknown as AgentRuntimeStreamChunk,
            done: true,
          });
        }
        return new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
        });
      },
    } as AsyncIterable<AgentRuntimeStreamChunk> & {
      next: () => Promise<IteratorResult<AgentRuntimeStreamChunk>>;
    };

    return {
      iterator,
      push: (chunk) => {
        if (closed || error) {
          return;
        }
        queue.push(chunk);
        flush();
      },
      close: () => {
        if (closed || error) {
          return;
        }
        closed = true;
        flush();
      },
      error: (err) => {
        if (closed || error) {
          return;
        }
        error = err;
        flush();
      },
    };
  }

  private async dispatchApi(
    options: AgentRuntimeDispatchOptions,
  ): Promise<AgentRuntimeDispatchResult> {
    const api = options.definition.transport!.api!;
    const method = (api.method || 'POST').toUpperCase();
    const url = api.endpoint;

    const payloadOptions = options.request.payload?.options as
      | Record<string, unknown>
      | undefined;
    const mergedHeaders: Record<string, unknown> = {
      'content-type': 'application/json',
      ...(api.headers ?? {}),
      ...((payloadOptions?.headers as Record<string, unknown>) || {}),
    };
    const headers = this.sanitizeForwardHeaders(mergedHeaders);

    const body: unknown = this.buildApiRequestBody(api, options);

    const start = Date.now();
    const defaultTimeout = this.resolveDefaultTimeout('api');
    let res;
    try {
      res = await this.performWithRetry(() =>
        this.http.axiosRef.request({
          url,
          method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
          headers: headers as Record<string, string>,
          timeout: api.timeout ?? defaultTimeout,
          data: body,
          validateStatus: () => true,
        }),
      );
    } catch (err: unknown) {
      const end = Date.now();
      const errObj = err as { response?: { status?: number } };
      const status = Number(errObj?.response?.status ?? -1);
      this.safeLog('api', url, status, end - start);
      this.metrics.record(
        'api',
        options.definition.slug,
        false,
        end - start,
        status,
      );
      throw err;
    }

    const end = Date.now();
    // Normalize content (apply response transform if configured)
    const content = this.extractApiResponseContent(api, res.data);
    const isOk = res.status >= 200 && res.status < 300;
    const response = {
      content,
      metadata: {
        provider: 'external_api',
        model: 'api_endpoint',
        requestId: (res.headers['x-request-id'] as string | undefined) || '',
        timestamp: new Date(end).toISOString(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        timing: { startTime: start, endTime: end, duration: end - start },
        tier: 'external',
        status: isOk ? 'completed' : 'error',
        providerSpecific: { status: res.status },
        ...(isOk
          ? {}
          : { errorMessage: this.buildHttpErrorMessage(res.status, res.data) }),
      },
    } as const;

    // Observability: log sanitized outcome
    this.safeLog('api', url, res.status, end - start);
    this.metrics.record(
      'api',
      options.definition.slug,
      isOk,
      end - start,
      res.status,
    );

    if (options.onStreamChunk) {
      options.onStreamChunk({
        type: 'final',
        content: response.content,
        metadata: response.metadata as unknown as Record<string, unknown>,
      });
    }

    return {
      response,
      config: {
        provider: 'external_api',
        model: 'api_endpoint',
        timeout: api.timeout ?? 30_000,
        baseUrl: url,
      },
      params: {
        systemPrompt: options.prompt.systemPrompt,
        userMessage: options.prompt.userMessage,
        config: { provider: 'external_api', model: 'api_endpoint' },
        options: {
          executionContext: options.executionContext,
        },
      },
      routingDecision: options.routingDecision,
    };
  }

  private async dispatchExternal(
    options: AgentRuntimeDispatchOptions,
  ): Promise<AgentRuntimeDispatchResult> {
    const external = options.definition.transport!.external!;
    const url = external.endpoint;

    const payloadRecord = this.asRecord(options.request.payload);
    const payloadOptions = this.asRecord(payloadRecord?.options);
    const payloadHeaders = this.coerceHeaderRecord(payloadOptions?.headers);

    const mergedHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...this.coerceHeaderRecord(external.authentication?.headers),
      ...payloadHeaders,
    };
    const headers = this.sanitizeForwardHeaders(mergedHeaders);

    const methodName = this.mapModeToMethod(options.request.mode!);
    const id = Date.now();
    const params = {
      conversationId: options.request.context?.conversationId,
      sessionId: options.request.context?.taskId,
      userMessage: options.prompt.userMessage,
      messages: options.request.messages ?? [],
      metadata: options.prompt.metadata,
      payload: options.request.payload ?? {},
      options: options.request.payload?.options ?? {},
    };

    const body = {
      jsonrpc: '2.0',
      id,
      method: methodName,
      params,
    };

    const start = Date.now();
    const defaultTimeout = this.resolveDefaultTimeout('external');
    let res;
    try {
      res = await this.performWithRetry(() =>
        this.http.axiosRef.post(url, body, {
          headers: headers as Record<string, string>,
          timeout: external.timeout ?? defaultTimeout,
          validateStatus: () => true,
        }),
      );
    } catch (err: unknown) {
      const end = Date.now();
      const errObj = err as { response?: { status?: number } };
      const status = Number(errObj?.response?.status ?? -1);
      this.safeLog('external', url, status, end - start);
      this.metrics.record(
        'external',
        options.definition.slug,
        false,
        end - start,
        status,
      );
      throw err;
    }
    const end = Date.now();

    const resData = res.data as Record<string, unknown> | undefined;
    const hasRpcError =
      resData &&
      typeof resData === 'object' &&
      'error' in resData &&
      resData.error;
    const envelope = hasRpcError
      ? resData.error
      : resData && resData.result
        ? resData.result
        : resData;
    const content = this.stringifyContent(envelope);

    const isOk = res.status >= 200 && res.status < 300 && !hasRpcError;
    const response = {
      content,
      metadata: {
        provider: 'external_a2a',
        model: 'a2a',
        requestId:
          (res.headers['x-request-id'] as string | undefined) || String(id),
        timestamp: new Date(end).toISOString(),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        timing: { startTime: start, endTime: end, duration: end - start },
        tier: 'external',
        status: isOk ? 'completed' : 'error',
        providerSpecific: { status: res.status },
        ...(isOk
          ? {}
          : {
              errorMessage: this.buildRpcErrorMessage(
                (res.data as Record<string, unknown> | undefined)?.error,
                res.status,
              ),
            }),
      },
    } as const;

    // Observability: log sanitized outcome
    this.safeLog('external', url, res.status, end - start);
    this.metrics.record(
      'external',
      options.definition.slug,
      isOk,
      end - start,
      res.status,
    );

    if (options.onStreamChunk) {
      options.onStreamChunk({
        type: 'final',
        content: response.content,
        metadata: response.metadata as unknown as Record<string, unknown>,
      });
    }

    return {
      response,
      config: {
        provider: 'external_a2a',
        model: 'a2a',
        timeout: external.timeout ?? 30_000,
        baseUrl: url,
      },
      params: {
        systemPrompt: options.prompt.systemPrompt,
        userMessage: options.prompt.userMessage,
        config: { provider: 'external_a2a', model: 'a2a' },
        options: {
          executionContext: options.executionContext,
        },
      },
      routingDecision: options.routingDecision,
    };
  }

  private mapModeToMethod(mode: AgentTaskMode): string {
    switch (mode) {
      case AgentTaskMode.PLAN:
        return 'plan';
      case AgentTaskMode.BUILD:
        return 'build';
      default:
        return 'converse';
    }
  }

  private stringifyContent(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const objValue = value as Record<string, unknown>;
      if (typeof objValue.message === 'string' && objValue.message.trim()) {
        return objValue.message;
      }
      if (typeof objValue.response === 'string' && objValue.response.trim()) {
        return objValue.response;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    // Handle primitives (number, boolean, bigint, symbol)
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    // Handle null, undefined, or other types
    return value == null ? '' : '[Unknown]';
  }

  private sanitizeForwardHeaders(
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const allow = this.resolveHeaderAllowlist();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(source)) {
      const key = String(k).toLowerCase();
      if (!allow.has(key)) continue;
      if (v === undefined || v === null) continue;
      out[key] = v as unknown;
    }
    return out;
  }

  private resolveHeaderAllowlist(): Set<string> {
    const base = [
      'authorization',
      'x-user-key',
      'x-api-key',
      'x-agent-api-key',
      'content-type',
    ];
    const extra = (process.env.AGENT_EXTERNAL_HEADER_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return new Set([...base, ...extra]);
  }

  private resolveDefaultTimeout(kind: 'api' | 'external'): number {
    const raw =
      kind === 'api'
        ? process.env.AGENT_API_DEFAULT_TIMEOUT_MS
        : process.env.AGENT_EXTERNAL_DEFAULT_TIMEOUT_MS;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 30_000;
  }

  private async performWithRetry<T>(
    fn: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= retries) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        // Axios/network errors: retry on ECONNRESET/ETIMEDOUT/5xx indicated by response
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        const retriable = status ? status >= 500 : true;
        if (attempt === retries || !retriable) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        attempt++;
      }
    }
    throw lastError;
  }

  private buildHttpErrorMessage(status: number, data: unknown): string {
    const base = `HTTP ${status}`;
    if (!data) return base;
    try {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const redacted = this.redactString(text);
      const snippet =
        redacted.length > 160 ? redacted.slice(0, 160) + '…' : redacted;
      return `${base}: ${snippet}`;
    } catch {
      return base;
    }
  }

  private buildRpcErrorMessage(error: unknown, status?: number): string {
    const statusText = status ? ` (HTTP ${status})` : '';
    if (!error) return `External A2A error${statusText}`;
    const errorObj = error as { code?: unknown; message?: unknown };
    let codeStr = '';
    if (errorObj.code !== undefined) {
      if (typeof errorObj.code === 'object' && errorObj.code !== null) {
        codeStr = JSON.stringify(errorObj.code);
      } else if (
        typeof errorObj.code === 'string' ||
        typeof errorObj.code === 'number' ||
        typeof errorObj.code === 'boolean'
      ) {
        codeStr = String(errorObj.code);
      } else {
        codeStr = '[code]';
      }
    }
    const code = codeStr ? ` [code ${codeStr}]` : '';
    const raw: string =
      typeof errorObj.message === 'string'
        ? errorObj.message
        : this.stringifyContent(error);
    const msg = this.redactString(raw);
    const snippet = msg.length > 160 ? msg.slice(0, 160) + '…' : msg;
    return `External A2A error${statusText}${code}: ${snippet}`;
  }

  private safeLog(
    kind: 'api' | 'external',
    url: string,
    status: number,
    durationMs: number,
  ) {
    try {
      const target = new URL(url);
      const host = target.host;
      const path = target.pathname;
      const msg = `${kind.toUpperCase()} ${status} ${host}${path} in ${durationMs}ms`;
      if (status >= 500) {
        this.logger.error(msg);
      } else if (status >= 400) {
        this.logger.warn(msg);
      }
    } catch {
      // ignore logging errors
    }
  }

  private redactString(input: string): string {
    // Mask common secret patterns and headers
    let s = input;
    const patterns: Array<[RegExp, string]> = [
      // API keys (generic sk-..., bearer tokens, UUID-like secrets)
      [/sk-[A-Za-z0-9-_]{10,}/g, 'sk-REDACTED'],
      [/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer REDACTED'],
      [/api[-_]?key\s*[:=]\s*[^\s"']+/gi, 'api_key=REDACTED'],
      [/x-?api-?key\s*[:=]\s*[^\s"']+/gi, 'x-api-key=REDACTED'],
      [/authorization\s*[:=]\s*[^\s"']+/gi, 'authorization=REDACTED'],
      // JSON fields
      [/("authorization"\s*:\s*")[^"]+(")/gi, '"authorization":"REDACTED"'],
      [/("x-?api-?key"\s*:\s*")[^"]+(")/gi, '"x-api-key":"REDACTED"'],
      [/("api[-_]?key"\s*:\s*")[^"]+(")/gi, '"apiKey":"REDACTED"'],
      [/("token"\s*:\s*")[^"]+(")/gi, '"token":"REDACTED"'],
    ];
    for (const [re, repl] of patterns) {
      s = s.replace(re, repl);
    }
    return s;
  }

  private buildApiRequestBody(
    api: NonNullable<AgentRuntimeDefinition['transport']>['api'],
    options: AgentRuntimeDispatchOptions,
  ): unknown {
    const t = api?.requestTransform;
    const sessionId =
      options.request.context?.taskId ??
      options.request.context?.conversationId ??
      null;
    const userMessage = options.prompt.userMessage ?? '';
    const conversationId = options.request.context?.conversationId ?? null;
    const agentSlug = options.definition.slug;
    const organizationSlug = options.definition.organizationSlug ?? null;

    if (t && t.format === 'custom' && typeof t.template === 'string') {
      try {
        const rendered = t.template.replace(
          /\{\{\s*(\w+)\s*\}\}/g,
          (_m, key) => {
            switch (String(key)) {
              case 'userMessage':
              case 'prompt':
                return userMessage;
              case 'sessionId':
                return String(sessionId ?? '');
              case 'conversationId':
                return String(conversationId ?? '');
              case 'agentSlug':
                return String(agentSlug ?? '');
              case 'organizationSlug':
                return String(organizationSlug ?? '');
              default:
                return '';
            }
          },
        );
        // If the template is JSON-like, parse it; otherwise send as string
        const maybeJson = rendered.trim();
        if (
          (maybeJson.startsWith('{') && maybeJson.endsWith('}')) ||
          (maybeJson.startsWith('[') && maybeJson.endsWith(']'))
        ) {
          return JSON.parse(maybeJson);
        }
        return rendered;
      } catch {
        // Fall through to minimal body
      }
    }

    // Minimal default body expected by n8n: send only prompt
    return { prompt: userMessage };
  }

  private extractApiResponseContent(
    api: NonNullable<AgentRuntimeDefinition['transport']>['api'],
    data: unknown,
  ): string {
    const rt = api?.responseTransform;
    if (
      rt &&
      rt.format === 'field_extraction' &&
      typeof rt.field === 'string' &&
      rt.field.trim()
    ) {
      const fieldPath = rt.field.trim();
      try {
        // Support dotted/bracket paths like "a.b[0].c"
        const tryExtract = (obj: unknown, path: string): unknown => {
          if (!obj || typeof obj !== 'object') return undefined;
          const objRecord = obj as Record<string | number, unknown>;
          // direct field hit
          if (Object.prototype.hasOwnProperty.call(objRecord, path)) {
            return objRecord[path];
          }
          // dotted/bracket notation
          const normalized = path.replace(/\[(\d+)\]/g, '.$1');
          const parts: Array<string | number> = normalized
            .split('.')
            .filter((segment) => segment.length > 0)
            .map((segment) => {
              const numeric = Number(segment);
              return Number.isNaN(numeric) ? segment : numeric;
            });
          let cur: unknown = obj;
          for (const p of parts) {
            if (cur == null) return undefined;
            const curRecord = cur as Record<string | number, unknown>;
            cur = curRecord[p];
          }
          return cur;
        };

        const fromRoot = tryExtract(data, fieldPath);
        if (fromRoot !== undefined) {
          return typeof fromRoot === 'string'
            ? fromRoot
            : this.stringifyContent(fromRoot);
        }
        const dataRecord = data as Record<string, unknown> | undefined;
        if (dataRecord && typeof dataRecord === 'object' && dataRecord.result) {
          const fromResult = tryExtract(dataRecord.result, fieldPath);
          if (fromResult !== undefined) {
            return typeof fromResult === 'string'
              ? fromResult
              : this.stringifyContent(fromResult);
          }
        }
      } catch {
        // fallthrough to generic stringify
      }
    }
    return this.stringifyContent(data);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private coerceHeaderRecord(value: unknown): Record<string, string> {
    const source = this.asRecord(value);
    if (!source) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, raw] of Object.entries(source)) {
      if (raw === undefined || raw === null) {
        continue;
      }
      result[String(key)] =
        typeof raw === 'string' ? raw : this.stringifyContent(raw);
    }

    return result;
  }
}
