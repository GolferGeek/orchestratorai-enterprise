import { of, throwError } from 'rxjs';
import type { HttpService } from '@nestjs/axios';
import { LMStudioAdapter } from './lm-studio.adapter';

function adapter(responses: Record<string, unknown>) {
  const get = jest.fn((url: string) => {
    const path = new URL(url).pathname;
    return path in responses ? of({ data: responses[path] }) : throwError(() => new Error(`404 ${path}`));
  });
  return new LMStudioAdapter({ get } as unknown as HttpService);
}

describe('LMStudioAdapter.listModels', () => {
  beforeEach(() => { process.env.LM_STUDIO_URL = 'http://lmstudio:1234/'; });
  afterEach(() => { delete process.env.LM_STUDIO_URL; });

  it('lists the models LM Studio serves', async () => {
    const a = adapter({ '/v1/models': { data: [{ id: 'qwen3-8b' }] } });
    await expect(a.listModels()).resolves.toEqual([
      { id: 'qwen3-8b', name: 'qwen3-8b', providerName: 'lm_studio', modelType: 'text-generation', isLocal: true },
    ]);
  });

  it('throws, naming the URL, when LM Studio does not answer', async () => {
    await expect(adapter({}).listModels()).rejects.toThrow(
      'Cannot list LM Studio models: http://lmstudio:1234/v1/models did not answer (404 /v1/models)',
    );
  });

  it('throws when /v1/models answers without a data array', async () => {
    await expect(adapter({ '/v1/models': {} }).listModels()).rejects.toThrow('returned no "data" array');
  });
});
