/**
 * conversation.store.spec.ts
 *
 * Unit tests for the Compose conversation Pinia store.
 * The store is state-only (no API calls) — all mutations are synchronous.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useConversationStore,
  type ConversationMessage,
} from '@/stores/conversation.store';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONV_ID = 'conv-001';
const CONV_ID_2 = 'conv-002';

function makeMessage(
  id: string,
  conversationId: string,
  role: ConversationMessage['role'] = 'user',
  content = 'Hello',
): ConversationMessage {
  return {
    id,
    conversationId,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useConversationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ─── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty messages map', () => {
      const store = useConversationStore();
      expect(store.messages.size).toBe(0);
    });

    it('starts with no active conversation', () => {
      const store = useConversationStore();
      expect(store.activeConversationId).toBeNull();
    });

    it('starts with an empty streaming buffer', () => {
      const store = useConversationStore();
      expect(store.streamingBuffer.size).toBe(0);
    });

    it('starts with no error', () => {
      const store = useConversationStore();
      expect(store.error).toBeNull();
    });
  });

  // ─── setActiveConversation ────────────────────────────────────────────

  describe('setActiveConversation', () => {
    it('sets the active conversation id', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      expect(store.activeConversationId).toBe(CONV_ID);
    });

    it('initialises an empty message list for a new conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      expect(store.messages.get(CONV_ID)).toEqual([]);
    });

    it('does not overwrite existing messages when setting same conversation again', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID));
      store.setActiveConversation(CONV_ID);
      // Message list should still contain the previously added message
      expect(store.messages.get(CONV_ID)).toHaveLength(1);
    });

    it('accepts null to clear the active conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setActiveConversation(null);
      expect(store.activeConversationId).toBeNull();
    });
  });

  // ─── addMessage ───────────────────────────────────────────────────────

  describe('addMessage', () => {
    it('appends a message to the conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      const msg = makeMessage('msg-1', CONV_ID, 'user', 'What is 2+2?');
      store.addMessage(CONV_ID, msg);

      const messages = store.messages.get(CONV_ID) ?? [];
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(msg);
    });

    it('appends multiple messages in order', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID, 'user'));
      store.addMessage(CONV_ID, makeMessage('msg-2', CONV_ID, 'assistant'));
      store.addMessage(CONV_ID, makeMessage('msg-3', CONV_ID, 'user'));

      const messages = store.messages.get(CONV_ID) ?? [];
      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('creates the conversation entry if it did not exist', () => {
      const store = useConversationStore();
      // No setActiveConversation call first
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID));
      expect(store.messages.get(CONV_ID)).toHaveLength(1);
    });
  });

  // ─── setMessages ──────────────────────────────────────────────────────

  describe('setMessages', () => {
    it('replaces all messages for a conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('old-1', CONV_ID));
      store.addMessage(CONV_ID, makeMessage('old-2', CONV_ID));

      const newMessages = [makeMessage('new-1', CONV_ID), makeMessage('new-2', CONV_ID)];
      store.setMessages(CONV_ID, newMessages);

      expect(store.messages.get(CONV_ID)).toEqual(newMessages);
    });
  });

  // ─── clearMessages ────────────────────────────────────────────────────

  describe('clearMessages', () => {
    it('empties the message list for a conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID));
      store.clearMessages(CONV_ID);
      expect(store.messages.get(CONV_ID)).toEqual([]);
    });
  });

  // ─── setStatus ────────────────────────────────────────────────────────

  describe('setStatus', () => {
    it('records message status per conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setStatus(CONV_ID, 'sending');
      // activeStatus is derived from the active conversation
      expect(store.activeStatus).toBe('sending');
    });

    it('tracks status independently per conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setStatus(CONV_ID, 'streaming');
      store.setStatus(CONV_ID_2, 'error');

      // Active conversation is CONV_ID
      expect(store.activeStatus).toBe('streaming');
    });
  });

  // ─── appendStreamingToken ─────────────────────────────────────────────

  describe('appendStreamingToken', () => {
    it('concatenates tokens into the streaming buffer', () => {
      const store = useConversationStore();
      store.appendStreamingToken(CONV_ID, 'Hello');
      store.appendStreamingToken(CONV_ID, ' world');
      expect(store.streamingBuffer.get(CONV_ID)).toBe('Hello world');
    });

    it('tracks buffers independently per conversation', () => {
      const store = useConversationStore();
      store.appendStreamingToken(CONV_ID, 'First');
      store.appendStreamingToken(CONV_ID_2, 'Second');
      expect(store.streamingBuffer.get(CONV_ID)).toBe('First');
      expect(store.streamingBuffer.get(CONV_ID_2)).toBe('Second');
    });
  });

  // ─── flushStreamingBuffer ─────────────────────────────────────────────

  describe('flushStreamingBuffer', () => {
    it('writes buffered content into the target message and clears the buffer', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);

      // Add a placeholder assistant message
      const assistantMsg = makeMessage('msg-assist', CONV_ID, 'assistant', '');
      store.addMessage(CONV_ID, assistantMsg);

      // Stream tokens
      store.appendStreamingToken(CONV_ID, 'Streaming ');
      store.appendStreamingToken(CONV_ID, 'response.');

      store.flushStreamingBuffer(CONV_ID, 'msg-assist');

      const messages = store.messages.get(CONV_ID) ?? [];
      expect(messages.find((m) => m.id === 'msg-assist')?.content).toBe('Streaming response.');
      // Buffer should be cleared
      expect(store.streamingBuffer.get(CONV_ID)).toBe('');
    });

    it('is a no-op when buffer is empty', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      const msg = makeMessage('msg-1', CONV_ID, 'assistant', 'original');
      store.addMessage(CONV_ID, msg);

      // No tokens appended — buffer is empty
      store.flushStreamingBuffer(CONV_ID, 'msg-1');

      // Content must not change
      const messages = store.messages.get(CONV_ID) ?? [];
      expect(messages[0].content).toBe('original');
    });
  });

  // ─── setError / clearError ────────────────────────────────────────────

  describe('setError / clearError', () => {
    it('sets a global error message', () => {
      const store = useConversationStore();
      store.setError('Network failure');
      expect(store.error).toBe('Network failure');
    });

    it('clearError resets the error to null', () => {
      const store = useConversationStore();
      store.setError('err');
      store.clearError();
      expect(store.error).toBeNull();
    });

    it('setError with null clears the error', () => {
      const store = useConversationStore();
      store.setError('err');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  // ─── clearAll ─────────────────────────────────────────────────────────

  describe('clearAll', () => {
    it('resets all state to initial empty values', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID));
      store.setStatus(CONV_ID, 'sending');
      store.appendStreamingToken(CONV_ID, 'token');
      store.setError('error');

      store.clearAll();

      expect(store.messages.size).toBe(0);
      expect(store.activeConversationId).toBeNull();
      expect(store.streamingBuffer.size).toBe(0);
      expect(store.error).toBeNull();
    });
  });

  // ─── Computed getters ─────────────────────────────────────────────────

  describe('activeMessages (computed)', () => {
    it('returns messages for the active conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.addMessage(CONV_ID, makeMessage('msg-1', CONV_ID));
      store.addMessage(CONV_ID, makeMessage('msg-2', CONV_ID));
      expect(store.activeMessages).toHaveLength(2);
    });

    it('returns empty array when no active conversation', () => {
      const store = useConversationStore();
      expect(store.activeMessages).toEqual([]);
    });
  });

  describe('activeStatus (computed)', () => {
    it('returns idle when no status is set for the active conversation', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      expect(store.activeStatus).toBe('idle');
    });
  });

  describe('isSending (computed)', () => {
    it('is true when status is sending', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setStatus(CONV_ID, 'sending');
      expect(store.isSending).toBe(true);
    });

    it('is true when status is streaming', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setStatus(CONV_ID, 'streaming');
      expect(store.isSending).toBe(true);
    });

    it('is false when status is idle', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      expect(store.isSending).toBe(false);
    });

    it('is false when status is error', () => {
      const store = useConversationStore();
      store.setActiveConversation(CONV_ID);
      store.setStatus(CONV_ID, 'error');
      expect(store.isSending).toBe(false);
    });
  });
});
