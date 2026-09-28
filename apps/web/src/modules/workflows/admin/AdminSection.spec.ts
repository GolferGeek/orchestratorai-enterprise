import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';
import AdminSection from './AdminSection.vue';

const api = { rows: vi.fn(), create: vi.fn(), update: vi.fn(), saveAll: vi.fn(), remove: vi.fn() };
vi.mock('./workflowAdminApi', () => ({
  workflowAdminApi: {
    rows: (...a: unknown[]) => api.rows(...a),
    create: (...a: unknown[]) => api.create(...a),
    update: (...a: unknown[]) => api.update(...a),
    saveAll: (...a: unknown[]) => api.saveAll(...a),
    remove: (...a: unknown[]) => api.remove(...a),
  },
}));

const dimensions: WorkflowAdminSectionView = {
  key: 'dimensions',
  label: 'Dimensions',
  description: 'The risk dimensions.',
  kind: 'list',
  idField: 'slug',
  titleField: 'name',
  fields: [
    { key: 'slug', label: 'Slug', kind: 'text', required: true, readOnly: true },
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'weight', label: 'Weight', kind: 'number', required: true, min: 0, max: 1 },
    { key: 'active', label: 'Active', kind: 'boolean', required: true },
    { key: 'prompt', label: 'Prompt', kind: 'textarea', required: true },
  ],
  canCreate: false,
  canUpdate: true,
  canDelete: false,
  bulk: { label: 'Weights', fields: ['weight', 'active'] },
  matrix: null,
};

const rows = [
  { slug: 'legal', name: 'Legal', weight: 0.6, active: true, prompt: 'Assess legal.' },
  { slug: 'market', name: 'Market', weight: 0.4, active: true, prompt: 'Assess market.' },
];

describe('AdminSection', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.rows.mockResolvedValue({ rows });
  });

  it('edits the bulk fields of every row together, with a running total of the active weights', async () => {
    api.saveAll.mockResolvedValue({ rows });
    const wrapper = mount(AdminSection, { props: { slug: 'decision-risk', section: dimensions } });
    await flushPromises();
    expect(wrapper.findAll('.row-head').map((r) => r.find('strong').text())).toEqual(['Legal', 'Market']);

    await wrapper.findAll('.toolbar ion-button').find((b) => b.text() === 'Edit weights')!.trigger('click');
    const inputs = wrapper.findAll('.bulk input[type="number"]');
    await inputs[0]!.setValue('0.7');
    expect(wrapper.find('.totals').text()).toContain('1.10');
    await inputs[1]!.setValue('0.3');
    expect(wrapper.find('.totals').text()).toContain('1.00');

    await wrapper.find('form.bulk').trigger('submit');
    await flushPromises();
    expect(api.saveAll).toHaveBeenCalledWith('decision-risk', 'dimensions', [
      { id: 'legal', row: { weight: 0.7, active: true } },
      { id: 'market', row: { weight: 0.3, active: true } },
    ]);
    expect(wrapper.emitted('saved')?.[0]).toEqual(['Weights saved.']);
  });

  it('opens a row to edit it, with the bulk fields shown but edited under their table', async () => {
    api.update.mockResolvedValue(rows[0]);
    const wrapper = mount(AdminSection, { props: { slug: 'decision-risk', section: dimensions } });
    await flushPromises();
    await wrapper.findAll('.row-head')[0]!.trigger('click');
    const editor = wrapper.find('form.editor');
    expect(editor.text()).toContain('Edited under Weights');
    await editor.find('textarea').setValue('Assess legal, citing statutes.');
    await editor.trigger('submit');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith('decision-risk', 'dimensions', 'legal', expect.objectContaining({ prompt: 'Assess legal, citing statutes.' }));
  });

  it("shows the server's reason when a save is refused", async () => {
    api.saveAll.mockRejectedValue(new Error('The active weights add up to 1.20; they must add up to 1.00'));
    const wrapper = mount(AdminSection, { props: { slug: 'decision-risk', section: dimensions } });
    await flushPromises();
    await wrapper.findAll('.toolbar ion-button').find((b) => b.text() === 'Edit weights')!.trigger('click');
    await wrapper.find('form.bulk').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.problem').text()).toContain('add up to 1.20');
  });
});
