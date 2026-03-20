<template>
  <!-- Floating bubble button -->
  <div class="cs-widget">
    <Transition name="chat-panel">
      <div v-if="isOpen" class="cs-panel" role="dialog" aria-label="Customer service chat">
        <!-- Header -->
        <div class="cs-header">
          <div class="cs-header-info">
            <div class="cs-avatar">
              <span>AI</span>
            </div>
            <div>
              <div class="cs-name">OrchestratorAI Support</div>
              <div class="cs-status">
                <span class="cs-status-dot"></span>
                Online
              </div>
            </div>
          </div>
          <button class="cs-close" aria-label="Close chat" @click="isOpen = false">✕</button>
        </div>

        <!-- Messages -->
        <div ref="messagesEl" class="cs-messages">
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="cs-message"
            :class="msg.role === 'user' ? 'cs-message--user' : 'cs-message--agent'"
          >
            <div class="cs-bubble">{{ msg.content }}</div>
          </div>

          <div v-if="isLoading" class="cs-message cs-message--agent">
            <div class="cs-bubble cs-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div v-if="errorMsg" class="cs-error">{{ errorMsg }}</div>
        </div>

        <!-- Input -->
        <form class="cs-input-row" @submit.prevent="sendMessage">
          <input
            v-model="inputText"
            type="text"
            class="cs-input"
            placeholder="Ask us anything..."
            :disabled="isLoading"
            maxlength="500"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="submit"
            class="cs-send"
            :disabled="isLoading || !inputText.trim()"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor" />
            </svg>
          </button>
        </form>

        <!-- Footer -->
        <div class="cs-footer">Powered by OrchestratorAI</div>
      </div>
    </Transition>

    <!-- Bubble toggle button -->
    <button
      class="cs-bubble"
      :class="{ 'cs-bubble--open': isOpen }"
      aria-label="Open customer service chat"
      @click="toggleOpen"
    >
      <Transition name="icon-swap" mode="out-in">
        <svg v-if="!isOpen" key="chat" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
            fill="currentColor"
          />
        </svg>
        <svg v-else key="close" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </Transition>
      <span v-if="unreadCount > 0 && !isOpen" class="cs-unread">{{ unreadCount }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { sendCustomerServiceMessage } from '@/services/landing/customer-service.api';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

const isOpen = ref(false);
const inputText = ref('');
const isLoading = ref(false);
const errorMsg = ref('');
const messagesEl = ref<HTMLElement | null>(null);
const unreadCount = ref(0);

const messages = ref<Message[]>([
  {
    role: 'agent',
    content:
      'Hi! I\'m the OrchestratorAI support agent. How can I help you today?',
  },
]);

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

function toggleOpen() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    unreadCount.value = 0;
    scrollToBottom();
  }
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  errorMsg.value = '';
  inputText.value = '';

  messages.value.push({ role: 'user', content: text });
  scrollToBottom();

  isLoading.value = true;

  const response = await sendCustomerServiceMessage(text).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    errorMsg.value = `Failed to reach support agent: ${message}`;
    return null;
  });

  isLoading.value = false;

  if (response) {
    messages.value.push({ role: 'agent', content: response.content });
    scrollToBottom();

    if (!isOpen.value) {
      unreadCount.value += 1;
    }
  }
}
</script>

<style scoped>
/* ─── Widget container ──────────────────────────────────────── */
.cs-widget {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
}

/* ─── Chat panel ────────────────────────────────────────────── */
.cs-panel {
  width: 360px;
  max-height: 520px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Panel transition */
.chat-panel-enter-active,
.chat-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.chat-panel-enter-from,
.chat-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

/* ─── Header ────────────────────────────────────────────────── */
.cs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}

.cs-header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cs-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--gradient-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.cs-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.cs-status {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--success);
}

.cs-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.cs-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 1rem;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.15s ease;
}

.cs-close:hover {
  color: var(--text-primary);
}

/* ─── Messages ──────────────────────────────────────────────── */
.cs-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.cs-message {
  display: flex;
}

.cs-message--user {
  justify-content: flex-end;
}

.cs-message--agent {
  justify-content: flex-start;
}

.cs-bubble {
  max-width: 80%;
  padding: 0.65rem 0.9rem;
  border-radius: 12px;
  font-size: 0.875rem;
  line-height: 1.55;
}

.cs-message--user .cs-bubble {
  background: var(--gradient-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.cs-message--agent .cs-bubble {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}

/* Typing indicator */
.cs-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0.75rem 1rem;
}

.cs-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing-bounce 1.2s ease-in-out infinite;
}

.cs-typing span:nth-child(2) { animation-delay: 0.2s; }
.cs-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-5px); opacity: 1; }
}

.cs-error {
  font-size: 0.8rem;
  color: #f87171;
  text-align: center;
  padding: 0.25rem 0;
}

/* ─── Input row ─────────────────────────────────────────────── */
.cs-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.cs-input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.85rem;
  font-size: 0.875rem;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s ease;
}

.cs-input::placeholder {
  color: var(--text-muted);
}

.cs-input:focus {
  border-color: var(--border-active);
}

.cs-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cs-send {
  background: var(--gradient-primary);
  border: none;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}

.cs-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cs-send:not(:disabled):hover {
  opacity: 0.85;
}

/* ─── Footer ────────────────────────────────────────────────── */
.cs-footer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  padding: 0.5rem;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
}

/* ─── Floating bubble ───────────────────────────────────────── */
.cs-bubble {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--gradient-primary);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 32px rgba(59, 130, 246, 0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  flex-shrink: 0;
}

.cs-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.6);
}

.cs-bubble--open {
  background: var(--bg-elevated);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.cs-unread {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-base);
}

/* Icon swap transition */
.icon-swap-enter-active,
.icon-swap-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.icon-swap-enter-from { opacity: 0; transform: scale(0.7) rotate(-20deg); }
.icon-swap-leave-to  { opacity: 0; transform: scale(0.7) rotate(20deg); }

/* ─── Responsive ────────────────────────────────────────────── */
@media (max-width: 420px) {
  .cs-widget {
    bottom: 1rem;
    right: 1rem;
  }

  .cs-panel {
    width: calc(100vw - 2rem);
    max-height: 70vh;
  }
}
</style>
