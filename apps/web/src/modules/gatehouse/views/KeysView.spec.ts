import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { AgentKey } from '../types';

const api = vi.hoisted(() => ({ keys: vi.fn(), issueKey: vi.fn(), revokeKey: vi.fn() }));
vi.mock('../api', () => ({ gatehouseApi: api }));
vi.mock('@/shared/layout/ModulePage.vue', () => ({ default: { template: '<div><slot /></div>' } }));

import KeysView from './KeysView.vue';

const key: AgentKey = {
  id: 'g1', orgSlug: 'finance', agentName: 'Acme purchasing', accountRef: 'client-42', accountLabel: 'Acme Labs',
  kind: 'api_key', tokenPrefix: 'oak_AbCdEfGh', orderPolicy: 'approve_each', perOrderLimitCents: 50_000, monthlyLimitCents: null,
  rateLimitPerMinute: 60, validUntil: null, revokedAt: null, lastUsedAt: null, createdBy: 'admin:u1', createdAt: '2026-10-05T00:00:00Z',
};

describe('KeysView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists keys by their prefix and account, with the order policy and limits', async () => {
    api.keys.mockResolvedValue([key]);
    const wrapper = mount(KeysView);
    await flushPromises();
    const row = wrapper.find('[data-test="key-row"]').text();
    expect(row).toContain('Acme purchasing');
    expect(row).toContain('oak_AbCdEfGh…');
    expect(row).toContain('Acme Labs');
    expect(row).toContain('$500.00 an order · no limit a month');
    expect(row).toContain('active');
  });

  it('issues a key with limits in cents and shows it once', async () => {
    api.keys.mockResolvedValue([]);
    api.issueKey.mockResolvedValue({ grant: key, key: 'oak_the-secret' });
    const wrapper = mount(KeysView);
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Issue a key')!.trigger('click');
    const inputs = wrapper.findAll('form input');
    await inputs[0]!.setValue('Acme purchasing');
    await inputs[1]!.setValue('Acme Labs');
    await inputs[2]!.setValue('client-42');
    await inputs[3]!.setValue('$1,250.50');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(api.issueKey).toHaveBeenCalledWith({
      agentName: 'Acme purchasing', accountRef: 'client-42', accountLabel: 'Acme Labs',
      orderPolicy: 'approve_each', perOrderLimitCents: 125_050, monthlyLimitCents: null, validDays: 90,
    });
    expect(wrapper.find('[data-test="issued-key"]').text()).toContain('oak_the-secret');
  });

  it('refuses an amount that is not dollars instead of guessing', async () => {
    api.keys.mockResolvedValue([]);
    const wrapper = mount(KeysView);
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Issue a key')!.trigger('click');
    const inputs = wrapper.findAll('form input');
    await inputs[0]!.setValue('a');
    await inputs[1]!.setValue('b');
    await inputs[2]!.setValue('c');
    await inputs[3]!.setValue('lots');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(api.issueKey).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('"lots" is not an amount in dollars');
  });
});
