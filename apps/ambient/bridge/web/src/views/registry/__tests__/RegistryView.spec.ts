import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RegistryView from '../RegistryView.vue';
import type { ExternalAgent } from '../../../types';

// ---------------------------------------------------------------------------
// Mock the agents store module entirely
// ---------------------------------------------------------------------------

const storeMock = {
  agents: [] as ExternalAgent[],
  loading: false,
  error: null as string | null,
  fetchAgents: vi.fn().mockResolvedValue(undefined),
  discoverAgent: vi.fn(),
  removeAgent: vi.fn().mockResolvedValue(undefined),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
};

vi.mock('../../../stores/agents.store', () => ({
  useAgentsStore: () => storeMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<ExternalAgent> = {}): ExternalAgent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test external agent',
    url: 'https://agent.example.com',
    version: '1.0.0',
    capabilities: ['compose.converse'],
    status: 'online',
    lastSeen: new Date().toISOString(),
    trustScore: 80,
    trustLevel: 'trusted',
    interactions: 42,
    registeredAt: new Date().toISOString(),
    ...overrides,
  };
}

function mountRegistry() {
  return mount(RegistryView, {
    global: { plugins: [createPinia()] },
  });
}

describe('RegistryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset store state to defaults
    storeMock.agents = [];
    storeMock.loading = false;
    storeMock.error = null;
    storeMock.fetchAgents.mockResolvedValue(undefined);
    storeMock.discoverAgent.mockResolvedValue(undefined);
    storeMock.removeAgent.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Render basics
  // -------------------------------------------------------------------------

  it('renders the page title', () => {
    const wrapper = mountRegistry();
    expect(wrapper.find('h1').text()).toBe('External Agent Registry');
  });

  it('shows agent count in the header', () => {
    storeMock.agents = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Second Agent' })];
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('2 agents registered');
  });

  // -------------------------------------------------------------------------
  // Empty / loading states
  // -------------------------------------------------------------------------

  it('shows empty state message when no agents are registered', () => {
    storeMock.agents = [];
    storeMock.loading = false;
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('No external agents registered yet');
  });

  it('shows loading message when loading is true and agents list is empty', () => {
    storeMock.agents = [];
    storeMock.loading = true;
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('Loading agents...');
  });

  it('shows store error when present', () => {
    storeMock.error = 'Network error occurred';
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('Network error occurred');
  });

  // -------------------------------------------------------------------------
  // Agent list
  // -------------------------------------------------------------------------

  it('renders each registered agent name and description', () => {
    storeMock.agents = [
      makeAgent({ name: 'Alpha Agent', description: 'Does alpha things' }),
      makeAgent({ id: 'agent-2', name: 'Beta Agent', description: 'Does beta things' }),
    ];
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('Alpha Agent');
    expect(wrapper.text()).toContain('Does alpha things');
    expect(wrapper.text()).toContain('Beta Agent');
    expect(wrapper.text()).toContain('Does beta things');
  });

  it('renders agent url, version, capabilities, and trust info', () => {
    storeMock.agents = [
      makeAgent({
        url: 'https://example.com',
        version: '2.1.0',
        capabilities: ['invoke', 'stream'],
        trustScore: 75,
        trustLevel: 'neutral',
        interactions: 10,
      }),
    ];
    const wrapper = mountRegistry();
    expect(wrapper.text()).toContain('https://example.com');
    expect(wrapper.text()).toContain('v2.1.0');
    expect(wrapper.text()).toContain('invoke');
    expect(wrapper.text()).toContain('stream');
    expect(wrapper.text()).toContain('75/100');
    expect(wrapper.text()).toContain('neutral');
    expect(wrapper.text()).toContain('10 interactions');
  });

  it('renders a Remove button for each agent', () => {
    storeMock.agents = [makeAgent(), makeAgent({ id: 'agent-2', name: 'Agent Two' })];
    const wrapper = mountRegistry();
    const removeButtons = wrapper.findAll('button').filter((b) => b.text() === 'Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('calls store.removeAgent with the agent id when Remove is clicked', async () => {
    storeMock.agents = [makeAgent({ id: 'delete-me' })];
    const wrapper = mountRegistry();
    const removeBtn = wrapper.findAll('button').find((b) => b.text() === 'Remove');
    await removeBtn!.trigger('click');
    expect(storeMock.removeAgent).toHaveBeenCalledWith('delete-me');
  });

  // -------------------------------------------------------------------------
  // Status badge classes
  // -------------------------------------------------------------------------

  it('applies online badge class for online agent', () => {
    storeMock.agents = [makeAgent({ status: 'online' })];
    const wrapper = mountRegistry();
    expect(wrapper.html()).toContain('bg-green-900');
    expect(wrapper.html()).toContain('text-green-300');
  });

  it('applies offline badge class for offline agent', () => {
    storeMock.agents = [makeAgent({ status: 'offline' })];
    const wrapper = mountRegistry();
    expect(wrapper.html()).toContain('bg-red-900');
    expect(wrapper.html()).toContain('text-red-300');
  });

  // -------------------------------------------------------------------------
  // Discovery form
  // -------------------------------------------------------------------------

  it('renders the discovery form input and button', () => {
    const wrapper = mountRegistry();
    expect(wrapper.find('input[type="url"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Discover');
  });

  it('Discover button is disabled when input is empty', () => {
    const wrapper = mountRegistry();
    const discoverBtn = wrapper.findAll('button').find((b) => b.text().includes('Discover'));
    expect(discoverBtn!.attributes('disabled')).toBeDefined();
  });

  it('calls store.discoverAgent with the entered URL on button click', async () => {
    const agent = makeAgent({ name: 'Discovered Agent', id: 'disc-1' });
    storeMock.discoverAgent.mockResolvedValue(agent);

    const wrapper = mountRegistry();
    const input = wrapper.find('input[type="url"]');
    await input.setValue('https://new-agent.example.com');

    const discoverBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Discover'),
    );
    await discoverBtn!.trigger('click');

    expect(storeMock.discoverAgent).toHaveBeenCalledWith('https://new-agent.example.com');
  });

  it('shows success message after successful discovery', async () => {
    const agent = makeAgent({ name: 'Found Agent', id: 'found-1' });
    storeMock.discoverAgent.mockResolvedValue(agent);

    const wrapper = mountRegistry();
    const input = wrapper.find('input[type="url"]');
    await input.setValue('https://found.example.com');

    const discoverBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Discover'),
    );
    await discoverBtn!.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Registered Found Agent');
    });
  });

  it('shows error message when discoverAgent throws', async () => {
    storeMock.discoverAgent.mockRejectedValue(new Error('Connection refused'));

    const wrapper = mountRegistry();
    const input = wrapper.find('input[type="url"]');
    await input.setValue('https://bad-agent.example.com');

    const discoverBtn = wrapper.findAll('button').find((b) =>
      b.text().includes('Discover'),
    );
    await discoverBtn!.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Connection refused');
    });
  });

  it('calls store.discoverAgent when Enter is pressed in the input', async () => {
    const agent = makeAgent();
    storeMock.discoverAgent.mockResolvedValue(agent);

    const wrapper = mountRegistry();
    const input = wrapper.find('input[type="url"]');
    await input.setValue('https://enter.example.com');
    await input.trigger('keydown.enter');

    expect(storeMock.discoverAgent).toHaveBeenCalledWith('https://enter.example.com');
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('calls fetchAgents and startAutoRefresh on mount', async () => {
    mountRegistry();
    // onMounted is async: await loadAgents() then startAutoRefresh()
    // waitFor both individually so the microtask queue drains fully
    await vi.waitFor(() => {
      expect(storeMock.fetchAgents).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(storeMock.startAutoRefresh).toHaveBeenCalled();
    });
  });

  it('calls loadAgents when Refresh button is clicked', async () => {
    const wrapper = mountRegistry();
    const refreshBtn = wrapper.findAll('button').find((b) => b.text() === 'Refresh');
    await refreshBtn!.trigger('click');
    // fetchAgents is called once on mount + once on Refresh
    expect(storeMock.fetchAgents).toHaveBeenCalledTimes(2);
  });
});
