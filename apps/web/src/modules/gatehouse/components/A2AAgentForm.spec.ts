import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import A2AAgentForm from './A2AAgentForm.vue';

describe('A2AAgentForm', () => {
  it('creates a workflow agent with a text field and an allow list', async () => {
    const wrapper = mount(A2AAgentForm, { props: { creating: true } });
    const inputs = () => wrapper.findAll('input');
    await inputs()[0]!.setValue('request-review');
    await inputs()[1]!.setValue('Request a review');
    await wrapper.find('textarea').setValue('Send the submittal as text.');
    await wrapper.findAll('select')[0]!.setValue('workflow');
    await inputs()[2]!.setValue('submittal-review');
    await inputs()[3]!.setValue('submittalText');
    await wrapper.findAll('select')[1]!.setValue('allow');
    await wrapper.findAll('textarea').at(-1)!.setValue('https://partner.example/card\n\n');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      slug: 'request-review',
      name: 'Request a review',
      description: 'Send the submittal as text.',
      a2a: {
        target: { kind: 'workflow', workflowSlug: 'submittal-review', textField: 'submittalText' },
        callers: { allow: ['https://partner.example/card'] },
      },
    });
  });

  it('keeps a partner target\'s credential when editing, and refuses an empty allow list', async () => {
    const auth = { type: 'bearer', secret: 'PARTNER_TOKEN' };
    const wrapper = mount(A2AAgentForm, {
      props: {
        initial: {
          name: 'Ask CarGene',
          description: 'Car history',
          a2a: { target: { kind: 'a2a', cardUrl: 'https://car-gene.com/card', send: 'text', auth }, callers: 'any' },
        },
      },
    });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: 'Ask CarGene',
      description: 'Car history',
      a2a: { target: { kind: 'a2a', cardUrl: 'https://car-gene.com/card', send: 'text', auth }, callers: 'any' },
    });

    await wrapper.findAll('select').at(-1)!.setValue('allow');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(wrapper.text()).toContain('List at least one caller card URL');
  });

  it('says so when the fixed workflow input is not JSON', async () => {
    const wrapper = mount(A2AAgentForm, {
      props: { initial: { name: 'n', description: 'd', a2a: { target: { kind: 'workflow', workflowSlug: 'w' }, callers: 'any' } } },
    });
    await wrapper.findAll('textarea')[1]!.setValue('{not json');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('must be a JSON object');
  });
});
