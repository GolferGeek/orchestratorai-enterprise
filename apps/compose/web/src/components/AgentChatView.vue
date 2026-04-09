<template>
  <div class="agent-chat-view">
    <ChatHeader
      :model-value="interactionMode"
      @mode-change="handleModeChange"
    >
      <template #controls>
        <ChatModeControl />
      </template>
    </ChatHeader>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <ion-spinner />
      <p>Loading conversation...</p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="error-state">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ error }}</p>
      <ion-button @click="clearError">Dismiss</ion-button>
    </div>

    <!-- Messages -->
    <div class="messages-container" ref="messagesContainer">
      <AgentTaskItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :conversation-id="conversationId"
        :agent-name="currentAgent?.name"
      />
    </div>

    <!-- Input Area -->
    <div class="input-area">
      <form @submit.prevent="() => sendMessage()">
        <ion-item>
          <ion-textarea
            v-model="messageText"
            placeholder="Type your message..."
            :rows="2"
            :disabled="!currentAgent"
            @keydown.enter.prevent="sendMessage"
          />
          <!-- Mode-aware Send Button -->
          <ChatModeSendButton
            slot="end"
            :disabled="!canSend"
            @send="sendMessage"
          />
        </ion-item>
      </form>
    </div>

    <!-- Typing Indicator -->
    <div v-if="isSendingMessage" class="mode-loading-indicator">
      <ion-spinner name="dots" />
      <span>{{ loadingMessage }}</span>
      <ion-button
        v-if="showCancelButton"
        size="small"
        fill="outline"
        @click="cancelCurrentOperation"
      >
        Cancel
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import {
  IonIcon,
  IonItem,
  IonTextarea,
  IonSpinner,
  IonButton,
} from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { sendMessage as sendMessageAction, createPlan, createDeliverable } from '@/services/invoke-actions';
import { tasksService } from '@/services/tasksService';
import AgentTaskItem from './AgentTaskItem.vue';
import ChatModeSendButton from './ChatModeSendButton.vue';
import ChatHeader from './ChatHeader.vue';
import ChatModeControl from './ChatModeControl.vue';
import type { AgentChatMode, AgentConversation, AgentChatMessage } from '@/types/conversation';

interface Props {
  conversation?: AgentConversation;
}
const props = defineProps<Props>();

const conversationsStore = useConversationsStore();
const chatUiStore = useChatUiStore();

const interactionMode = ref<'text' | 'voice'>('text');

function handleModeChange(mode: 'text' | 'voice'): void {
  interactionMode.value = mode;
}

const messageText = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

const currentAgent = computed(() => {
  const conv = props.conversation || chatUiStore.activeConversation;
  if (!conv) return null;
  const isAgentConv = 'agentName' in conv;
  return {
    name: isAgentConv ? (conv as AgentConversation).agentName || '' : '',
    type: isAgentConv ? (conv as AgentConversation).agentType || 'custom' : 'custom',
    slug: isAgentConv ? (conv as AgentConversation).agentName || '' : '',
    id: isAgentConv ? (conv as AgentConversation).agentName || '' : '',
    organizationSlug: 'organizationSlug' in conv ? (conv as AgentConversation).organizationSlug : undefined,
  };
});

const messages = computed((): AgentChatMessage[] => {
  const convId = props.conversation?.id || chatUiStore.activeConversation?.id;
  if (!convId) return [];

  const msgMap = conversationsStore.messagesMap;
  const rawMessages = msgMap.get(convId) || [];

  return (rawMessages as unknown[])
    .filter((msg) => (msg as { role: string }).role !== 'system')
    .map((msg): AgentChatMessage => {
      const m = msg as {
        id: string; role: string; content: string; timestamp?: string; createdAt?: string;
        taskId?: string; metadata?: { deliverableId?: string; references?: { taskIds?: string[] } };
      };
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.timestamp || m.createdAt || new Date().toISOString()),
        taskId: m.taskId,
        deliverableId: m.metadata?.deliverableId,
        planId: m.metadata?.references?.taskIds?.[0],
        metadata: m.metadata as Record<string, unknown>,
      };
    });
});

const isLoading = computed(() =>
  props.conversation?.isLoading || chatUiStore.activeConversation?.isLoading || false
);

const error = computed(() =>
  props.conversation?.error || chatUiStore.activeConversation?.error || null
);

const isSendingMessage = computed(() =>
  props.conversation?.isSendingMessage || chatUiStore.activeConversation?.isSendingMessage || false
);

const canSend = computed(() =>
  messageText.value.trim().length > 0 && !!currentAgent.value && !isSendingMessage.value
);

const chatMode = computed(() => chatUiStore.chatMode);

const loadingMessage = computed(() => {
  const mode = (chatMode.value || '').toLowerCase();
  if (mode === 'plan') return 'Creating plan...';
  if (mode === 'build') return 'Building deliverable...';
  return 'Agent is typing...';
});

const showCancelButton = computed(() => chatMode.value === 'build');

const conversationId = computed(() =>
  props.conversation?.id || chatUiStore.activeConversation?.id
);

const sendMessage = async (mode?: AgentChatMode): Promise<void> => {
  if (!canSend.value) return;
  const text = messageText.value.trim();
  messageText.value = '';

  if (mode) {
    const primaryMode = mode === 'converse' || mode === 'plan' || mode === 'build' ? mode : 'converse';
    chatUiStore.setChatMode(primaryMode);
  }

  const activeConversation = chatUiStore.activeConversation;
  if (activeConversation && currentAgent.value) {
    const effectiveMode = chatMode.value;
    if (effectiveMode === 'plan') {
      await createPlan(text);
    } else if (effectiveMode === 'build') {
      await createDeliverable(text);
    } else {
      await sendMessageAction(text, undefined, interactionMode.value);
    }
  }

  scrollToBottom();
};

const clearError = (): void => {
  conversationsStore.clearError();
};

const scrollToBottom = async (): Promise<void> => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const cancelCurrentOperation = async (): Promise<void> => {
  const activeConversation = chatUiStore.activeConversation;
  if (!activeConversation?.activeTaskId) return;
  await tasksService.cancelTask(activeConversation.activeTaskId);
};

watch(() => messages.value.length, () => {
  scrollToBottom();
});

watch(() => chatUiStore.activeConversationId, () => {
  interactionMode.value = 'text';
});
</script>

<style scoped>
.agent-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ion-background-color);
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
}

.error-state {
  color: var(--ion-color-danger);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-area {
  border-top: 1px solid var(--ion-color-step-150);
  padding: 8px;
}

.input-area ion-item {
  --padding-start: 16px;
  --padding-end: 8px;
}

.mode-loading-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 0.9em;
  color: var(--ion-color-medium);
  border-top: 1px solid var(--ion-color-step-100);
  background: var(--ion-color-step-25);
}

.mode-loading-indicator ion-spinner {
  --spinner-width: 20px;
  --spinner-height: 20px;
}

.mode-loading-indicator ion-button {
  margin-left: auto;
}
</style>
