<template>
  <div class="conversation-thread" ref="threadRef">
    <div
      v-for="message in messages"
      :key="message.id"
      :class="['message-row', `role-${message.role}`]"
    >
      <AgentResponse
        v-if="message.role === 'assistant'"
        :message-id="message.id"
        :content="message.content"
        :output-type="message.outputType"
        :metadata="message.metadata"
        :timestamp="message.timestamp"
        :evaluation="message.evaluation"
      />
      <div v-else class="user-message-bubble">
        <!-- Attachment display -->
        <div
          v-if="message.attachments && message.attachments.length > 0"
          class="message-attachments"
        >
          <div
            v-for="(attachment, idx) in message.attachments"
            :key="idx"
            class="message-attachment"
          >
            <ion-icon
              :icon="isImageMime(attachment.mimeType) ? imageOutline : documentOutline"
              class="attachment-icon"
            />
            <span class="attachment-label">{{ attachment.filename }}</span>
          </div>
        </div>
        <p v-if="message.content" class="message-content">{{ message.content }}</p>
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
import { IonIcon } from '@ionic/vue';
import { documentOutline, imageOutline } from 'ionicons/icons';
import type { ConversationMessage } from '@/stores/conversation.store';
import AgentResponse from './AgentResponse.vue';

const props = defineProps<{
  messages: ConversationMessage[];
}>();

const threadRef = ref<HTMLElement | null>(null);

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

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

.message-attachments {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.message-attachment {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  opacity: 0.85;
}

.attachment-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.attachment-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
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
