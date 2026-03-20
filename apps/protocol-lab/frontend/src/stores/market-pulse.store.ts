import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentCard } from '../types';
import type { Feed, TrendingTopic, QueueItem } from '../types';
import { useApi } from '../composables/useApi';

export const useMarketPulseStore = defineStore('market-pulse', () => {
  const { marketPulseApi } = useApi();

  const feeds = ref<Feed[]>([]);
  const trending = ref<TrendingTopic[]>([]);
  const queue = ref<QueueItem[]>([]);
  const agentCard = ref<AgentCard | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchFeeds() {
    loading.value = true;
    error.value = null;
    try {
      feeds.value = await marketPulseApi.get<Feed[]>('/api/feeds');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function addFeed(feed: { name: string; url: string; type: Feed['type'] }) {
    loading.value = true;
    error.value = null;
    try {
      const newFeed = await marketPulseApi.post<Feed>('/api/feeds', feed);
      feeds.value.push(newFeed);
      return newFeed;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchTrending() {
    loading.value = true;
    error.value = null;
    try {
      trending.value = await marketPulseApi.get<TrendingTopic[]>('/api/trending');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchQueue() {
    loading.value = true;
    error.value = null;
    try {
      queue.value = await marketPulseApi.get<QueueItem[]>('/api/queue');
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
      agentCard.value = await marketPulseApi.get<AgentCard>('/api/agent-card');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    feeds,
    trending,
    queue,
    agentCard,
    loading,
    error,
    fetchFeeds,
    addFeed,
    fetchTrending,
    fetchQueue,
    fetchAgentCard,
  };
});
