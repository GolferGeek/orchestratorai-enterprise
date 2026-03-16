<template>
  <div class="agent-response">
    <div class="agent-avatar">
      <ion-icon :icon="sparklesOutline" class="agent-icon" />
    </div>
    <div class="response-body">
      <div class="response-content" v-html="renderedContent" />
      <div class="response-footer">
        <span v-if="metadata?.provider" class="provider-badge">
          {{ metadata.provider }} / {{ metadata.model }}
        </span>
        <span v-if="metadata?.runnerChain?.length" class="runner-chain">
          via {{ metadata.runnerChain.join(' → ') }}
        </span>
        <span class="message-timestamp">{{ formatTime(timestamp) }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { sparklesOutline } from 'ionicons/icons';
import type { ConversationMessage } from '@/stores/conversation.store';

const props = defineProps<{
  content: string;
  timestamp: string;
  metadata?: ConversationMessage['metadata'];
}>();

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Renders Markdown-ish content safely.
 * Using basic text for now — a full markdown renderer can be plugged in here.
 */
const renderedContent = computed(() => {
  // Escape HTML to prevent XSS, then add basic formatting
  const escaped = props.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Convert **bold** and *italic* to HTML
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
});
</script>

<style scoped>
.agent-response {
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-icon {
  color: var(--ion-color-secondary-contrast);
  font-size: 16px;
}

.response-body {
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 4px 18px 18px 18px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.response-content {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--ion-text-color);
  word-break: break-word;
}

.response-footer {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.provider-badge,
.runner-chain {
  font-size: 0.72rem;
  color: var(--ion-color-medium);
  background: var(--ion-color-step-100);
  padding: 1px 6px;
  border-radius: 4px;
}

.message-timestamp {
  font-size: 0.72rem;
  color: var(--ion-color-medium);
  margin-left: auto;
}
</style>
