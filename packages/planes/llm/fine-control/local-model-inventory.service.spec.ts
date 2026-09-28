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

  it('marks every local model unavailable when Ollama cannot be reached', async () => {
    const { db, statements } = fakeDb([]);
    const http = { get: jest.fn(() => throwError(() => new Error('connect ECONNREFUSED'))) };
    await expect(service(http as never, db).sync()).resolves.toEqual({ reachable: false, installed: [], added: [] });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({ op: 'update', data: { is_available: false } });
  });

  it('refuses to start without OLLAMA_BASE_URL', () => {
    expect(
      () => new LocalModelInventoryService({} as HttpService, {} as DatabaseService, new ConfigService({})),
    ).toThrow('OLLAMA_BASE_URL');
  });
});
