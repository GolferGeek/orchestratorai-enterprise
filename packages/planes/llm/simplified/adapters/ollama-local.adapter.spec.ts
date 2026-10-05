import { of, throwError } from 'rxjs';
import type { HttpService } from '@nestjs/axios';
import { OllamaLocalAdapter } from './ollama-local.adapter';

function adapter(responses: Record<string, unknown>) {
  const get = jest.fn((url: string) => {
    const path = new URL(url).pathname;
    return path in responses ? of({ data: responses[path] }) : throwError(() => new Error(`404 ${path}`));
  });
  return { get, adapter: new OllamaLocalAdapter({ get } as unknown as HttpService) };
}

describe('OllamaLocalAdapter.listModels', () => {
  beforeEach(() => { process.env.OLLAMA_LOCAL_URL = 'http://ollama:11434/'; });
  afterEach(() => { delete process.env.OLLAMA_LOCAL_URL; });

  it('lists only models that can chat when Ollama reports capabilities', async () => {
    const { adapter: a } = adapter({
      '/api/tags': { models: [
        { name: 'clef:latest', capabilities: ['decision'] },
        { name: 'qwen3.6:latest', capabilities: ['completion', 'vision', 'tools'] },
        { name: 'clef-flash:latest', capabilities: ['decision'] },
        { name: 'nomic-embed-text:latest', capabilities: ['embedding'] },
      ] },
      '/v1/models': { data: [{ id: 'clef:latest' }, { id: 'qwen3.6:latest' }] },
    });
    await expect(a.listModels()).resolves.toEqual([
      { id: 'qwen3.6:latest', name: 'qwen3.6:latest', providerName: 'ollama', modelType: 'text-generation', isLocal: true },
    ]);
  });

  it('lists every model from a host too old to report capabilities', async () => {
    const { adapter: a } = adapter({ '/api/tags': { models: [{ name: 'gemma4:e4b' }, { name: 'llama3.2:latest' }] } });
    await expect(a.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'gemma4:e4b' }),
      expect.objectContaining({ id: 'llama3.2:latest' }),
    ]);
  });

  it('reads /api/tags only, never /v1/models (which cannot say what a model can do)', async () => {
    const { adapter: a, get } = adapter({ '/api/tags': { models: [{ name: 'qwen3.6:latest', capabilities: ['completion'] }] } });
    await a.listModels();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('http://ollama:11434/api/tags', { timeout: 5_000 });
  });

  it('throws, naming the URL, when Ollama does not answer', async () => {
    const { adapter: a } = adapter({});
    await expect(a.listModels()).rejects.toThrow(
      'Cannot list local Ollama models: http://ollama:11434/api/tags did not answer (404 /api/tags)',
    );
  });

  it('throws when /api/tags answers without a models array', async () => {
    const { adapter: a } = adapter({ '/api/tags': {} });
    await expect(a.listModels()).rejects.toThrow('returned no "models" array');
  });

  it('returns an empty list when Ollama answers with no models installed', async () => {
    const { adapter: a } = adapter({ '/api/tags': { models: [] } });
    await expect(a.listModels()).resolves.toEqual([]);
  });
});
