<template>
  <div class="conversation-view">
    <AgentChatView :conversation="conversation" />
  </div>
</template>

<script setup lang="ts">
/**
 * ConversationView — Compose Edition
 *
 * Thin wrapper that renders the Compose-appropriate conversation UI.
 * Complex multi-step workflow visualizations belong in Forge Web.
 *
 * For standard conversations, delegates to AgentChatView.
 * For runner-compose pipelines, delegates to AgentChatView with runner context.
 */
import AgentChatView from './AgentChatView.vue';
import type { AgentConversation } from '@/types/conversation';

defineProps<{
  conversation?: AgentConversation | null;
  conversationId?: string;
}>();
</script>

<style scoped>
.conversation-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
