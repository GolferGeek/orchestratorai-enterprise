/**
 * conversation.store.ts
 *
 * Compose-specific conversation state store.
 * State ONLY — no async, no API calls, no business logic.
 * Services call mutations after API success.
 * Vue reactivity updates UI automatically.
 *
 * Three-layer architecture:
 *   Component → Store (state only) → composeApiService → Compose API
 */

import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';

// ============================================================================
// Types
// ============================================================================

export interface MessageEvaluation {
  rating: 'up' | 'down' | null;
  feedback?: string;
  timestamp?: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  outputType?: string;
  timestamp: string;
  metadata?: {
    provider?: string;
    model?: string;
    tokensUsed?: number;
    runnerChain?: string[];
  };
  evaluation?: MessageEvaluation;
}

export type MessageStatus = 'idle' | 'sending' | 'streaming' | 'error';

// ============================================================================
// Store
// ============================================================================

export const useConversationStore = defineStore('compose-conversation', () => {
  // ============================================================================
  // STATE — pure reactive data
  // ============================================================================

  /** All messages indexed by conversationId */
  const messages = ref<Map<string, ConversationMessage[]>>(new Map());

  /** Currently active conversation ID */
  const activeConversationId = ref<string | null>(null);

  /** Message send status per conversation */
  const statusByConversation = ref<Map<string, MessageStatus>>(new Map());

  /** Streaming token buffer per conversation (for SSE streaming) */
  const streamingBuffer = ref<Map<string, string>>(new Map());

  /** Global error message */
  const error = ref<string | null>(null);

  // ============================================================================
  // COMPUTED GETTERS
  // ============================================================================

  const activeMessages = computed((): ConversationMessage[] => {
    if (!activeConversationId.value) return [];
    return messages.value.get(activeConversationId.value) ?? [];
  });

  const activeStatus = computed((): MessageStatus => {
    if (!activeConversationId.value) return 'idle';
    return statusByConversation.value.get(activeConversationId.value) ?? 'idle';
  });

  const isSending = computed((): boolean =>
    activeStatus.value === 'sending' || activeStatus.value === 'streaming'
  );

  // ============================================================================
  // MUTATIONS — synchronous only
  // ============================================================================

  function setActiveConversation(conversationId: string | null): void {
    activeConversationId.value = conversationId;
    if (conversationId && !messages.value.has(conversationId)) {
      messages.value = new Map(messages.value).set(conversationId, []);
    }
  }

  function addMessage(conversationId: string, message: ConversationMessage): void {
    const current = messages.value.get(conversationId) ?? [];
    messages.value = new Map(messages.value).set(conversationId, [
      ...current,
      message,
    ]);
  }

  function setMessages(conversationId: string, messageList: ConversationMessage[]): void {
    messages.value = new Map(messages.value).set(conversationId, messageList);
  }

  function clearMessages(conversationId: string): void {
    messages.value = new Map(messages.value).set(conversationId, []);
  }

  function setStatus(conversationId: string, status: MessageStatus): void {
    statusByConversation.value = new Map(statusByConversation.value).set(
      conversationId,
      status
    );
  }

  function appendStreamingToken(conversationId: string, token: string): void {
    const current = streamingBuffer.value.get(conversationId) ?? '';
    streamingBuffer.value = new Map(streamingBuffer.value).set(
      conversationId,
      current + token
    );
  }

  function flushStreamingBuffer(conversationId: string, messageId: string): void {
    const buffered = streamingBuffer.value.get(conversationId) ?? '';
    if (!buffered) return;

    // Finalise the streamed content into the last assistant message
    const conversationMessages = messages.value.get(conversationId) ?? [];
    const idx = conversationMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      const updated = [...conversationMessages];
      updated[idx] = { ...updated[idx], content: buffered };
      messages.value = new Map(messages.value).set(conversationId, updated);
    }

    streamingBuffer.value = new Map(streamingBuffer.value).set(conversationId, '');
  }

  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  function clearError(): void {
    error.value = null;
  }

  function setMessageEvaluation(
    messageId: string,
    rating: 'up' | 'down' | null,
    feedback?: string
  ): void {
    for (const [conversationId, msgs] of messages.value.entries()) {
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        const updated = [...msgs];
        updated[idx] = {
          ...updated[idx],
          evaluation: {
            rating,
            feedback,
            timestamp: new Date().toISOString(),
          },
        };
        messages.value = new Map(messages.value).set(conversationId, updated);
        return;
      }
    }
  }

  function clearAll(): void {
    messages.value = new Map();
    statusByConversation.value = new Map();
    streamingBuffer.value = new Map();
    activeConversationId.value = null;
    error.value = null;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // State (read-only)
    messages: readonly(messages),
    activeConversationId: readonly(activeConversationId),
    streamingBuffer: readonly(streamingBuffer),
    error: readonly(error),

    // Computed
    activeMessages,
    activeStatus,
    isSending,

    // Mutations
    setActiveConversation,
    addMessage,
    setMessages,
    clearMessages,
    setStatus,
    appendStreamingToken,
    flushStreamingBuffer,
    setMessageEvaluation,
    setError,
    clearError,
    clearAll,
  };
});
