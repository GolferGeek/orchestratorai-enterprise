import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import OutboundView from '../OutboundView.vue';
import type { ExternalAgent, A2AMessage } from '../../../types';

// ---------------------------------------------------------------------------
// Mock fetch for the direct POST /a2a/send call in OutboundView
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    status: ok ? 200 : 500,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Mock the agents store
// ---------------------------------------------------------------------------

const storeMock = {
  agents: [] as ExternalAgent[],
  messages: [] as A2AMessage[],
  loading: false,
  messagesLoading: false,
  fetchAgents: vi.fn().mockResolvedValue(undefined),
  fetchMessages: vi.fn().mockResolvedValue(undefined),
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
    description: 'An external agent',
    url: 'https://agent.example.com',
    version: '1.0.0',
    capabilities: [],
    status: 'online',
    lastSeen: new Date().toISOString(),
    trustScore: 80,
    trustLevel: 'trusted',
    interactions: 5,
    registeredAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<A2AMessage> = {}): A2AMessage {
  return {
    id: 'msg-1',
    org_slug: 'test-org',
    direction: 'outbound',
    external_agent_id: 'agent-1',
    method: 'compose.converse',
    status: 'success',
    duration_ms: 123,
    created_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function mountOutbound() {
  return mount(OutboundView, {
    global: { plugins: [createPinia()] },
  });
}

describe('OutboundView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    storeMock.agents = [];
    storeMock.messages = [];
    storeMock.loading = false;
    storeMock.messagesLoading = false;
    storeMock.fetchAgents.mockResolvedValue(undefined);
    storeMock.fetchMessages.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Render basics
  // -------------------------------------------------------------------------

  it('renders the Outbound A2A title', () => {
    const wrapper = mountOutbound();
    expect(wrapper.find('h1').text()).toBe('Outbound A2A');
  });

  it('renders the send form with select, method input, and params textarea', () => {
    const wrapper = mountOutbound();
    expect(wrapper.find('select').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('renders the "Select external agent..." default option', () => {
    const wrapper = mountOutbound();
    const defaultOption = wrapper.find('select option[value=""]');
    expect(defaultOption.exists()).toBe(true);
    expect(defaultOption.text()).toBe('Select external agent...');
  });

  // -------------------------------------------------------------------------
  // Send button disabled state
  // -------------------------------------------------------------------------

  it('Send button is disabled when targetAgentId and method are both empty', () => {
    const wrapper = mountOutbound();
    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    expect(sendBtn!.attributes('disabled')).toBeDefined();
  });

  it('Send button is disabled when only targetAgentId is set', async () => {
    storeMock.agents = [makeAgent({ id: 'ag-1', name: 'Agent One' })];
    const wrapper = mountOutbound();

    const select = wrapper.find('select');
    await select.setValue('ag-1');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    expect(sendBtn!.attributes('disabled')).toBeDefined();
  });

  it('Send button is disabled when only method is set', async () => {
    const wrapper = mountOutbound();

    const methodInput = wrapper.find('input[type="text"]');
    await methodInput.setValue('compose.converse');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    expect(sendBtn!.attributes('disabled')).toBeDefined();
  });

  it('Send button is enabled when both targetAgentId and method are set', async () => {
    storeMock.agents = [makeAgent({ id: 'ag-1', name: 'Agent One' })];
    const wrapper = mountOutbound();

    await wrapper.find('select').setValue('ag-1');
    await wrapper.find('input[type="text"]').setValue('compose.converse');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    expect(sendBtn!.attributes('disabled')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Agent options in select
  // -------------------------------------------------------------------------

  it('renders registered agents as options in the select', () => {
    storeMock.agents = [
      makeAgent({ id: 'ag-1', name: 'Alpha Agent' }),
      makeAgent({ id: 'ag-2', name: 'Beta Agent' }),
    ];
    const wrapper = mountOutbound();
    const options = wrapper.findAll('select option');
    // default blank + 2 agents
    expect(options).toHaveLength(3);
    expect(options[1].text()).toContain('Alpha Agent');
    expect(options[2].text()).toContain('Beta Agent');
  });

  it('shows "No agents registered" message when agents list is empty and not loading', () => {
    storeMock.agents = [];
    storeMock.loading = false;
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('No agents registered');
  });

  it('shows "Loading agents..." when store.loading is true', () => {
    storeMock.loading = true;
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('Loading agents...');
  });

  // -------------------------------------------------------------------------
  // Send request — success
  // -------------------------------------------------------------------------

  it('calls POST /a2a/send with correct payload and renders response', async () => {
    storeMock.agents = [makeAgent({ id: 'ag-1', name: 'Agent One' })];
    const responseData = { jsonrpc: '2.0', result: { content: 'OK' } };
    mockFetch.mockResolvedValue(makeJsonResponse(responseData));

    const wrapper = mountOutbound();

    await wrapper.find('select').setValue('ag-1');
    await wrapper.find('input[type="text"]').setValue('agent.analyze');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    await sendBtn!.trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Response');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/a2a/send'),
      expect.objectContaining({ method: 'POST' }),
    );
    // store.fetchMessages should be called after a successful send
    expect(storeMock.fetchMessages).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'outbound' }),
    );
  });

  it('shows send error when params JSON is invalid', async () => {
    storeMock.agents = [makeAgent({ id: 'ag-1', name: 'Agent One' })];
    const wrapper = mountOutbound();

    await wrapper.find('select').setValue('ag-1');
    await wrapper.find('input[type="text"]').setValue('compose.converse');
    await wrapper.find('textarea').setValue('{ invalid json }');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    await sendBtn!.trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Invalid JSON in params field');
    });
  });

  it('shows send error when fetch response is not ok', async () => {
    storeMock.agents = [makeAgent({ id: 'ag-1', name: 'Agent One' })];
    mockFetch.mockResolvedValue(makeJsonResponse({}, false));

    const wrapper = mountOutbound();
    await wrapper.find('select').setValue('ag-1');
    await wrapper.find('input[type="text"]').setValue('compose.converse');

    const sendBtn = wrapper.findAll('button').find((b) => b.text().includes('Send'));
    await sendBtn!.trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('HTTP 500');
    });
  });

  // -------------------------------------------------------------------------
  // Outbound message history table
  // -------------------------------------------------------------------------

  it('shows empty state when there are no outbound messages', () => {
    storeMock.messages = [];
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('No outbound messages recorded yet');
  });

  it('shows loading indicator when messagesLoading is true', () => {
    storeMock.messagesLoading = true;
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('Loading...');
  });

  it('renders the outbound message history table headers', () => {
    storeMock.messages = [makeMessage()];
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('Target Agent');
    expect(wrapper.text()).toContain('Method');
    expect(wrapper.text()).toContain('Status');
    expect(wrapper.text()).toContain('Duration');
  });

  it('renders message rows with correct data', () => {
    storeMock.messages = [
      makeMessage({
        external_agent_id: 'agent-abc',
        method: 'compose.converse',
        status: 'success',
        duration_ms: 250,
      }),
    ];
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('agent-abc');
    expect(wrapper.text()).toContain('compose.converse');
    expect(wrapper.text()).toContain('success');
    expect(wrapper.text()).toContain('250ms');
  });

  it('renders record count in the history header', () => {
    storeMock.messages = [makeMessage(), makeMessage({ id: 'msg-2' })];
    const wrapper = mountOutbound();
    expect(wrapper.text()).toContain('2 records');
  });

  // -------------------------------------------------------------------------
  // Status badge coloring
  // -------------------------------------------------------------------------

  it('applies green badge class for success status', () => {
    storeMock.messages = [makeMessage({ status: 'success' })];
    const wrapper = mountOutbound();
    expect(wrapper.html()).toContain('bg-green-900');
    expect(wrapper.html()).toContain('text-green-300');
  });

  it('applies red badge class for error status', () => {
    storeMock.messages = [makeMessage({ status: 'error' })];
    const wrapper = mountOutbound();
    expect(wrapper.html()).toContain('bg-red-900');
    expect(wrapper.html()).toContain('text-red-300');
  });

  it('applies orange badge class for rejected status', () => {
    storeMock.messages = [makeMessage({ status: 'rejected' })];
    const wrapper = mountOutbound();
    expect(wrapper.html()).toContain('bg-orange-900');
    expect(wrapper.html()).toContain('text-orange-300');
  });

  it('applies yellow badge class for rate_limited status', () => {
    storeMock.messages = [makeMessage({ status: 'rate_limited' })];
    const wrapper = mountOutbound();
    expect(wrapper.html()).toContain('bg-yellow-900');
    expect(wrapper.html()).toContain('text-yellow-300');
  });

  it('applies blue badge class for pending status', () => {
    storeMock.messages = [makeMessage({ status: 'pending' })];
    const wrapper = mountOutbound();
    expect(wrapper.html()).toContain('bg-blue-900');
    expect(wrapper.html()).toContain('text-blue-300');
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('calls fetchAgents, fetchMessages, and startAutoRefresh on mount', async () => {
    mountOutbound();
    // onMounted uses Promise.all then startAutoRefresh — drain microtasks for each
    await vi.waitFor(() => {
      expect(storeMock.fetchAgents).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(storeMock.fetchMessages).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'outbound' }),
      );
    });
    await vi.waitFor(() => {
      expect(storeMock.startAutoRefresh).toHaveBeenCalled();
    });
  });
});
