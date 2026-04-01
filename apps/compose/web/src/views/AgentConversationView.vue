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
      <!-- Empty state: centered prompt -->
      <div v-if="!hasMessages" class="welcome-container">
        <h2 class="welcome-title">{{ agent?.displayName ?? agentSlug }}</h2>
        <p class="welcome-sub">{{ agent?.metadata?.description || 'How can I help you today?' }}</p>
        <MessageInput
          :disabled="conversationStore.isSending"
          :placeholder="`Message ${agent?.displayName ?? agentSlug}...`"
          :centered="true"
          :agent-type="agent?.agentType"
          :media-type="agentMediaType"
          @send="handleSend"
        />
      </div>

      <!-- Active conversation: message thread -->
      <div v-else class="conversation-container">
        <ConversationThread :messages="conversationStore.activeMessages" />
      </div>
    </ion-content>

    <!-- Active conversation: input pinned to bottom -->
    <ion-footer v-if="hasMessages">
      <MessageInput
        :disabled="conversationStore.isSending"
        :placeholder="`Message ${agent?.displayName ?? agentSlug}...`"
        :centered="false"
        :agent-type="agent?.agentType"
        :media-type="agentMediaType"
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

const hasMessages = computed(() =>
  (conversationStore.activeMessages?.length ?? 0) > 0
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
    const ctx = executionContextStore.current;

    const interactionMode = voiceChat.isVoiceMode.value ? 'voice' : 'text';

    const response = await composeApiService.sendMessage(agentSlug.value, {
      userMessage,
      context: ctx,
      attachments,
      interactionMode,
    });

    executionContextStore.update(response.context);

    conversationStore.addMessage(conversationId, {
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content: response.message,
      outputType: response.outputType,
      timestamp: new Date().toISOString(),
      metadata: response.metadata,
    });

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

  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  if (!agentsStore.hasAgents) {
    const orgSlugForFetch = rbacStore.currentOrganization;
    const agents = await composeApiService.fetchAgents(orgSlugForFetch ?? undefined);
    agentsStore.setAgents(agents);
  }

  const agentInfo = agentsStore.agentBySlug(slug);
  const rbacUser = rbacStore.user;

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

  const routeConversationId = conversationIdFromRoute.value;
  const existingConversation = conversationsStore.activeConversation ?? null;

  const conversationId =
    routeConversationId ?? existingConversation?.id ?? crypto.randomUUID();

  let defaultProvider = import.meta.env.VITE_DEFAULT_LLM_PROVIDER ?? 'ollama';
  let defaultModel = import.meta.env.VITE_DEFAULT_LLM_MODEL ?? 'qwen2.5:7b';
  if (agentInfo?.agentType === 'media') {
    defaultProvider = 'openai';
    defaultModel = slug.includes('video') ? 'sora-2' : 'gpt-image-1';
  }

  const llmStore = (await import('@/stores/llm.store')).useLLMStore();
  const mediaType = agentInfo?.agentType === 'media'
    ? (slug.includes('video') ? 'video' as const : 'image' as const)
    : undefined;
  await llmStore.loadForAgentType(agentInfo?.agentType ?? 'context', mediaType);

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

watch([agentSlug, conversationIdFromRoute], async (newVal, oldVal) => {
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

.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 48px 32px;
  text-align: center;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-text-color);
  margin: 0 0 8px;
}

.welcome-sub {
  font-size: 0.95rem;
  color: var(--ion-color-medium);
  margin: 0 0 32px;
  max-width: 480px;
  line-height: 1.5;
}
</style>
