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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter,
  IonButtons, IonBackButton,
} from '@ionic/vue';
import { useAgentsStore } from '@/stores/agents.store';
import { useConversationStore } from '@/stores/conversation.store';
import type { ConversationMessage } from '@/stores/conversation.store';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useRbacStore } from '@/stores/rbacStore';
import { composeApiService } from '@/services/compose-api.service';
import { useVoiceChat } from '@/composables/useVoiceChat';
import ConversationThread from '@/components/conversation/ConversationThread.vue';
import MessageInput from '@/components/conversation/MessageInput.vue';
import type { SendPayload } from '@/components/conversation/MessageInput.vue';
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

const voiceChat = useVoiceChat();

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

async function handleSend(payload: SendPayload): Promise<void> {
  const conversationId = executionContextStore.conversationId;
  if (!conversationId) {
    console.error('[AgentConversation] No conversationId — context not initialized');
    return;
  }

  const { message: userMessage, attachments } = payload;

  // Add user message immediately to the store (optimistic update)
  // Store only display metadata for attachments (no base64 in the store)
  conversationStore.addMessage(conversationId, {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
    })),
  });

  conversationStore.setStatus(conversationId, 'sending');

  try {
    // ExecutionContext from store — never created inline
    const ctx = executionContextStore.current;

    const interactionMode = voiceChat.isVoiceMode.value ? 'voice' : 'text';

    const response = await composeApiService.sendMessage(agentSlug.value, {
      userMessage,
      context: ctx,
      attachments,
      interactionMode,
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

    // Auto-speak the response when in voice mode
    if (voiceChat.isVoiceMode.value && response.message) {
      voiceChat.speakResponse(response.message).catch((err) => {
        console.error('[AgentConversation] TTS failed:', err instanceof Error ? err.message : err);
      });
    }
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

  // When resuming a specific conversation from the route, load persisted messages.
  // New conversations (no routeConversationId) start empty — no fetch needed.
  if (routeConversationId) {
    try {
      const items = await composeApiService.fetchMessages(routeConversationId);
      const mapped: ConversationMessage[] = items.map((item) => ({
        id: item.id,
        conversationId: routeConversationId,
        role: item.role,
        content: item.content,
        outputType: item.outputType,
        timestamp: item.createdAt,
        attachments: item.attachments ?? undefined,
        metadata: item.metadata as ConversationMessage['metadata'],
      }));
      conversationStore.setMessages(routeConversationId, mapped);
    } catch (err) {
      console.error(
        '[AgentConversation] Failed to load message history:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

onMounted(async () => {
  await initConversation();
});

onUnmounted(() => {
  voiceChat.cleanup();
});

// Re-init if agent or conversation changes — skip the initial trigger (onMounted handles it)
watch([agentSlug, conversationIdFromRoute], async (newVal, oldVal) => {
  // Skip if values haven't actually changed (avoids double-init on mount)
  if (oldVal && (newVal[0] !== oldVal[0] || newVal[1] !== oldVal[1])) {
    await initConversation();
  }
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
