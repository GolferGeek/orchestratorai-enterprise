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

  const videoCatalog = [
    {
      id: 'google/veo-3.1-fast',
      name: 'Veo 3.1 Fast',
      supported_durations: [4, 6, 8],
      supported_resolutions: ['720p', '1080p', '4K'],
      supported_aspect_ratios: ['16:9', '9:16'],
      supported_frame_images: ['first_frame'],
      generate_audio: true,
      pricing_skus: { duration_seconds_with_audio: '0.12', duration_seconds_without_audio_720p: '0.08' },
    },
    { id: 'bytedance/seedance-2.0-fast', name: 'Seedance 2.0 Fast', supported_durations: [4, 5], supported_resolutions: ['480p'], supported_aspect_ratios: ['1:1'], pricing_skus: { video_tokens: '0.0000042' } },
  ];
  const client = (video: boolean) => ({
    assertConfigured: jest.fn(),
    listModels: jest.fn(async () => entries),
    isVideoEnabled: jest.fn(() => video),
    listVideoModels: jest.fn(async () => videoCatalog),
  });

  it('keeps text models to the allow-list, takes every image model, and records the per-image price', async () => {
    const { db, writes } = recordingDb([{ model_name: 'mistralai/mistral-large' }, { model_name: 'openai/gpt-5' }]);
    const result = await new ModelCatalogSyncService(db, client(false) as unknown as OpenRouterClient).sync();

    const upserts = writes.filter((w) => w.op === 'upsert').map((w) => w.values!);
    expect(upserts.map((u) => [u.model_name, u.model_type])).toEqual([
      ['openai/gpt-5', 'text-generation'],
      ['black-forest-labs/flux.2-pro', 'image-generation'],
    ]);
    expect(upserts[1]!.pricing_info_json).toMatchObject({ per_image: 0.03 });
    expect(upserts[0]!.pricing_info_json).not.toHaveProperty('per_image');
    // Mistral is outside the text allow-list: deactivated, not deleted.
    expect(writes.filter((w) => w.op === 'update').map((w) => w.filters)).toEqual([[['model_name', 'mistralai/mistral-large'], ['provider_name', 'openrouter']]]);
    expect(result).toEqual({ models: 2, vendors: ['black-forest-labs', 'openai'], deactivated: 1 });
  });

  it('takes video models only from the video catalog, with what each accepts and its cheapest price a second', async () => {
    // Veo 3.1 is in the general catalog but not the video one: it is withdrawn.
    const { db, writes } = recordingDb([{ model_name: 'google/veo-3.1' }]);
    const result = await new ModelCatalogSyncService(db, client(true) as unknown as OpenRouterClient).sync();

    const videos = writes.filter((w) => w.op === 'upsert' && w.values!.model_type === 'video-generation').map((w) => w.values!);
    expect(videos.map((v) => v.model_name)).toEqual(['google/veo-3.1-fast', 'bytedance/seedance-2.0-fast']);
    expect(videos[0]).toMatchObject({
      capabilities: ['text', 'image'],
      model_parameters_json: { video: { durations: [4, 6, 8], resolutions: ['720p', '1080p', '4K'], aspectRatios: ['16:9', '9:16'], generateAudio: true } },
      pricing_info_json: { per_second: 0.08, video_skus: videoCatalog[0]!.pricing_skus },
    });
    // Priced in tokens, not seconds: the per-second price is unknown, not zero.
    expect(videos[1]!.pricing_info_json).not.toHaveProperty('per_second');
    expect(videos[1]!.model_parameters_json).toMatchObject({ video: { generateAudio: false } });
    expect(writes.filter((w) => w.op === 'update').map((w) => w.filters)).toEqual([[['model_name', 'google/veo-3.1'], ['provider_name', 'openrouter']]]);
    expect(result.models).toBe(4);
  });
});
