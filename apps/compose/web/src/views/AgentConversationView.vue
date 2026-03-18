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
      <CompactLLMControl
        :agent-type="agent?.agentType"
        :media-type="agentMediaType"
      />
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
import CompactLLMControl from '@/components/llm/CompactLLMControl.vue';

const route = useRoute();
const agentSlug = computed(() => route.params.agentSlug as string);
const conversationIdFromRoute = computed(() => route.query.id as string | undefined);

const agentsStore = useAgentsStore();
const conversationStore = useConversationStore();
const executionContextStore = useExecutionContextStore();
const conversationsStore = useConversationsStore();
const rbacStore = useRbacStore();

const contentRef = ref<HTMLElement | null>(null);

const agent = computed(() =>
  agentsStore.agentBySlug(agentSlug.value) ?? null
);

/** Resolve media subtype for image/video agents so the LLM selector filters correctly */
const agentMediaType = computed<'image' | 'video' | undefined>(() => {
  if (agent.value?.agentType !== 'media') return undefined;
  const slug = agent.value.slug ?? '';
  if (slug.includes('video')) return 'video';
  return 'image';
});

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
      outputType: response.outputType,
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

  // If the route includes ?id=, resume that conversation; otherwise start fresh.
  const routeConversationId = conversationIdFromRoute.value;
  const existingConversation = conversationsStore.activeConversation ?? null;

  // Use the route's conversation id first, then active conversation, then a new UUID.
  const conversationId =
    routeConversationId ?? existingConversation?.id ?? crypto.randomUUID();

  // Default provider/model — media agents need image/video-capable providers
  let defaultProvider = import.meta.env.VITE_DEFAULT_LLM_PROVIDER ?? 'ollama';
  let defaultModel = import.meta.env.VITE_DEFAULT_LLM_MODEL ?? 'qwen2.5:7b';
  if (agentInfo?.agentType === 'media') {
    defaultProvider = 'openai';
    defaultModel = slug.includes('video') ? 'sora-2' : 'gpt-image-1';
  }

  // Load LLM store so the CompactLLMControl has the right provider/model list
  const llmStore = (await import('@/stores/llm.store')).useLLMStore();
  const mediaType = agentInfo?.agentType === 'media'
    ? (slug.includes('video') ? 'video' as const : 'image' as const)
    : undefined;
  await llmStore.loadForAgentType(agentInfo?.agentType ?? 'context', mediaType);

  // Use LLM store selection if available (persisted from prior use), else agent defaults
  const provider = llmStore.selectedProvider || defaultProvider;
  const model = llmStore.selectedModel || defaultModel;

  executionContextStore.initialize({
    orgSlug,
    userId: rbacUser.id,
    conversationId,
    agentSlug: slug,
    agentType: agentInfo?.agentType ?? 'context',
    provider,
    model,
  });

  conversationStore.setActiveConversation(conversationId);
}

onMounted(async () => {
  await initConversation();
});

// Re-init if agent changes or conversation id changes via query param
watch([agentSlug, conversationIdFromRoute], async () => {
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
