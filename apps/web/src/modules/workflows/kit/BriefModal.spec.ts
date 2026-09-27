import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { WorkflowBrief } from '@orchestrator-ai/transport-types';
import BriefModal from './BriefModal.vue';

const getBrief = vi.fn();
const getDoc = vi.fn();
vi.mock('./workflowDocsClient', () => ({
  workflowDocsClient: {
    getBrief: (...a: unknown[]) => getBrief(...a),
    getDoc: (...a: unknown[]) => getDoc(...a),
  },
}));

const brief: WorkflowBrief = {
  slug: 'decision-risk',
  title: 'Decision Risk',
  markdown: '**Ten** assessments.\n\n<img src=x onerror="alert(1)">',
  docs: ['user-guide', 'smoke-test'],
  showcase: [{ caseSlug: 'berlin-office', title: 'Berlin office', summary: 'A first office abroad.', input: { proposition: 'Open Berlin' } }],
};

const mountOpen = () =>
  mount(BriefModal, {
    props: { open: true, slug: 'decision-risk', orgSlug: 'corporate' },
    global: { stubs: { 'ion-modal': { template: '<div><slot /></div>' } } },
  });

describe('BriefModal', () => {
  it('renders the brief as sanitized markdown, with a tab per doc', async () => {
    getBrief.mockResolvedValue(brief);
    const wrapper = mountOpen();
    await flushPromises();
    expect(getBrief).toHaveBeenCalledWith('decision-risk', 'corporate');
    expect(wrapper.findAll('.tab').map((t) => t.text())).toEqual(['Overview', 'User guide', 'Examples', 'Smoke test']);
    const html = wrapper.find('.markdown').html();
    expect(html).toContain('<strong>Ten</strong>');
    expect(html).not.toContain('onerror');
  });

  it('loads a doc when its tab is opened', async () => {
    getBrief.mockResolvedValue(brief);
    getDoc.mockResolvedValue({ name: 'user-guide', markdown: '## Start a run' });
    const wrapper = mountOpen();
    await flushPromises();
    await wrapper.findAll('.tab')[1]!.trigger('click');
    await flushPromises();
    expect(getDoc).toHaveBeenCalledWith('decision-risk', 'user-guide', 'corporate');
    expect(wrapper.find('.markdown').html()).toContain('<h2>Start a run</h2>');
  });

  it('hands a chosen example back to the page', async () => {
    getBrief.mockResolvedValue(brief);
    const wrapper = mountOpen();
    await flushPromises();
    await wrapper.findAll('.tab')[2]!.trigger('click');
    await wrapper.find('.example ion-button').trigger('click');
    expect(wrapper.emitted('use-example')).toEqual([[brief.showcase[0]]]);
  });

  it('shows why the brief could not be read', async () => {
    getBrief.mockRejectedValue(new Error('Workflow decision-risk has no brief.md'));
    const wrapper = mountOpen();
    await flushPromises();
    expect(wrapper.find('.problem').text()).toContain('no brief.md');
  });
});
