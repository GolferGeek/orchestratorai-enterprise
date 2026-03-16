import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProtocolMatrix from '../ProtocolMatrix.vue';
import { PROTOCOL_LAYERS } from '../../../types';

describe('ProtocolMatrix', () => {
  it('renders all protocol layers and suite columns', () => {
    const wrapper = mount(ProtocolMatrix);
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(PROTOCOL_LAYERS.length);

    const headerCells = wrapper.findAll('thead th');
    expect(headerCells).toHaveLength(6); // layer + 5 suite columns
  });

  it('emits load-preset when a suite header is clicked', async () => {
    const wrapper = mount(ProtocolMatrix);
    await wrapper.get('[data-testid="matrix-header-a2a"]').trigger('click');

    const emits = wrapper.emitted('load-preset');
    expect(emits).toBeTruthy();
    expect(emits?.[0]).toEqual(['a2a-full']);
  });

  it('emits select-cell for implemented provider cell clicks', async () => {
    const wrapper = mount(ProtocolMatrix);
    await wrapper.get('[data-testid="matrix-cell-transport-a2a"]').trigger('click');

    const emits = wrapper.emitted('select-cell');
    expect(emits).toBeTruthy();
    expect(emits?.[0]?.[0]).toMatchObject({
      layer: 'transport',
      suiteId: 'a2a',
      provider: 'a2a-jsonrpc',
      status: 'implemented',
    });
  });
});
