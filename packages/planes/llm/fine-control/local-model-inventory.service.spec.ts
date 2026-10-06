import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import type { DatabaseService } from '../../database';
import { LocalModelInventoryService } from './local-model-inventory.service';

/** A tx whose builder records each statement (op, table, filters, data). */
function fakeDb(knownInstalled: string[]) {
  const statements: Array<Record<string, unknown>> = [];
  const builder = (table: string) => {
    const statement: Record<string, unknown> = { table, filters: {} as Record<string, unknown> };
    statements.push(statement);
    const chain = {
      update(data: unknown) { statement.op = 'update'; statement.data = data; return chain; },
      insert(data: unknown) { statement.op = 'insert'; statement.data = data; return chain; },
      eq(column: string, value: unknown) { (statement.filters as Record<string, unknown>)[column] = value; return chain; },
      in(column: string, values: unknown[]) { (statement.filters as Record<string, unknown>)[column] = values; return chain; },
      select() { statement.select = true; return chain; },
      then(resolve: (r: unknown) => void) {
        const data = statement.select ? knownInstalled.map((model_name) => ({ model_name })) : null;
        resolve({ data, error: null });
      },
    };
    return chain;
  };
  const tx = { from: (_schema: null, table: string) => builder(table) };
  const db = { transaction: async (work: (t: unknown) => Promise<unknown>) => work(tx) } as unknown as DatabaseService;
  return { db, statements };
}

function service(http: Partial<HttpService>, db: DatabaseService) {
  return new LocalModelInventoryService(
    http as HttpService,
    db,
    new ConfigService({ OLLAMA_BASE_URL: 'http://ollama:11434/' }),
  );
}

describe('LocalModelInventoryService', () => {
  it('marks exactly the installed models available and adds unknown ones', async () => {
    const { db, statements } = fakeDb(['gemma4:e4b']);
    const http = { get: jest.fn(() => of({ data: { models: [{ name: 'gemma4:e4b' }, { name: 'qwen3.6:latest' }, { name: 'nomic-embed-text:latest' }] } })) };
    const result = await service(http as never, db).sync();

    expect(http.get).toHaveBeenCalledWith('http://ollama:11434/api/tags', { timeout: 5000 });
    expect(result).toEqual({
      reachable: true,
      installed: ['gemma4:e4b', 'qwen3.6:latest', 'nomic-embed-text:latest'],
      added: ['qwen3.6:latest', 'nomic-embed-text:latest'],
      skipped: [],
    });
    expect(statements[0]).toMatchObject({ op: 'update', data: { is_available: false }, filters: { provider_name: 'ollama' } });
    expect(statements[1]).toMatchObject({ op: 'update', data: { is_available: true } });
    expect(statements[2]).toMatchObject({
      op: 'insert',
      data: [
        expect.objectContaining({ model_name: 'qwen3.6:latest', vendor: 'ollama', model_type: 'text-generation', is_available: true }),
        expect.objectContaining({ model_name: 'nomic-embed-text:latest', vendor: 'ollama', model_type: 'embedding' }),
      ],
    });
  });

  it('keeps decision-only models out of llm_models and deactivates rows already there', async () => {
    const { db, statements } = fakeDb(['qwen3.6:latest']);
    const http = {
      get: jest.fn(() => of({ data: { models: [
        { name: 'clef:latest', capabilities: ['decision'] },
        { name: 'qwen3.6:latest', capabilities: ['completion', 'vision', 'tools', 'thinking'] },
        { name: 'clef-flash:latest', capabilities: ['decision'] },
        { name: 'nomic-embed-text:latest', capabilities: ['embedding'] },
      ] } })),
    };
    const result = await service(http as never, db).sync();

    expect(result).toEqual({
      reachable: true,
      installed: ['qwen3.6:latest', 'nomic-embed-text:latest'],
      added: ['nomic-embed-text:latest'],
      skipped: ['clef:latest', 'clef-flash:latest'],
    });
    expect(statements[1]).toMatchObject({
      op: 'update',
      data: { is_active: false },
      filters: { provider_name: 'ollama', model_name: ['clef:latest', 'clef-flash:latest'] },
    });
    expect(statements[2]).toMatchObject({ op: 'update', data: { is_available: true }, filters: { model_name: ['qwen3.6:latest', 'nomic-embed-text:latest'] } });
    expect(statements[3]).toMatchObject({
      op: 'insert',
      data: [expect.objectContaining({ model_name: 'nomic-embed-text:latest', model_type: 'embedding' })],
    });
    expect(JSON.stringify(statements.filter((st) => st.op === 'insert'))).not.toContain('clef');
  });

  it('types a model by its capabilities, not its name, when the host reports them', async () => {
    const { db, statements } = fakeDb([]);
    const http = { get: jest.fn(() => of({ data: { models: [{ name: 'embedder-chat:latest', capabilities: ['completion'] }, { name: 'bge-m3:latest', capabilities: ['embedding'] }] } })) };
    await service(http as never, db).sync();
    expect(statements.find((st) => st.op === 'insert')).toMatchObject({
      data: [
        expect.objectContaining({ model_name: 'embedder-chat:latest', model_type: 'text-generation' }),
        expect.objectContaining({ model_name: 'bge-m3:latest', model_type: 'embedding' }),
      ],
    });
  });

  it('marks every local model unavailable when Ollama cannot be reached', async () => {
    const { db, statements } = fakeDb([]);
    const http = { get: jest.fn(() => throwError(() => new Error('connect ECONNREFUSED'))) };
    await expect(service(http as never, db).sync()).resolves.toEqual({ reachable: false, installed: [], added: [], skipped: [] });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({ op: 'update', data: { is_available: false } });
  });

  it('refuses to start without OLLAMA_BASE_URL', () => {
    // ConfigService also reads process.env, so the variable must really be absent.
    const saved = process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_BASE_URL;
    try {
      expect(
        () => new LocalModelInventoryService({} as HttpService, {} as DatabaseService, new ConfigService({})),
      ).toThrow('OLLAMA_BASE_URL');
    } finally {
      if (saved !== undefined) process.env.OLLAMA_BASE_URL = saved;
    }
  });
});
