import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentCard } from '../types';
import type { Draft, Topic, WorkflowExecution } from '../types';
import { useApi } from '../composables/useApi';

export const useContentForgeStore = defineStore('content-forge', () => {
  const { contentForgeApi } = useApi();

  const drafts = ref<Draft[]>([]);
  const topics = ref<Topic[]>([]);
  const workflowHistory = ref<WorkflowExecution[]>([]);
  const currentDraft = ref<Draft | null>(null);
  const agentCard = ref<AgentCard | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDrafts() {
    loading.value = true;
    error.value = null;
    try {
      drafts.value = await contentForgeApi.get<Draft[]>('/api/drafts');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDraft(id: string) {
    loading.value = true;
    error.value = null;
    try {
      currentDraft.value = await contentForgeApi.get<Draft>(`/api/drafts/${id}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createDraft(draft: { title: string; content: string }) {
    loading.value = true;
    error.value = null;
    try {
      const newDraft = await contentForgeApi.post<Draft>('/api/drafts', draft);
      drafts.value.push(newDraft);
      return newDraft;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateDraft(id: string, updates: Partial<Draft>) {
    loading.value = true;
    error.value = null;
    try {
      const updated = await contentForgeApi.put<Draft>(`/api/drafts/${id}`, updates);
      const idx = drafts.value.findIndex((d) => d.id === id);
      if (idx >= 0) {
        drafts.value[idx] = updated;
      }
      if (currentDraft.value?.id === id) {
        currentDraft.value = updated;
      }
      return updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteDraft(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await contentForgeApi.del(`/api/drafts/${id}`);
      drafts.value = drafts.value.filter((d) => d.id !== id);
      if (currentDraft.value?.id === id) {
        currentDraft.value = null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchTopics() {
    loading.value = true;
    error.value = null;
    try {
      topics.value = await contentForgeApi.get<Topic[]>('/api/topics');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchWorkflowHistory() {
    loading.value = true;
    error.value = null;
    try {
      workflowHistory.value = await contentForgeApi.get<WorkflowExecution[]>('/api/workflow/history');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function executeWorkflow(topic: string) {
    loading.value = true;
    error.value = null;
    try {
      const execution = await contentForgeApi.post<WorkflowExecution>('/api/workflow/execute', { topic });
      workflowHistory.value.unshift(execution);
      return execution;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function generateDraft(topic: string) {
    loading.value = true;
    error.value = null;
    try {
      const draft = await contentForgeApi.post<Draft>('/api/drafts/generate', { topic });
      drafts.value.unshift(draft);
      return draft;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchAgentCard() {
    loading.value = true;
    error.value = null;
    try {
      agentCard.value = await contentForgeApi.get<AgentCard>('/api/agent-card');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    drafts,
    topics,
    workflowHistory,
    currentDraft,
    agentCard,
    loading,
    error,
    fetchDrafts,
    fetchDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    fetchTopics,
    fetchWorkflowHistory,
    executeWorkflow,
    generateDraft,
    fetchAgentCard,
  };
});
