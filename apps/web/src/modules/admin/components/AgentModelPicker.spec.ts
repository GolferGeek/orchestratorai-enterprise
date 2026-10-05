import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AgentModelPicker from './AgentModelPicker.vue';
import type { AgentRegistryEntry } from '../services/platform-admin.service';

const getCatalogModels = vi.fn();
const setAgentModel = vi.fn();
const refreshModelCatalog = vi.fn();
vi.mock('../services/platform-admin.service', () => ({
  platformAdminService: {
    getCatalogModels: (...a: unknown[]) => getCatalogModels(...a),
    setAgentModel: (...a: unknown[]) => setAgentModel(...a),
    refreshModelCatalog: (...a: unknown[]) => refreshModelCatalog(...a),
  },
  apiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const agent: AgentRegistryEntry = {
  slug: 'infographic-agent', name: 'Infographic', description: '', agentType: 'media', product: 'database', orgSlug: 'marketing',
  config: { mediaType: 'image', format: 'svg' }, llmConfig: { provider: 'openrouter', model: 'openai/gpt-image-2' }, createdAt: '', updatedAt: '',
};
const catalog = [
  { modelName: 'openai/gpt-image-2', providerName: 'openrouter', vendor: 'openai', displayName: 'GPT Image 2', modelType: 'image-generation', isLocal: false },
  { modelName: 'recraft/recraft-v4.1-vector', providerName: 'openrouter', vendor: 'recraft', displayName: 'Recraft V4.1 Vector', modelType: 'image-generation', isLocal: false, pricePerImage: 0.08 },
];

describe('AgentModelPicker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the image models for an image agent, grouped by maker with the image price, and saves a choice', async () => {
    getCatalogModels.mockResolvedValue(catalog);
    setAgentModel.mockResolvedValue({ ...agent, llmConfig: { provider: 'openrouter', model: 'recraft/recraft-v4.1-vector' } });
    const wrapper = mount(AgentModelPicker, { props: { agent } });
    await flushPromises();

    expect(getCatalogModels).toHaveBeenCalledWith('image-generation');
    expect(wrapper.findAll('optgroup').map((g) => g.attributes('label'))).toEqual(['openai', 'recraft']);
    expect(wrapper.text()).toContain('Recraft V4.1 Vector — $0.080 per image');
    expect((wrapper.find('button.primary').element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.find('select').setValue('openrouter|recraft/recraft-v4.1-vector');
    await wrapper.find('button.primary').trigger('click');
    await flushPromises();
    expect(setAgentModel).toHaveBeenCalledWith('infographic-agent', 'openrouter', 'recraft/recraft-v4.1-vector');
    expect(wrapper.emitted('saved')?.[0]).toBeTruthy();
    expect(wrapper.text()).toContain('Infographic now runs on recraft/recraft-v4.1-vector.');
  });

  it('shows why a save was refused', async () => {
    getCatalogModels.mockResolvedValue(catalog);
    setAgentModel.mockRejectedValue(new Error('x makes text-generation; agent infographic-agent needs image-generation'));
    const wrapper = mount(AgentModelPicker, { props: { agent } });
    await flushPromises();
    await wrapper.find('select').setValue('openrouter|recraft/recraft-v4.1-vector');
    await wrapper.find('button.primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('.error').text()).toContain('needs image-generation');
  });

  it('prices video models by the second, and what one of the agent\'s clips costs', async () => {
    getCatalogModels.mockResolvedValue([
      { modelName: 'google/veo-3.1-fast', providerName: 'openrouter', vendor: 'google', displayName: 'Veo 3.1 Fast', modelType: 'video-generation', isLocal: false, pricePerSecond: 0.08 },
    ]);
    const video = { ...agent, slug: 'video-generator', config: { mediaType: 'video', duration: 4 }, llmConfig: { provider: 'openrouter', model: 'google/veo-3.1-fast' } };
    const wrapper = mount(AgentModelPicker, { props: { agent: video } });
    await flushPromises();
    expect(getCatalogModels).toHaveBeenCalledWith('video-generation');
    expect(wrapper.text()).toContain('Veo 3.1 Fast — from $0.080 a second (about $0.32 for 4 s)');
  });
});
