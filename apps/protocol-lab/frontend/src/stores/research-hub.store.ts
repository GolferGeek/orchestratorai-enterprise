import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentCard } from '../types';
import type { ResearchCategory, Narrative, Article, ScoutSignal } from '../types';
import { useApi } from '../composables/useApi';

export const useResearchHubStore = defineStore('research-hub', () => {
  const { researchHubApi } = useApi();

  const categories = ref<ResearchCategory[]>([]);
  const narratives = ref<Narrative[]>([]);
  const articles = ref<Article[]>([]);
  const currentArticle = ref<Article | null>(null);
  const scoutSignals = ref<ScoutSignal[]>([]);
  const agentCard = ref<AgentCard | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchCategories() {
    loading.value = true;
    error.value = null;
    try {
      categories.value = await researchHubApi.get<ResearchCategory[]>('/api/categories');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchNarrative(personality: string) {
    loading.value = true;
    error.value = null;
    try {
      const narrative = await researchHubApi.get<Narrative>(`/api/narratives/${personality}`);
      const existing = narratives.value.findIndex((n) => n.personality === personality);
      if (existing >= 0) {
        narratives.value[existing] = narrative;
      } else {
        narratives.value.push(narrative);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchArticles() {
    loading.value = true;
    error.value = null;
    try {
      articles.value = await researchHubApi.get<Article[]>('/api/articles');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchArticle(id: string) {
    loading.value = true;
    error.value = null;
    try {
      currentArticle.value = await researchHubApi.get<Article>(`/api/articles/${id}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchScoutSignals() {
    loading.value = true;
    error.value = null;
    try {
      scoutSignals.value = await researchHubApi.get<ScoutSignal[]>('/api/scout/watchlist');
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
      agentCard.value = await researchHubApi.get<AgentCard>('/api/agent-card');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    categories,
    narratives,
    articles,
    currentArticle,
    scoutSignals,
    agentCard,
    loading,
    error,
    fetchCategories,
    fetchNarrative,
    fetchArticles,
    fetchArticle,
    fetchScoutSignals,
    fetchAgentCard,
  };
});
