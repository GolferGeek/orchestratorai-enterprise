import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HomeView from '../HomeView.vue';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Router stub (HomeView uses <router-link>)
// ---------------------------------------------------------------------------

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomeView },
      { path: '/registry', component: { template: '<div/>' } },
      { path: '/inbound', component: { template: '<div/>' } },
      { path: '/outbound', component: { template: '<div/>' } },
      { path: '/security', component: { template: '<div/>' } },
    ],
  });
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Bridge title and subtitle badge', async () => {
    // Prevent onMounted fetch from resolving during this test
    mockFetch.mockResolvedValue(makeJsonResponse({}, false));

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    expect(wrapper.find('h1').text()).toBe('Bridge');
    expect(wrapper.text()).toContain('External A2A Gateway');
    expect(wrapper.text()).toContain(
      'Bridge handles inbound and outbound agent-to-agent communication',
    );
  });

  it('shows Checking... for API status before fetch resolves', async () => {
    // fetch never resolves during the synchronous render
    mockFetch.mockReturnValue(new Promise(() => {}));

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    expect(wrapper.text()).toContain('Checking...');
    expect(wrapper.text()).toContain('API Status');
  });

  it('shows Online when health fetch returns ok', async () => {
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes('/health')) {
        return Promise.resolve(makeJsonResponse({ port: 6600 }));
      }
      if ((url as string).includes('/registry/agents')) {
        return Promise.resolve(makeJsonResponse([]));
      }
      if ((url as string).includes('/stream/status')) {
        return Promise.resolve(makeJsonResponse({ clients: 0 }));
      }
      return Promise.resolve(makeJsonResponse({}, false));
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    // Wait for all three parallel fetches to complete
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Online');
    });

    expect(wrapper.text()).toContain('Port 6600');
  });

  it('shows the agent count returned from the registry endpoint', async () => {
    const agents = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];

    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes('/health')) {
        return Promise.resolve(makeJsonResponse({ port: 6600 }));
      }
      if ((url as string).includes('/registry/agents')) {
        return Promise.resolve(makeJsonResponse(agents));
      }
      if ((url as string).includes('/stream/status')) {
        return Promise.resolve(makeJsonResponse({ clients: 0 }));
      }
      return Promise.resolve(makeJsonResponse({}, false));
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('3');
    });

    expect(wrapper.text()).toContain('External Agents');
    expect(wrapper.text()).toContain('registered in registry');
  });

  it('shows the SSE client count returned from stream/status', async () => {
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes('/health')) {
        return Promise.resolve(makeJsonResponse({ port: 6600 }));
      }
      if ((url as string).includes('/registry/agents')) {
        return Promise.resolve(makeJsonResponse([]));
      }
      if ((url as string).includes('/stream/status')) {
        return Promise.resolve(makeJsonResponse({ clients: 7 }));
      }
      return Promise.resolve(makeJsonResponse({}, false));
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('7');
    });

    expect(wrapper.text()).toContain('SSE Clients');
    expect(wrapper.text()).toContain('monitoring Bridge stream');
  });

  it('renders all four navigation links', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    const links = wrapper.findAll('a');
    const hrefs = links.map((l) => l.attributes('href'));
    expect(hrefs).toContain('/registry');
    expect(hrefs).toContain('/inbound');
    expect(hrefs).toContain('/outbound');
    expect(hrefs).toContain('/security');
  });

  it('renders the External A2A Flow diagram section', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    expect(wrapper.text()).toContain('External A2A Flow');
    expect(wrapper.text()).toContain('Bridge Validator');
    expect(wrapper.text()).toContain('JSON-RPC 2.0 Response');
  });

  it('does not show Port info when health fetch fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes('/health')) {
        return Promise.resolve(makeJsonResponse({}, false)); // not ok
      }
      if ((url as string).includes('/registry/agents')) {
        return Promise.resolve(makeJsonResponse([]));
      }
      if ((url as string).includes('/stream/status')) {
        return Promise.resolve(makeJsonResponse({ clients: 0 }));
      }
      return Promise.resolve(makeJsonResponse({}, false));
    });

    const wrapper = mount(HomeView, {
      global: { plugins: [makeRouter()] },
    });

    // Give promises time to settle
    await Promise.resolve();
    await Promise.resolve();

    // health is null, so Port should not appear
    expect(wrapper.text()).not.toContain('Port');
  });
});
