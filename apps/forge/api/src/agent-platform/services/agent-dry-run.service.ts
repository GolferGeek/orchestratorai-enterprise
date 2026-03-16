import { Injectable } from '@nestjs/common';
import * as vm from 'vm';

type DryRunResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  logs?: string[];
};

type HandlerFunction = (
  input: unknown,
  ctx: { services: Record<string, unknown> },
) => unknown;

@Injectable()
export class AgentDryRunService {
  async runFunction(
    code: string,
    input: unknown = {},
    timeoutMs = 2000,
  ): Promise<DryRunResult> {
    const logs: string[] = [];
    const consoleStub: {
      log: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      info: (...args: unknown[]) => void;
    } = {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) =>
        logs.push('[warn] ' + args.map(String).join(' ')),
      error: (...args: unknown[]) =>
        logs.push('[error] ' + args.map(String).join(' ')),
      info: (...args: unknown[]) =>
        logs.push('[info] ' + args.map(String).join(' ')),
    };

    // Very limited sandbox; no require/process. This is a best-effort guard.
    const context = vm.createContext({
      module: { exports: undefined as unknown },
      exports: {} as Record<string, unknown>,
      console: consoleStub,
      require: undefined,
      process: undefined,
      global: {},
      Buffer: undefined,
    }) as {
      module: { exports: unknown };
      exports: Record<string, unknown>;
      console: typeof consoleStub;
      require: undefined;
      process: undefined;
      global: Record<string, unknown>;
      Buffer: undefined;
    };

    try {
      const script = new vm.Script(String(code));
      script.runInContext(context, { timeout: Math.min(timeoutMs, 1000) });
      const handler: unknown = context.module.exports || context.exports;
      if (typeof handler !== 'function') {
        return {
          ok: false,
          error:
            'Function code must export a handler (module.exports = async (input, ctx) => { ... })',
          logs,
        };
      }

      const ctx = { services: {} };
      const typedHandler = handler as HandlerFunction;
      const exec = Promise.resolve().then(() => typedHandler(input, ctx));
      const timed = this.withTimeout(exec, timeoutMs);
      const result: unknown = await timed;
      return { ok: true, result, logs };
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : 'dry-run error';
      return { ok: false, error: message, logs };
    }
  }

  runApiTransform(
    apiConfig: unknown,
    input: unknown = {},
    mockResponse?: unknown,
  ): {
    ok: boolean;
    request?: { format?: string; body?: string };
    response?: { format?: string; extracted?: unknown };
    error?: string;
  } {
    try {
      const apiConfigObj = apiConfig as Record<string, unknown> | undefined;
      const reqT: unknown =
        apiConfigObj?.request_transform || apiConfigObj?.requestTransform;
      const resT: unknown =
        apiConfigObj?.response_transform || apiConfigObj?.responseTransform;

      let body: string | undefined;
      if (
        typeof reqT === 'object' &&
        reqT !== null &&
        'format' in reqT &&
        reqT.format === 'custom' &&
        'template' in reqT &&
        typeof reqT.template === 'string'
      ) {
        body = this.renderTemplate(reqT.template, input);
      } else if (typeof reqT === 'object') {
        // Best-effort stringify
        body = JSON.stringify(reqT);
      }

      let extracted: unknown = undefined;
      if (
        typeof resT === 'object' &&
        resT !== null &&
        'format' in resT &&
        resT.format === 'field_extraction' &&
        'field' in resT &&
        typeof resT.field === 'string'
      ) {
        const src: unknown = mockResponse ?? {};
        extracted = this.getByPath(src, resT.field);
      }

      const reqFormat: string | undefined =
        typeof reqT === 'object' &&
        reqT !== null &&
        'format' in reqT &&
        typeof reqT.format === 'string'
          ? reqT.format
          : undefined;
      const resFormat: string | undefined =
        typeof resT === 'object' &&
        resT !== null &&
        'format' in resT &&
        typeof resT.format === 'string'
          ? resT.format
          : undefined;

      return {
        ok: true,
        request: { format: reqFormat, body },
        response: { format: resFormat, extracted },
      };
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : 'api dry-run error';
      return { ok: false, error: message };
    }
  }

  private renderTemplate(tpl: string, ctx: unknown): string {
    return String(tpl).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, p1) => {
      const v = this.getByPath(ctx, String(p1).trim());
      if (v == null) return '';
      // Handle objects by stringifying them
      if (typeof v === 'object') {
        return JSON.stringify(v);
      }
      // Handle primitives (string, number, boolean, symbol)
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        return String(v);
      }
      // Fallback for any other types
      return '';
    });
  }

  private getByPath(obj: unknown, path: string): unknown {
    if (!obj || !path) return undefined;
    return String(path)
      .split('.')
      .reduce(
        (acc: unknown, key: string) =>
          acc != null && typeof acc === 'object' && key in acc
            ? (acc as Record<string, unknown>)[key]
            : undefined,
        obj,
      );
  }
  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('dry-run timeout')),
        Math.max(1, ms),
      );
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }
}
