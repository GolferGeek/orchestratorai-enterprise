import type { DatabaseService } from '@/database';
import type { OpenRouterClient } from '../../../openrouter/openrouter.client';
import { ModelCatalogSyncService } from '../model-catalog-sync.service';

/** A fluent query builder that records each call and resolves to `result`. */
function recordingDb(existing: Array<{ model_name: string }>) {
  const writes: Array<{ op: string; values?: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const db = {
    from: () => {
      const call = { op: '', values: undefined as Record<string, unknown> | undefined, filters: [] as Array<[string, unknown]> };
      const builder = {
        upsert: (values: Record<string, unknown>) => ((call.op = 'upsert'), (call.values = values), builder),
        update: (values: Record<string, unknown>) => ((call.op = 'update'), (call.values = values), builder),
        select: () => ((call.op = 'select'), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        then: (resolve: (r: unknown) => unknown) => {
          writes.push(call);
          return Promise.resolve(resolve(call.op === 'select' ? { data: existing, error: null } : { data: null, error: null }));
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as DatabaseService, writes };
}

describe('ModelCatalogSyncService', () => {
  const entries = [
    { id: 'openai/gpt-5', name: 'GPT-5', architecture: { output_modalities: ['text'] }, pricing: { prompt: '0.00000125', completion: '0.00001' } },
    { id: 'mistralai/mistral-large', name: 'Mistral Large', architecture: { output_modalities: ['text'] } },
    { id: 'black-forest-labs/flux.2-pro', name: 'FLUX.2 Pro', architecture: { output_modalities: ['image'] }, pricing: { prompt: '0', completion: '0', image: '0.03' } },
    { id: 'google/veo-3.1', name: 'Veo 3.1', architecture: { output_modalities: ['video'] } },
  ];

  beforeEach(() => {
    process.env.OPENROUTER_AUTO_ALLOWED_MODELS = '["openai/*","google/*"]';
  });

  it('keeps text models to the allow-list, takes every image and video model, and records the per-image price', async () => {
    const { db, writes } = recordingDb([{ model_name: 'mistralai/mistral-large' }, { model_name: 'openai/gpt-5' }]);
    const client = { assertConfigured: jest.fn(), listModels: jest.fn(async () => entries) };
    const result = await new ModelCatalogSyncService(db, client as unknown as OpenRouterClient).sync();

    const upserts = writes.filter((w) => w.op === 'upsert').map((w) => w.values!);
    expect(upserts.map((u) => [u.model_name, u.model_type])).toEqual([
      ['openai/gpt-5', 'text-generation'],
      ['black-forest-labs/flux.2-pro', 'image-generation'],
      ['google/veo-3.1', 'video-generation'],
    ]);
    expect(upserts[1]!.pricing_info_json).toMatchObject({ per_image: 0.03 });
    expect(upserts[0]!.pricing_info_json).not.toHaveProperty('per_image');
    // Mistral is outside the text allow-list: deactivated, not deleted.
    expect(writes.filter((w) => w.op === 'update').map((w) => w.filters)).toEqual([[['model_name', 'mistralai/mistral-large'], ['provider_name', 'openrouter']]]);
    expect(result).toEqual({ models: 3, vendors: ['black-forest-labs', 'google', 'openai'], deactivated: 1 });
  });
});
