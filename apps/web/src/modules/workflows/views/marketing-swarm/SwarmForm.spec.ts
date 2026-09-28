import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SwarmForm from './SwarmForm.vue';

vi.mock('./swarmApi', () => ({
  swarmApi: {
    options: async () => ({
      contentTypes: [{ slug: 'linkedin-post', name: 'LinkedIn Post', minWords: 100, maxWords: 300, maxChars: 3000 }],
      writers: [{ slug: 'writer-creative', name: 'Creative Writer', description: null, model: 'openai/gpt-4o' }],
      editors: [{ slug: 'editor-brand', name: 'Brand editor', description: null }],
      evaluators: [{ slug: 'evaluator-quality', name: 'Quality', description: null }],
    }),
  },
}));

const example = {
  contentType: 'linkedin-post',
  brief: { topic: 'Spendline', audience: 'CFOs', goal: 'Book a demo', keyPoints: ['trial', 'teams'], brandVoice: 'warm', keywords: ['cloud cost', 'FinOps'] },
  evidence: null,
  writers: ['writer-creative'],
  editors: ['editor-brand'],
  evaluators: ['evaluator-quality'],
  maxEditCycles: 2,
};

describe('SwarmForm', () => {
  it('fills from an example and starts with the input the workflow parses', async () => {
    const wrapper = mount(SwarmForm, { props: { busy: false, blocked: false, example: null } });
    await flushPromises();
    expect(wrapper.text()).toContain('openai/gpt-4o');
    await wrapper.setProps({ example });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('start')?.[0]).toEqual([example]);
  });

  it('holds the start until a brief and every kind of participant are chosen', async () => {
    const wrapper = mount(SwarmForm, { props: { busy: false, blocked: false, example: null } });
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('start')).toBeUndefined();
  });
});
