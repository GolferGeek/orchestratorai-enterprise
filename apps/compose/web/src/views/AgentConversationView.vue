<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/agents" />
        </ion-buttons>
        <ion-title>{{ agent?.displayName ?? agent?.name ?? agentSlug }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="contentRef">
      <div class="conversation-container">
        <!-- Message thread -->
        <ConversationThread :messages="conversationStore.activeMessages" />
      </div>
    </ion-content>

    <!-- Message input pinned to bottom -->
    <ion-footer>
      <MessageInput
        :disabled="conversationStore.isSending"
        :placeholder="`Message ${agent?.displayName ?? agentSlug}...`"
        @send="handleSend"
      />
    </ion-footer>
  </ion-page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter,
  IonButtons, IonBackButton,
} from '@ionic/vue';
import { useAgentsStore } from '@/stores/agents.store';
import { useConversationStore } from '@/stores/conversation.store';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useRbacStore } from '@/stores/rbacStore';
import { composeApiService } from '@/services/compose-api.service';
import ConversationThread from '@/components/conversation/ConversationThread.vue';
import MessageInput from '@/components/conversation/MessageInput.vue';

const route = useRoute();
const agentSlug = computed(() => route.params.agentSlug as string);

const agentsStore = useAgentsStore();
const conversationStore = useConversationStore();
const executionContextStore = useExecutionContextStore();
const conversationsStore = useConversationsStore();
const rbacStore = useRbacStore();

const contentRef = ref<HTMLElement | null>(null);

const agent = computed(() =>
  agentsStore.agentBySlug(agentSlug.value) ?? null
);

async function handleSend(userMessage: string): Promise<void> {
  const conversationId = executionContextStore.conversationId;
  if (!conversationId) {
    console.error('[AgentConversation] No conversationId — context not initialized');
    return;
  }

  // Add user message immediately to the store (optimistic update)
  conversationStore.addMessage(conversationId, {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  });

  conversationStore.setStatus(conversationId, 'sending');

  try {
    // ExecutionContext from store — never created inline
    const ctx = executionContextStore.current;

    const response = await composeApiService.sendMessage(agentSlug.value, {
      userMessage,
      context: ctx,
    });

    // Update ExecutionContext from response (backend may have set planId/deliverableId)
    executionContextStore.update(response.context);

    // Add assistant response
    conversationStore.addMessage(conversationId, {
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      metadata: response.metadata,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    console.error('[AgentConversation] sendMessage failed:', message);
    conversationStore.addMessage(conversationId, {
      id: crypto.randomUUID(),
      conversationId,
      role: 'system',
      content: `Error: ${message}`,
      timestamp: new Date().toISOString(),
    });
  } finally {
    conversationStore.setStatus(conversationId, 'idle');
  }
}

async function initConversation(): Promise<void> {
  const slug = agentSlug.value;
  if (!slug) return;

  // Wait for RBAC to finish initializing (token validation, user fetch, org load)
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  // Ensure agents are loaded — if navigating directly to a conversation URL,
  // AgentListView won't have mounted, so the store may be empty.
  if (!agentsStore.hasAgents) {
    const orgSlugForFetch = rbacStore.currentOrganization;
    const agents = await composeApiService.fetchAgents(orgSlugForFetch ?? undefined);
    agentsStore.setAgents(agents);
  }

  const agentInfo = agentsStore.agentBySlug(slug);
  const rbacUser = rbacStore.user;

  // Use the agent's own organization for the A2A call — agents are registered
  // under specific orgs (e.g. "legal"), not the user's current org selector.
  const orgSlug = agentInfo?.organizationSlug || rbacStore.currentOrganization;

  console.log('[AgentConversation] initConversation:', {
    slug,
    agentOrg: agentInfo?.organizationSlug,
    resolvedOrg: orgSlug,
    userOrg: rbacStore.currentOrganization,
  });

  if (!rbacUser || !orgSlug) {
    console.error('[AgentConversation] Cannot init conversation: missing user or org', {
      hasUser: !!rbacUser,
      hasOrg: !!orgSlug,
    });
    return;
  }

  // Create a conversation record via the existing conversations service
  const newConversation = conversationsStore.activeConversation
    ?? null;

  // Use existing conversation if active, otherwise initialize a fresh context
  const conversationId = newConversation?.id ?? crypto.randomUUID();

  executionContextStore.initialize({
    orgSlug,
    userId: rbacUser.id,
    conversationId,
    agentSlug: slug,
    agentType: agentInfo?.agentType ?? 'context',
    provider: agentInfo?.metadata?.defaultProvider as string ?? import.meta.env.VITE_DEFAULT_LLM_PROVIDER ?? 'ollama',
    model: agentInfo?.metadata?.defaultModel as string ?? import.meta.env.VITE_DEFAULT_LLM_MODEL ?? 'qwen2.5:7b',
  });

  conversationStore.setActiveConversation(conversationId);
}

onMounted(async () => {
  await initConversation();
});

// Re-init if agent changes (e.g. navigating between agents without unmounting)
watch(agentSlug, async () => {
  await initConversation();
});
</script>

<style scoped>
.conversation-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 16px;
}
</style>
