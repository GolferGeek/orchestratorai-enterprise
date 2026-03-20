import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MatrixView from '../MatrixView.vue';

const selectPreset = vi.fn();

vi.mock('../../../stores/protocol.store', () => ({
  useProtocolStore: () => ({
    selectPreset,
  }),
}));

describe('MatrixView', () => {
  it('loads preset from matrix header click and displays loaded preset', async () => {
    const wrapper = mount(MatrixView);

    await wrapper.get('[data-testid="matrix-header-a2a"]').trigger('click');

    expect(selectPreset).toHaveBeenCalledWith('a2a-full');
    expect(wrapper.get('[data-testid="matrix-loaded-preset"]').text()).toContain('a2a-full');
  });

  it('shows provider details when a matrix cell is selected', async () => {
    const wrapper = mount(MatrixView);

    await wrapper.get('[data-testid="matrix-cell-payment-commerce"]').trigger('click');

    const details = wrapper.get('[data-testid="matrix-provider-details"]').text();
    expect(details).toContain('commerce-checkout');
    expect(details).toContain('payment');
  });
});
