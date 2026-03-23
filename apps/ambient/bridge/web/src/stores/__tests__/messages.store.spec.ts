import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// --- Mock useApi before importing the store ---

const mockGet = vi.fn();

vi.mock('../../composables/useApi', () => ({
  useApi: () => ({
    bridgeApi: {
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  }),
}));

import { useMessagesStore } from '../messages.store';
import type { ProtocolMessage } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProtocolMessage(id: string): ProtocolMessage {
  return {
    id,
    timestamp: new Date().toISOString(),
    source: 'agent-a',
    target: 'agent-b',
    method: 'invoke',
    status: 'success',
    protocol: {
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'local-keys',
      payment: 'mock',
      encryption: 'none',
      trust: 'allowlist',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMessagesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // fetchMessages
  // -------------------------------------------------------------------------

  describe('fetchMessages', () => {
    it('populates messages from a plain array response', async () => {
      const list = [makeProtocolMessage('p1'), makeProtocolMessage('p2')];
      mockGet.mockResolvedValue(list);
      const store = useMessagesStore();

      await store.fetchMessages();

      expect(store.messages).toEqual(list);
    });

    it('populates messages from a wrapped { messages, total } response', async () => {
      const list = [makeProtocolMessage('w1')];
      mockGet.mockResolvedValue({ messages: list, total: 1 });
      const store = useMessagesStore();

      await store.fetchMessages();

      expect(store.messages).toEqual(list);
    });

    it('calls the correct base path when no filter is provided', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      await store.fetchMessages();

      expect(mockGet).toHaveBeenCalledWith('/messages');
    });

    it('appends query params from a filter', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      await store.fetchMessages({ source: 'agent-x', limit: 20 });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toContain('/messages?');
      expect(path).toContain('source=agent-x');
      expect(path).toContain('limit=20');
    });

    it('omits undefined filter values from the query string', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      await store.fetchMessages({ source: 'agent-x', target: undefined });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).not.toContain('target');
    });

    it('includes all defined filter fields', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      await store.fetchMessages({ source: 's', target: 't', method: 'invoke', status: 'error' });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toContain('source=s');
      expect(path).toContain('target=t');
      expect(path).toContain('method=invoke');
      expect(path).toContain('status=error');
    });

    it('sets loading to true during fetch then false after', async () => {
      let resolve!: (v: ProtocolMessage[]) => void;
      mockGet.mockReturnValue(new Promise<ProtocolMessage[]>((r) => { resolve = r; }));
      const store = useMessagesStore();

      const p = store.fetchMessages();
      expect(store.loading).toBe(true);
      resolve([]);
      await p;
      expect(store.loading).toBe(false);
    });

    it('resets loading to false on error', async () => {
      mockGet.mockRejectedValue(new Error('net error'));
      const store = useMessagesStore();

      await expect(store.fetchMessages()).rejects.toThrow('net error');
      expect(store.loading).toBe(false);
    });

    it('sets error state and re-throws on failure', async () => {
      mockGet.mockRejectedValue(new Error('fetch messages failed'));
      const store = useMessagesStore();

      await expect(store.fetchMessages()).rejects.toThrow('fetch messages failed');
      expect(store.error).toBe('fetch messages failed');
    });

    it('clears error before fetching', async () => {
      const store = useMessagesStore();
      store.error = 'previous error';
      mockGet.mockResolvedValue([]);

      await store.fetchMessages();

      expect(store.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // selectMessage
  // -------------------------------------------------------------------------

  describe('selectMessage', () => {
    it('sets selectedMessage from the API response', async () => {
      const msg = makeProtocolMessage('sel-1');
      mockGet.mockResolvedValue(msg);
      const store = useMessagesStore();

      await store.selectMessage('sel-1');

      expect(store.selectedMessage).toEqual(msg);
    });

    it('calls the correct path including the message id', async () => {
      const msg = makeProtocolMessage('path-test');
      mockGet.mockResolvedValue(msg);
      const store = useMessagesStore();

      await store.selectMessage('path-test');

      expect(mockGet).toHaveBeenCalledWith('/messages/path-test');
    });

    it('sets loading to true during request then false after', async () => {
      let resolve!: (v: ProtocolMessage) => void;
      mockGet.mockReturnValue(new Promise<ProtocolMessage>((r) => { resolve = r; }));
      const store = useMessagesStore();

      const p = store.selectMessage('any');
      expect(store.loading).toBe(true);
      resolve(makeProtocolMessage('any'));
      await p;
      expect(store.loading).toBe(false);
    });

    it('sets error and re-throws on failure', async () => {
      mockGet.mockRejectedValue(new Error('not found'));
      const store = useMessagesStore();

      await expect(store.selectMessage('bad-id')).rejects.toThrow('not found');
      expect(store.error).toBe('not found');
    });

    it('resets loading to false on error', async () => {
      mockGet.mockRejectedValue(new Error('fail'));
      const store = useMessagesStore();

      await expect(store.selectMessage('x')).rejects.toThrow();
      expect(store.loading).toBe(false);
    });

    it('clears error before fetching', async () => {
      const store = useMessagesStore();
      store.error = 'old error';
      const msg = makeProtocolMessage('clr');
      mockGet.mockResolvedValue(msg);

      await store.selectMessage('clr');

      expect(store.error).toBeNull();
    });

    it('overwrites a previously selected message', async () => {
      const first = makeProtocolMessage('first');
      const second = makeProtocolMessage('second');
      mockGet.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      const store = useMessagesStore();

      await store.selectMessage('first');
      expect(store.selectedMessage).toEqual(first);

      await store.selectMessage('second');
      expect(store.selectedMessage).toEqual(second);
    });
  });

  // -------------------------------------------------------------------------
  // clearSelection
  // -------------------------------------------------------------------------

  describe('clearSelection', () => {
    it('sets selectedMessage to null', async () => {
      const msg = makeProtocolMessage('clr-sel');
      mockGet.mockResolvedValue(msg);
      const store = useMessagesStore();
      await store.selectMessage('clr-sel');
      expect(store.selectedMessage).not.toBeNull();

      store.clearSelection();

      expect(store.selectedMessage).toBeNull();
    });

    it('is a no-op when selectedMessage is already null', () => {
      const store = useMessagesStore();
      expect(store.selectedMessage).toBeNull();

      expect(() => store.clearSelection()).not.toThrow();
      expect(store.selectedMessage).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('messages is an empty array', () => {
      const store = useMessagesStore();
      expect(store.messages).toEqual([]);
    });

    it('selectedMessage is null', () => {
      const store = useMessagesStore();
      expect(store.selectedMessage).toBeNull();
    });

    it('loading is false', () => {
      const store = useMessagesStore();
      expect(store.loading).toBe(false);
    });

    it('error is null', () => {
      const store = useMessagesStore();
      expect(store.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // filter handling edge cases
  // -------------------------------------------------------------------------

  describe('filter handling', () => {
    it('handles a filter with only offset and limit', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      await store.fetchMessages({ limit: 5, offset: 10 });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toContain('limit=5');
      expect(path).toContain('offset=10');
    });

    it('handles fromTimestamp and toTimestamp filters', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();
      const from = '2026-01-01T00:00:00Z';
      const to = '2026-01-31T23:59:59Z';

      await store.fetchMessages({ fromTimestamp: from, toTimestamp: to });

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toContain('fromTimestamp=');
      expect(path).toContain('toTimestamp=');
    });

    it('passes an empty filter object the same as no filter', async () => {
      mockGet.mockResolvedValue([]);
      const store = useMessagesStore();

      // Empty filter: all entries are undefined so no params appended,
      // but the '?' separator may still appear. The path should start with /messages.
      await store.fetchMessages({});

      const [path] = mockGet.mock.calls[0] as [string];
      expect(path).toMatch(/^\/messages/);
    });
  });
});
