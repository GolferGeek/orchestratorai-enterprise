import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useApi } from '../composables/useApi';
import type {
  MiniMeAgentCard,
  MiniMeConversationEntry,
  MiniMeInboxRequest,
  A2AResponse,
  A2AArtifact,
} from '../types';

export const useMiniMeStore = defineStore('mini-me', () => {
  const { miniMeApi } = useApi();

  const agentCard = ref<MiniMeAgentCard | null>(null);
  const connected = ref(false);
  const conversation = ref<MiniMeConversationEntry[]>([]);
  const inbox = ref<MiniMeInboxRequest[]>([]);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);
  let messageCounter = 0;

  const skills = computed(() => agentCard.value?.skills ?? []);

  async function checkStatus() {
    try {
      await miniMeApi.get('/api/status');
      connected.value = true;
    } catch {
      connected.value = false;
      throw new Error('Mini-Me is not reachable at http://gg-macstudio:3030');
    }
  }

  async function fetchAgentCard() {
    loading.value = true;
    error.value = null;
    try {
      agentCard.value = await miniMeApi.get<MiniMeAgentCard>('/.well-known/agent-card.json');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function sendMessage(text: string, forcedSkill?: string): Promise<void> {
    sending.value = true;
    error.value = null;
    messageCounter++;

    const parts: { type: string; text?: string; data?: Record<string, unknown>; mimeType?: string }[] = [
      { type: 'text', text },
    ];

    if (forcedSkill) {
      parts.push({
        type: 'data',
        data: { skill: forcedSkill },
        mimeType: 'application/json',
      });
    }

    const request = {
      jsonrpc: '2.0',
      id: messageCounter,
      method: 'message/send',
      params: {
        message: {
          messageId: `msg-${Date.now()}-${messageCounter}`,
          role: 'user',
          parts,
        },
      },
    };

    const userEntry: MiniMeConversationEntry = {
      id: `user-${Date.now()}`,
      timestamp: new Date().toISOString(),
      role: 'user',
      text,
      skill: forcedSkill,
      rawRequest: request,
    };
    conversation.value.push(userEntry);

    try {
      const response = await miniMeApi.post<A2AResponse>('/a2a', request);

      if (response.error) {
        const errMsg = `Protocol error ${response.error.code}: ${response.error.message}`;
        error.value = errMsg;
        throw new Error(errMsg);
      }

      const result = response.result!;
      const summaryText = result.status.message?.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n') ?? '';

      const routedSkill = extractSkillFromArtifacts(result.artifacts);

      const agentEntry: MiniMeConversationEntry = {
        id: `agent-${Date.now()}`,
        timestamp: new Date().toISOString(),
        role: 'agent',
        text: summaryText,
        skill: routedSkill,
        artifacts: result.artifacts,
        rawResponse: response,
      };
      conversation.value.push(agentEntry);
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : String(e);
      }
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function sendWorkRequest(subject: string, message: string, priority = 'normal'): Promise<void> {
    sending.value = true;
    error.value = null;
    messageCounter++;

    const request = {
      jsonrpc: '2.0',
      id: messageCounter,
      method: 'message/send',
      params: {
        message: {
          messageId: `req-${Date.now()}-${messageCounter}`,
          role: 'user',
          parts: [
            { type: 'text', text: message },
            {
              type: 'data',
              mimeType: 'application/json',
              data: {
                skill: 'agent-request',
                from: 'Agent Communication Playground',
                subject,
                priority,
              },
            },
          ],
        },
      },
    };

    const userEntry: MiniMeConversationEntry = {
      id: `user-${Date.now()}`,
      timestamp: new Date().toISOString(),
      role: 'user',
      text: `[Work Request] ${subject}: ${message}`,
      skill: 'agent-request',
      rawRequest: request,
    };
    conversation.value.push(userEntry);

    try {
      const response = await miniMeApi.post<A2AResponse>('/a2a', request);

      if (response.error) {
        const errMsg = `Protocol error ${response.error.code}: ${response.error.message}`;
        error.value = errMsg;
        throw new Error(errMsg);
      }

      const result = response.result!;
      const summaryText = result.status.message?.parts
        ?.filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n') ?? '';

      const agentEntry: MiniMeConversationEntry = {
        id: `agent-${Date.now()}`,
        timestamp: new Date().toISOString(),
        role: 'agent',
        text: summaryText,
        skill: 'agent-request',
        artifacts: result.artifacts,
        rawResponse: response,
      };
      conversation.value.push(agentEntry);

      await fetchInbox();
    } catch (e) {
      if (!error.value) {
        error.value = e instanceof Error ? e.message : String(e);
      }
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function fetchInbox() {
    try {
      const data = await miniMeApi.get<{ requests: MiniMeInboxRequest[]; count: number }>('/api/a2a-requests');
      inbox.value = data.requests;
    } catch {
      // Inbox endpoint may not exist yet — not a fatal error
      inbox.value = [];
    }
  }

  function clearConversation() {
    conversation.value = [];
    error.value = null;
  }

  return {
    agentCard,
    connected,
    conversation,
    inbox,
    loading,
    sending,
    error,
    skills,
    checkStatus,
    fetchAgentCard,
    sendMessage,
    sendWorkRequest,
    fetchInbox,
    clearConversation,
  };
});

function extractSkillFromArtifacts(artifacts?: A2AArtifact[]): string | undefined {
  if (!artifacts?.length) return undefined;
  const resultArtifact = artifacts.find((a) => a.name.endsWith('-result'));
  if (resultArtifact) {
    return resultArtifact.name.replace('-result', '');
  }
  const summaryArtifact = artifacts.find((a) => a.name.endsWith('-summary'));
  if (summaryArtifact) {
    return summaryArtifact.name.replace('-summary', '');
  }
  return undefined;
}
