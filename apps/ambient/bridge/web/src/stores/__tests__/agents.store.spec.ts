import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// --- Mock useApi before importing the store ---

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDel = vi.fn();

vi.mock('../../composables/useApi', () => ({
  useApi: () => ({
    bridgeApi: {
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      del: mockDel,
    },
  }),
}));

import { useAgentsStore } from '../agents.store';
import type { AgentInfo, A2AMessage, MessageStats } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAgent(id: string): AgentInfo {
  return {
    card: {
      id,
      name: `Agent ${id}`,
      description: 'test agent',
      url: `http://agent-${id}.test`,
      version: '1.0.0',
      capabilities: [],
      endpoints: [],
    },
    status: 'online',
    lastHeartbeat: new Date().toISOString(),
    messagesReceived: 0,
    messagesSent: 0,
  };
}

function makeMessage(id: string): A2AMessage {
  return {
    id,
    org_slug: 'test-org',
    direction: 'inbound',
    status: 'success',
    created_at: new Date().toISOString(),
  };
}

function makeStats(): MessageStats {
  return {
    total: 42,
    inbound: 20,
    outbound: 22,
    success: 38,
    error: 3,
    rejected: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // fetchAgents
  // -------------------------------------------------------------------------

  describe('fetchAgents', () => {
    it('populates agents on success', async () => {
      const agentList = [makeAgent('a1'), makeAgent('a2')];
      mockGet.mockResolvedValue(agentList);
      const store = useAgentsStore();

      await store.fetchAgents();

      expect(store.agents).toEqual(agentList);
      expect(store.error).toBeNull();
    });

    it('sets loading to true while fetching, then false after', async () => {
      let resolveGet!: (v: AgentInfo[]) => void;
      mockGet.mockReturnValue(new Promise<AgentInfo[]>((r) => { resolveGet = r; }));
      const store = useAgentsStore();

      const promise = store.fetchAgents();
      expect(store.loading).toBe(true);

      resolveGet([]);
      await promise;

      expect(store.loading).toBe(false);
    });

    it('resets loading to false even on error', async () => {
      mockGet.mockRejectedValue(new Error('network failure'));
      const store = useAgentsStore();

      await expect(store.fetchAgents()).rejects.toThrow('network failure');

      expect(store.loading).toBe(false);
    });

    it('sets error state on failure and re-throws', async () => {
      mockGet.mockRejectedValue(new Error('fetch failed'));
      const store = useAgentsStore();

      await expect(store.fetchAgents()).rejects.toThrow('fetch failed');

      expect(store.error).toBe('fetch failed');
    });

    it('clears error before fetching', async () => {
      const store = useAgentsStore();
      store.error = 'stale error';
      mockGet.mockResolvedValue([]);

      await store.fetchAgents();

      expect(store.error).toBeNull();
    });

    it('calls the correct API path', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      await store.fetchAgents();

      expect(mockGet).toHaveBeenCalledWith('/registry/agents');
    });
  });

  // -------------------------------------------------------------------------
  // discoverAgent
  // -------------------------------------------------------------------------

  describe('discoverAgent', () => {
    it('appends the discovered agent to the agents array', async () => {
      const existing = makeAgent('existing');
      const discovered = makeAgent('new');
      mockGet.mockResolvedValue([existing]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockPost.mockResolvedValue(discovered);
      await store.discoverAgent('http://new-agent.test');

      expect(store.agents).toHaveLength(2);
      expect(store.agents[1]).toEqual(discovered);
    });

    it('returns the discovered agent', async () => {
      const agent = makeAgent('ret-1');
      mockPost.mockResolvedValue(agent);
      const store = useAgentsStore();

      const result = await store.discoverAgent('http://agent.test');

      expect(result).toEqual(agent);
    });

    it('posts to the correct path with the url payload', async () => {
      const agent = makeAgent('post-test');
      mockPost.mockResolvedValue(agent);
      const store = useAgentsStore();

      await store.discoverAgent('http://target.test');

      expect(mockPost).toHaveBeenCalledWith('/registry/agents/discover', { url: 'http://target.test' });
    });

    it('sets error and re-throws on failure', async () => {
      mockPost.mockRejectedValue(new Error('discover failed'));
      const store = useAgentsStore();

      await expect(store.discoverAgent('http://bad.test')).rejects.toThrow('discover failed');

      expect(store.error).toBe('discover failed');
    });

    it('resets loading to false after failure', async () => {
      mockPost.mockRejectedValue(new Error('oops'));
      const store = useAgentsStore();

      await expect(store.discoverAgent('http://x')).rejects.toThrow();

      expect(store.loading).toBe(false);
    });

    it('sets loading true during request then false after', async () => {
      let resolve!: (v: AgentInfo) => void;
      mockPost.mockReturnValue(new Promise<AgentInfo>((r) => { resolve = r; }));
      const store = useAgentsStore();

      const p = store.discoverAgent('http://x');
      expect(store.loading).toBe(true);
      resolve(makeAgent('x'));
      await p;
      expect(store.loading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // removeAgent
  // -------------------------------------------------------------------------

  describe('removeAgent', () => {
    it('removes the agent with the matching id from the array', async () => {
      const a1 = makeAgent('r1');
      const a2 = makeAgent('r2');
      mockGet.mockResolvedValue([a1, a2]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockDel.mockResolvedValue(undefined);
      await store.removeAgent('r1');

      expect(store.agents).toHaveLength(1);
      expect(store.agents[0]).toEqual(a2);
    });

    it('calls the correct delete path', async () => {
      mockGet.mockResolvedValue([makeAgent('del-me')]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockDel.mockResolvedValue(undefined);
      await store.removeAgent('del-me');

      expect(mockDel).toHaveBeenCalledWith('/registry/agents/del-me');
    });

    it('sets error and re-throws on failure', async () => {
      mockGet.mockResolvedValue([makeAgent('e1')]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockDel.mockRejectedValue(new Error('delete error'));

      await expect(store.removeAgent('e1')).rejects.toThrow('delete error');
      expect(store.error).toBe('delete error');
    });

    it('resets loading to false after failure', async () => {
      mockGet.mockResolvedValue([makeAgent('e2')]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockDel.mockRejectedValue(new Error('fail'));
      await expect(store.removeAgent('e2')).rejects.toThrow();
      expect(store.loading).toBe(false);
    });

    it('leaves agents array unchanged when removal fails', async () => {
      const agent = makeAgent('keep');
      mockGet.mockResolvedValue([agent]);
      const store = useAgentsStore();
      await store.fetchAgents();

      mockDel.mockRejectedValue(new Error('fail'));
      await expect(store.removeAgent('keep')).rejects.toThrow();

      expect(store.agents).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // refreshStatuses
  // -------------------------------------------------------------------------

  describe('refreshStatuses', () => {
    it('replaces agents array with fresh data', async () => {
      const initial = [makeAgent('s1'), makeAgent('s2')];
      mockGet.mockResolvedValueOnce(initial);
      const store = useAgentsStore();
      await store.fetchAgents();

      const updated = [makeAgent('s1')];
      mockGet.mockResolvedValueOnce(updated);
      await store.refreshStatuses();

      expect(store.agents).toEqual(updated);
    });

    it('sets error and re-throws on failure', async () => {
      mockGet.mockRejectedValue(new Error('status error'));
      const store = useAgentsStore();

      await expect(store.refreshStatuses()).rejects.toThrow('status error');
      expect(store.error).toBe('status error');
    });

    it('calls the same registry path as fetchAgents', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      await store.refreshStatuses();

      expect(mockGet).toHaveBeenCalledWith('/registry/agents');
    });

    it('does not touch loading flag (unlike fetchAgents)', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      // loading should remain false before and after — refreshStatuses has no loading guard
      await store.refreshStatuses();

      expect(store.loading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // fetchMessages
  // -------------------------------------------------------------------------

  describe('fetchMessages', () => {
    it('populates messages on success without filters', async () => {
      const list = [makeMessage('m1'), makeMessage('m2')];
      mockGet.mockResolvedValue(list);
      const store = useAgentsStore();

      await store.fetchMessages();

      expect(store.messages).toEqual(list);
      expect(mockGet).toHaveBeenCalledWith('/a2a/messages');
    });

    it('appends query params from filters', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      await store.fetchMessages({ direction: 'inbound', limit: 10 });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toContain('/a2a/messages?');
      expect(path).toContain('direction=inbound');
      expect(path).toContain('limit=10');
    });

    it('ignores undefined filter values', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      await store.fetchMessages({ direction: 'inbound', agentId: undefined });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).not.toContain('agentId');
    });

    it('sets messagesLoading true during request then false after', async () => {
      let resolve!: (v: A2AMessage[]) => void;
      mockGet.mockReturnValue(new Promise<A2AMessage[]>((r) => { resolve = r; }));
      const store = useAgentsStore();

      const p = store.fetchMessages();
      expect(store.messagesLoading).toBe(true);
      resolve([]);
      await p;
      expect(store.messagesLoading).toBe(false);
    });

    it('sets messagesError and re-throws on failure', async () => {
      mockGet.mockRejectedValue(new Error('msg error'));
      const store = useAgentsStore();

      await expect(store.fetchMessages()).rejects.toThrow('msg error');
      expect(store.messagesError).toBe('msg error');
      expect(store.messagesLoading).toBe(false);
    });

    it('clears messagesError before fetching', async () => {
      const store = useAgentsStore();
      store.messagesError = 'old error';
      mockGet.mockResolvedValue([]);

      await store.fetchMessages();

      expect(store.messagesError).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // fetchMessageStats
  // -------------------------------------------------------------------------

  describe('fetchMessageStats', () => {
    it('populates stats on success', async () => {
      const s = makeStats();
      mockGet.mockResolvedValue(s);
      const store = useAgentsStore();

      await store.fetchMessageStats();

      expect(store.stats).toEqual(s);
      expect(store.statsError).toBeNull();
    });

    it('calls the correct API path', async () => {
      mockGet.mockResolvedValue(makeStats());
      const store = useAgentsStore();

      await store.fetchMessageStats();

      expect(mockGet).toHaveBeenCalledWith('/a2a/messages/stats');
    });

    it('sets statsLoading true during request then false after', async () => {
      let resolve!: (v: MessageStats) => void;
      mockGet.mockReturnValue(new Promise<MessageStats>((r) => { resolve = r; }));
      const store = useAgentsStore();

      const p = store.fetchMessageStats();
      expect(store.statsLoading).toBe(true);
      resolve(makeStats());
      await p;
      expect(store.statsLoading).toBe(false);
    });

    it('sets statsError and re-throws on failure', async () => {
      mockGet.mockRejectedValue(new Error('stats error'));
      const store = useAgentsStore();

      await expect(store.fetchMessageStats()).rejects.toThrow('stats error');
      expect(store.statsError).toBe('stats error');
      expect(store.statsLoading).toBe(false);
    });

    it('clears statsError before fetching', async () => {
      const store = useAgentsStore();
      store.statsError = 'stale stats error';
      mockGet.mockResolvedValue(makeStats());

      await store.fetchMessageStats();

      expect(store.statsError).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // startAutoRefresh / stopAutoRefresh
  // -------------------------------------------------------------------------

  describe('startAutoRefresh / stopAutoRefresh', () => {
    it('startAutoRefresh begins polling every 30 seconds', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      store.startAutoRefresh();

      // Advance 30 seconds — one tick
      await vi.advanceTimersByTimeAsync(30_000);

      // refreshStatuses + fetchMessageStats both call bridgeApi.get
      expect(mockGet).toHaveBeenCalled();
    });

    it('does not create a second timer when called twice', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      store.startAutoRefresh();
      store.startAutoRefresh(); // second call should be a no-op

      await vi.advanceTimersByTimeAsync(30_000);

      // Both refreshStatuses and fetchMessageStats fire once each (not doubled)
      const callCount = mockGet.mock.calls.length;
      expect(callCount).toBe(2); // one refreshStatuses + one fetchMessageStats
    });

    it('stopAutoRefresh halts polling', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      store.startAutoRefresh();
      store.stopAutoRefresh();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('stopAutoRefresh is a no-op when timer is not running', () => {
      const store = useAgentsStore();

      // Should not throw
      expect(() => store.stopAutoRefresh()).not.toThrow();
    });

    it('polling fires again after 60 seconds (two intervals)', async () => {
      mockGet.mockResolvedValue([]);
      const store = useAgentsStore();

      store.startAutoRefresh();

      await vi.advanceTimersByTimeAsync(60_000);

      // Each 30s tick calls two endpoints: refreshStatuses + fetchMessageStats
      expect(mockGet.mock.calls.length).toBe(4);

      store.stopAutoRefresh();
    });
  });
});
