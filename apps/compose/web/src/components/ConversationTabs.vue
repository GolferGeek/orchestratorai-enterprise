<template>
  <div class="conversation-tabs-container">
    <!-- Tab Bar -->
    <div class="conversation-tab-bar" v-if="openTabs.length > 0">
      <div class="tab-scroll-wrapper">
        <div
          v-for="conversation in openTabs"
          :key="conversation.id"
          class="conversation-tab"
          :class="{ 'active': conversation.id === chatUiStore.activeConversationId }"
          @click="switchToConversation(conversation.id)"
        >
          <span class="tab-title">{{ conversation.title }}</span>
          <ion-button
            fill="clear"
            size="small"
            class="tab-close-button"
            @click.stop="closeConversation(conversation.id)"
          >
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </div>
      </div>
    </div>
    <!-- Tab Content -->
    <div class="conversation-tab-content">
      <div v-if="activeConversation" class="active-conversation">
        <!-- Conversation View (with modal-based deliverables/HITL) -->
        <ConversationView
          v-if="shouldUseTwoPaneView"
          :conversation="activeConversation as AgentConversation"
        />
        <!-- Traditional Single-Pane Chat View -->
        <AgentChatView
          v-else
          :conversation="activeConversation as AgentConversation"
          @send-message="handleSendMessage"
        />
      </div>
      <div v-else class="no-active-conversation">
        <div class="empty-state">
          <ion-icon :icon="chatbubblesOutline" size="large" color="medium" />
          <h3>No conversations open</h3>
          <p>Start a new conversation with an agent from the sidebar.</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { closeOutline, chatbubblesOutline } from 'ionicons/icons';
// import { useRoute } from 'vue-router';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { agentsService } from '@/services/agentsService';
import { sendMessage as sendMessageAction, createPlan, createDeliverable } from '@/services/agent2agent/actions';
import { conversation as conversationHelpers } from '@/services/conversationHelpers';
import AgentChatView from './AgentChatView.vue';
import ConversationView from './ConversationView.vue';
import type { AgentConversation, Agent } from '@/types/conversation';
// const route = useRoute();
const conversationsStore = useConversationsStore();
const chatUiStore = useChatUiStore();
const agentsStore = useAgentsStore();
// Computed
const activeConversation = computed(() => chatUiStore.activeConversation);

// Get only the open tabs (conversations that are in openConversationTabs array)
const openTabs = computed(() => {
  const tabs = chatUiStore.openConversationTabs
    .map(id => {
      const conv = conversationsStore.conversationById(id);
      return conv;
    })
    .filter(conv => conv !== undefined);
  return tabs;
});

const shouldUseTwoPaneView = computed(() => {
  // Enable two-pane view for all conversations
  // Regular agents: show deliverables in right pane
  // Orchestrator agents: show deliverables AND projects in right pane
  return true;
});

// Methods
const switchToConversation = async (conversationId: string) => {

  const existingConversation = conversationsStore.conversationById(conversationId);
  const existingMessages = conversationsStore.messagesByConversation(conversationId);


  // If conversation exists and has messages, just switch to it
  if (existingConversation && existingMessages && existingMessages.length > 0) {
    chatUiStore.setActiveConversation(conversationId);
    return;
  }

  // Otherwise, load the conversation data from backend
  try {
    const backendConversation = await conversationHelpers.getBackendConversation(conversationId);
    const messages = await conversationHelpers.loadConversationMessages(conversationId);


    // Ensure agents are loaded using agentsService
    if (!agentsStore.availableAgents || agentsStore.availableAgents.length === 0) {
      const agents = await agentsService.getAvailableAgents();
      agentsStore.setAvailableAgents(agents);
    }

    const agentName = backendConversation.agentName || (backendConversation as unknown as Record<string, unknown>).agent as string | undefined;
    const foundAgent = agentsStore.availableAgents?.find(a => a.name === agentName);

    if (!foundAgent) {
      console.error('Agent not found for conversation:', agentName);
      return;
    }

    // Ensure agent has required type field for Agent interface
    const agent = {
      ...foundAgent,
      type: foundAgent.type || 'custom'
    } as Agent;

    // Create the conversation object
    const createdAt = backendConversation.createdAt ? new Date(backendConversation.createdAt) : new Date();
    const loadedConversation = conversationHelpers.createConversationObject(agent, createdAt);
    loadedConversation.id = conversationId;
    loadedConversation.organizationSlug = (backendConversation as unknown as Record<string, unknown>).organizationSlug as string | undefined;
    loadedConversation.title = ((backendConversation as unknown as Record<string, unknown>).title as string | undefined) || loadedConversation.title;

    // Add or update conversation in the store
    // Convert AgentConversation to Conversation type for the store
    const storeConversation = {
      ...loadedConversation,
      agentName: agent.name,
      agentType: (agent.type as 'context' | 'function' | 'api' | 'orchestrator' | 'custom') || 'custom'
    };

    if (existingConversation) {
      conversationsStore.updateConversation(conversationId, storeConversation);
    } else {
      conversationsStore.setConversation(storeConversation);
    }

    // Set messages separately (the store manages messages in a separate Map)
    // Convert AgentChatMessage[] to Message[]
    const storeMessages = messages.map(msg => ({
      id: msg.id,
      conversationId: conversationId,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
      metadata: msg.metadata
    }));
    conversationsStore.setMessages(conversationId, storeMessages);

    // Verify messages were set - accessing to trigger reactivity
    void conversationsStore.messagesByConversation(conversationId);

    chatUiStore.setActiveConversation(conversationId);
  } catch (error) {
    console.error('Failed to load conversation:', error);
  }
};

const closeConversation = (conversationId: string) => {
  // Close the tab (but keep conversation data in store)
  chatUiStore.closeConversationTab(conversationId);
};

const handleSendMessage = async (content: string) => {
  const activeConv = chatUiStore.activeConversation;
  if (!activeConv || !activeConv.agentName) {
    console.error('Cannot send message: no active conversation');
    return;
  }

  try {
    const mode = chatUiStore.chatMode || 'conversational';

    // Route to appropriate action based on mode
    // All actions now use the orchestrator and get context from the store
    if (mode === 'plan') {
      await createPlan(content);
    } else if (mode === 'build') {
      await createDeliverable(content);
    } else {
      // converse mode (default)
      await sendMessageAction(content);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
};
</script>
<style scoped>
.conversation-tabs-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.conversation-tab-bar {
  border-bottom: 1px solid var(--ion-color-light);
  padding: 0;
}
.tab-scroll-wrapper {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.tab-scroll-wrapper::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
.conversation-tab {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-right: 1px solid var(--ion-color-light);
  background: var(--ion-color-step-100);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  min-width: 0;
  max-width: 250px;
  position: relative;
}
.conversation-tab:hover {
  background: var(--ion-color-step-150);
}
.conversation-tab.active {
  color: #8b5a3c;
  border-bottom: 2px solid #8b5a3c;
}
.tab-title {
  flex: 1;
  font-size: 0.9em;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}
.tab-close-button {
  --padding-start: 4px;
  --padding-end: 4px;
  --color: currentColor;
  opacity: 0.7;
  flex-shrink: 0;
}
.conversation-tab:hover .tab-close-button {
  opacity: 1;
}
.conversation-tab.active .tab-close-button {
  --color: #8b5a3c;
  opacity: 0.8;
}

/* Dark theme support */
html[data-theme="dark"] .conversation-tab.active {
  color: var(--ion-color-tertiary);
  border-bottom-color: var(--ion-color-tertiary);
}

html[data-theme="dark"] .conversation-tab.active .tab-close-button {
  --color: var(--ion-color-tertiary);
}
.conversation-tab-content {
  flex: 1;
  overflow: hidden;
}
.active-conversation {
  height: 100%;
}
.no-active-conversation {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-state {
  text-align: center;
  color: var(--ion-color-medium);
  max-width: 300px;
  padding: 40px 20px;
}
.empty-state ion-icon {
  margin-bottom: 16px;
}
.empty-state h3 {
  margin: 16px 0 8px 0;
  color: var(--ion-color-dark);
}
.empty-state p {
  margin: 0;
  line-height: 1.5;
}
/* Dark theme support */
/* @media (prefers-color-scheme: dark) {
  .conversation-tab-bar {
    background: #2d3748;
    border-color: #4a5568;
  }
  .conversation-tab {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }
  .conversation-tab:hover {
    background: #4b5563;
    color: #f3f4f6;
  }
  .conversation-tab.active {
    background: rgba(21, 128, 61, 0.15);
    color: #22c55e;
    border-bottom-color: #15803d;
  }
  .conversation-tab.active .tab-close-button {
    --color: #22c55e;
  }
  .empty-state {
    color: #9ca3af;
  }
  .empty-state h3 {
    color: #f3f4f6;
  }
}

html[data-theme="dark"] .conversation-tab-bar {
  background: #2d3748;
  border-color: #4a5568;
}
html[data-theme="dark"] .conversation-tab {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}
html[data-theme="dark"] .conversation-tab:hover {
  background: #4b5563;
  color: #f3f4f6;
}
html[data-theme="dark"] .conversation-tab.active {
  background: rgba(21, 128, 61, 0.15);
  color: #22c55e;
  border-bottom-color: #15803d;
}
html[data-theme="dark"] .conversation-tab.active .tab-close-button {
  --color: #22c55e;
}
html[data-theme="dark"] .empty-state {
  color: #9ca3af;
}
html[data-theme="dark"] .empty-state h3 {
  color: #f3f4f6;
} */
</style>