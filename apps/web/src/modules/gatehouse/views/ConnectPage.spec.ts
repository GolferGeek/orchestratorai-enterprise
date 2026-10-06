import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = vi.hoisted(() => ({ describe: vi.fn(), allow: vi.fn(), deny: vi.fn() }));
vi.mock('../api', () => ({ consentApi: api }));
const query = { client_id: 'oac_1', redirect_uri: 'https://chat.example/cb', response_type: 'code', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 's1' };
vi.mock('vue-router', () => ({ useRoute: () => ({ query }) }));

import ConnectPage from './ConnectPage.vue';

describe('ConnectPage', () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { assign });
  });

  it('shows the app, preselects the only account, and allows with the limits in cents', async () => {
    api.describe.mockResolvedValue({ client: { name: 'ChatGPT', uri: null }, organizations: [{ slug: 'marketing', name: 'Marketing' }], orgSlug: 'marketing', accounts: [{ ref: 'user:u1', label: 'Pat' }] });
    api.allow.mockResolvedValue({ redirect: 'https://chat.example/cb?code=oaa_1&state=s1' });
    const wrapper = mount(ConnectPage);
    await flushPromises();
    expect(api.describe).toHaveBeenCalledWith(query, undefined);
    expect(wrapper.text()).toContain('Connect ChatGPT');
    const inputs = wrapper.findAll('input');
    await inputs[0]!.setValue('$250');
    await wrapper.find('[data-test="allow"]').trigger('click');
    await flushPromises();
    expect(api.allow).toHaveBeenCalledWith(query, {
      orgSlug: 'marketing', accountRef: 'user:u1', agentName: null, orderPolicy: 'approve_each', perOrderLimitCents: 25_000, monthlyLimitCents: null, validDays: 90,
    });
    expect(assign).toHaveBeenCalledWith('https://chat.example/cb?code=oaa_1&state=s1');
  });

  it('shows why a request cannot go ahead, and sends a bad one straight back to the app', async () => {
    api.describe.mockResolvedValueOnce({ show: 'This app is not registered. Connect again from your AI app.' });
    const shown = mount(ConnectPage);
    await flushPromises();
    expect(shown.find('[data-test="shown"]').text()).toContain('not registered');

    api.describe.mockResolvedValueOnce({ redirect: 'https://chat.example/cb?error=invalid_request' });
    mount(ConnectPage);
    await flushPromises();
    expect(assign).toHaveBeenCalledWith('https://chat.example/cb?error=invalid_request');
  });
});
