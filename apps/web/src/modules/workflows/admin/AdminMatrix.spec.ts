import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';
import AdminMatrix from './AdminMatrix.vue';

const api = { matrix: vi.fn(), saveMatrix: vi.fn() };
vi.mock('./workflowAdminApi', () => ({
  workflowAdminApi: { matrix: (...a: unknown[]) => api.matrix(...a), saveMatrix: (...a: unknown[]) => api.saveMatrix(...a) },
}));

const section: WorkflowAdminSectionView = {
  key: 'editor-weights', label: 'Editor weights', description: 'd', kind: 'matrix', idField: '', titleField: '', fields: [],
  canCreate: false, canUpdate: false, canDelete: false, bulk: null, matrix: { min: 0, max: 5, help: '0-5' },
};
const matrix = {
  columns: [{ key: 'hook', label: 'Hook' }, { key: 'cta', label: 'CTA' }],
  rows: [{ id: 'editor-brand', title: 'Brand', cells: { hook: 2, cta: 0 } }],
};

describe('AdminMatrix', () => {
  it('edits cells and saves every row together', async () => {
    api.matrix.mockResolvedValue(structuredClone(matrix));
    api.saveMatrix.mockResolvedValue({ ...matrix, rows: [{ ...matrix.rows[0]!, cells: { hook: 4, cta: 0 } }] });
    const wrapper = mount(AdminMatrix, { props: { slug: 'marketing-swarm', section } });
    await flushPromises();
    await wrapper.findAll('input')[0]!.setValue('4');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(api.saveMatrix).toHaveBeenCalledWith('marketing-swarm', 'editor-weights', [{ id: 'editor-brand', cells: { hook: 4, cta: 0 } }]);
    expect(wrapper.emitted('saved')?.[0]).toEqual(['Editor weights saved.']);
  });
});
