<template>
  <div :class="['task-item', `role-${message.role}`]">
    <!-- User message -->
    <div v-if="message.role === 'user'" class="user-bubble">
      <p class="message-text">{{ message.content }}</p>
      <span class="message-meta">{{ formatTime(message.timestamp) }}</span>
    </div>

    <!-- Assistant message -->
    <div v-else class="assistant-bubble">
      <div class="agent-avatar">
        <ion-icon :icon="sparklesOutline" />
      </div>
      <div class="assistant-content">
        <div class="message-text" v-html="renderedContent" />
        <div class="assistant-meta">
          <span v-if="agentName" class="agent-name">{{ agentName }}</span>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { sparklesOutline } from 'ionicons/icons';
import type { AgentChatMessage } from '@/types/conversation';

const props = defineProps<{
  message: AgentChatMessage;
  conversationId?: string;
  agentName?: string;
}>();

function formatTime(timestamp: Date | string | undefined): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const renderedContent = computed((): string => {
  const content = props.message.content ?? '';
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
});
</script>

<style scoped>
.task-item { display: flex; margin-bottom: 4px; }
.task-item.role-user { justify-content: flex-end; }
.task-item.role-assistant { justify-content: flex-start; }
.user-bubble {
  max-width: 72%;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  border-radius: 18px 18px 4px 18px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.assistant-bubble {
  display: flex;
  gap: 10px;
  max-width: 80%;
  align-items: flex-start;
}
.agent-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.assistant-content {
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 4px 18px 18px 18px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.message-text { margin: 0; font-size: 0.95rem; line-height: 1.5; word-break: break-word; }
.message-meta, .message-time { font-size: 0.72rem; opacity: 0.7; margin: 0; }
.assistant-meta { display: flex; gap: 8px; align-items: center; }
.agent-name { font-size: 0.72rem; font-weight: 600; color: var(--ion-color-medium); }
</style>
