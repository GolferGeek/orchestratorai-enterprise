import { mapLLMModelFromDb } from '../case-converter';

describe('mapLLMModelFromDb', () => {
  const row = {
    provider_name: 'openrouter',
    vendor: 'black-forest-labs',
    model_name: 'black-forest-labs/flux.2-pro',
    display_name: 'FLUX.2 Pro',
    model_type: 'image-generation',
    is_active: true,
    capabilities: ['text', 'image'],
  };

  it('reads the prices the catalog stores (per 1k tokens, and per image)', () => {
    const model = mapLLMModelFromDb({ ...row, pricing_info_json: { input_per_1k: 0.00125, output_per_1k: 0.01, per_image: 0.03, source: 'openrouter' } });
    expect(model).toMatchObject({ pricingInputPer1k: 0.00125, pricingOutputPer1k: 0.01, pricingPerImage: 0.03, modelType: 'image-generation' });
  });

  it('leaves a price it was not given unknown, never zero', () => {
    const model = mapLLMModelFromDb({ ...row, pricing_info_json: null });
    expect(model.pricingInputPer1k).toBeUndefined();
    expect(model.pricingPerImage).toBeUndefined();
  });
});
