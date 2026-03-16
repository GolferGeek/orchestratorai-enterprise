<template>
  <div class="conversation-thread" ref="threadRef">
    <div
      v-for="message in messages"
      :key="message.id"
      :class="['message-row', `role-${message.role}`]"
    >
      <AgentResponse
        v-if="message.role === 'assistant'"
        :content="message.content"
        :metadata="message.metadata"
        :timestamp="message.timestamp"
      />
      <div v-else class="user-message-bubble">
        <p class="message-content">{{ message.content }}</p>
        <span class="message-timestamp">{{ formatTime(message.timestamp) }}</span>
      </div>
    </div>

    <div v-if="messages.length === 0" class="empty-thread">
      <p>Start the conversation by sending a message below.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, nextTick } from 'vue';
import type { ConversationMessage } from '@/stores/conversation.store';
import AgentResponse from './AgentResponse.vue';

const props = defineProps<{
  messages: ConversationMessage[];
}>();

const threadRef = ref<HTMLElement | null>(null);

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Auto-scroll to bottom when new messages arrive
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (threadRef.value) {
      threadRef.value.scrollTop = threadRef.value.scrollHeight;
    }
  }
);
</script>

<style scoped>
.conversation-thread {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
  overflow-y: auto;
  flex: 1;
}

.message-row {
  display: flex;
  flex-direction: column;
}

.message-row.role-user {
  align-items: flex-end;
}

.message-row.role-assistant {
  align-items: flex-start;
}

.user-message-bubble {
  max-width: 72%;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  border-radius: 18px 18px 4px 18px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-content {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-timestamp {
  font-size: 0.72rem;
  opacity: 0.7;
  text-align: right;
}

.empty-thread {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  text-align: center;
  padding: 32px;
}
</style>
