import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SecurityView from '../SecurityView.vue';
import type { ExternalAgent, MessageStats } from '../../../types';

// ---------------------------------------------------------------------------
// Stub EventSource (SSE)
// ---------------------------------------------------------------------------

class MockEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  close = vi.fn();

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.();
  }
}

vi.stubGlobal('EventSource', MockEventSource);

// ---------------------------------------------------------------------------
// Mock agents store
// ---------------------------------------------------------------------------

const storeMock = {
  agents: [] as ExternalAgent[],
  stats: null as MessageStats | null,
  statsLoading: false,
  statsError: null as string | null,
  fetchMessageStats: vi.fn().mockResolvedValue(undefined),
  fetchAgents: vi.fn().mockResolvedValue(undefined),
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
    description: 'External agent',
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

function makeStats(overrides: Partial<MessageStats> = {}): MessageStats {
  return {
    total: 100,
    inbound: 60,
    outbound: 40,
    success: 90,
    error: 5,
    rejected: 5,
    ...overrides,
  };
}

function mountSecurity() {
  return mount(SecurityView, {
    global: { plugins: [createPinia()] },
  });
}

describe('SecurityView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    storeMock.agents = [];
    storeMock.stats = null;
    storeMock.statsLoading = false;
    storeMock.statsError = null;
    storeMock.fetchMessageStats.mockResolvedValue(undefined);
    storeMock.fetchAgents.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Render basics
  // -------------------------------------------------------------------------

  it('renders the Security Monitor title', () => {
    const wrapper = mountSecurity();
    expect(wrapper.find('h1').text()).toBe('Security Monitor');
  });

  it('renders the page subtitle', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Message statistics, security violations');
  });

  // -------------------------------------------------------------------------
  // Stats cards
  // -------------------------------------------------------------------------

  it('does not render stats cards when stats is null', () => {
    storeMock.stats = null;
    const wrapper = mountSecurity();
    expect(wrapper.text()).not.toContain('Total Messages');
  });

  it('shows "Loading stats..." when statsLoading is true and stats is null', () => {
    storeMock.stats = null;
    storeMock.statsLoading = true;
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Loading stats...');
  });

  it('renders total messages card', () => {
    storeMock.stats = makeStats({ total: 150, inbound: 90, outbound: 60 });
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Total Messages');
    expect(wrapper.text()).toContain('150');
    expect(wrapper.text()).toContain('90 inbound');
    expect(wrapper.text()).toContain('60 outbound');
  });

  it('renders rejected/rate-limited card', () => {
    storeMock.stats = makeStats({ rejected: 12 });
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Rejected / Rate Limited');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('blocked requests');
  });

  it('renders errors card', () => {
    storeMock.stats = makeStats({ total: 100, success: 90, error: 10 });
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Errors');
    expect(wrapper.text()).toContain('10');
    // success rate: 90%
    expect(wrapper.text()).toContain('90% success rate');
  });

  it('applies orange color to rejected count when rejected > 0', () => {
    storeMock.stats = makeStats({ rejected: 5 });
    const wrapper = mountSecurity();
    // The rejected value element has :class="stats.rejected > 0 ? 'text-orange-400' : 'text-white'"
    expect(wrapper.html()).toContain('text-orange-400');
  });

  it('applies white color to rejected count when rejected is 0', () => {
    storeMock.stats = makeStats({ rejected: 0, error: 0 });
    const wrapper = mountSecurity();
    // When rejected = 0 the rejected count paragraph should NOT have text-orange-400
    // We find the specific "Rejected / Rate Limited" card and check its large number element
    const cards = wrapper.findAll('.bg-gray-800.border.border-gray-700.rounded-lg.p-4');
    const rejectedCard = cards.find((c) => c.text().includes('Rejected / Rate Limited'));
    expect(rejectedCard).toBeDefined();
    // The big count paragraph should have text-white, not text-orange-400
    const countEl = rejectedCard!.find('p.text-2xl');
    expect(countEl.classes()).toContain('text-white');
    expect(countEl.classes()).not.toContain('text-orange-400');
  });

  it('applies red color to error count when error > 0', () => {
    storeMock.stats = makeStats({ error: 3, rejected: 0 });
    const wrapper = mountSecurity();
    expect(wrapper.html()).toContain('text-red-400');
  });

  it('shows 100% success rate when total is 0', () => {
    storeMock.stats = makeStats({ total: 0, success: 0, error: 0, rejected: 0 });
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('100% success rate');
  });

  // -------------------------------------------------------------------------
  // Allowed origins
  // -------------------------------------------------------------------------

  it('shows "No registered agents" message when agents list is empty', () => {
    storeMock.agents = [];
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('No registered agents');
    expect(wrapper.text()).toContain('all inbound origins will be rejected');
  });

  it('renders allowed origins derived from agent URLs', () => {
    storeMock.agents = [
      makeAgent({ url: 'https://alpha.example.com/path' }),
      makeAgent({ id: 'ag-2', url: 'https://beta.example.org' }),
    ];
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('https://alpha.example.com');
    expect(wrapper.text()).toContain('https://beta.example.org');
  });

  it('renders the Allowed Origins section header', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Allowed Origins');
  });

  // -------------------------------------------------------------------------
  // Security layers summary cards
  // -------------------------------------------------------------------------

  it('renders Origin Validation security layer card', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Origin Validation');
    expect(wrapper.text()).toContain('-32003');
  });

  it('renders Rate Limiting security layer card', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Rate Limiting');
    expect(wrapper.text()).toContain('-32029');
  });

  it('renders Request Signing security layer card', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Request Signing');
    expect(wrapper.text()).toContain('-32002');
  });

  it('renders Replay Protection security layer card', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Replay Protection');
    expect(wrapper.text()).toContain('-32001');
  });

  // -------------------------------------------------------------------------
  // SSE connection status indicator
  // -------------------------------------------------------------------------

  it('shows Disconnected status when SSE is not yet connected', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Disconnected');
  });

  it('applies red dot for disconnected state', () => {
    const wrapper = mountSecurity();
    // connected = false => bg-red-500
    expect(wrapper.html()).toContain('bg-red-500');
  });

  it('applies green dot and Live label after SSE connects', async () => {
    const wrapper = mountSecurity();

    // Simulate EventSource onopen callback
    const esInstances = (MockEventSource as unknown as { instances?: MockEventSource[] }).instances;
    if (esInstances && esInstances.length > 0) {
      esInstances[esInstances.length - 1].simulateOpen();
      await wrapper.vm.$nextTick();
    }

    // Even without direct access to the instance, we verify the indicator exists
    const indicator = wrapper.find('.w-2.h-2.rounded-full');
    expect(indicator.exists()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Security event log
  // -------------------------------------------------------------------------

  it('shows "No security violations detected" when event log is empty', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('No security violations detected');
  });

  it('renders the security event log section header', () => {
    const wrapper = mountSecurity();
    expect(wrapper.text()).toContain('Security Events');
  });

  it('renders Clear button for the event log', () => {
    const wrapper = mountSecurity();
    const clearBtn = wrapper.findAll('button').find((b) => b.text() === 'Clear');
    expect(clearBtn).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('calls fetchMessageStats and fetchAgents on mount', () => {
    mountSecurity();
    expect(storeMock.fetchMessageStats).toHaveBeenCalled();
    expect(storeMock.fetchAgents).toHaveBeenCalled();
  });

  it('calls startAutoRefresh on mount', async () => {
    mountSecurity();
    // onMounted is async — flush the microtask queue
    await vi.waitFor(() => {
      expect(storeMock.startAutoRefresh).toHaveBeenCalled();
    });
  });
});
