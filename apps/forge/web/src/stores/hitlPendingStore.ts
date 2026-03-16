import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { HitlPendingItem } from '@orchestrator-ai/transport-types';
import { a2aOrchestrator } from '@/services/agent2agent/orchestrator';
import { useAuthStore } from './rbacStore';

export const useHitlPendingStore = defineStore('hitlPending', () => {
  // State
  const items = ref<HitlPendingItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetched = ref<Date | null>(null);

  // Getters
  const count = computed(() => items.value.length);
  const hasItems = computed(() => items.value.length > 0);

  const sortedItems = computed(() => {
    return [...items.value].sort((a, b) => {
      // Sort by pending since, newest first
      return new Date(b.pendingSince).getTime() - new Date(a.pendingSince).getTime();
    });
  });

  // Actions
  async function fetchPendingReviews() {
    const authStore = useAuthStore();
    const orgSlug = authStore.currentOrganization;

    if (!orgSlug) {
      error.value = 'No organization selected';
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      // Use orchestrator to fetch pending reviews
      const result = await a2aOrchestrator.execute('hitl.pending', { agentSlug: '_system' });

      if (result.type === 'error') {
        error.value = result.error;
        console.error('Failed to fetch HITL pending reviews:', result.error);
      } else {
        // The result.message contains the count, but we need to handle this properly
        // For now, we clear items since the orchestrator doesn't return the full list
        // TODO: Update response-switch to properly return pending items
        items.value = [];
        lastFetched.value = new Date();
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch pending reviews';
      console.error('Failed to fetch HITL pending reviews:', e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Add a new pending item (called when workflow returns HITL response)
   * Uses taskId as the key since hitl_pending is on tasks table
   */
  function addPendingItem(item: HitlPendingItem) {
    // Remove existing item for same task if present
    items.value = items.value.filter((i) => i.taskId !== item.taskId);
    // Add new item
    items.value.push(item);
  }

  /**
   * Remove a pending item (called when user makes decision)
   * Uses taskId as the key
   */
  function removePendingItem(taskId: string) {
    items.value = items.value.filter((i) => i.taskId !== taskId);
  }

  /**
   * Clear all items (e.g., on logout)
   */
  function clear() {
    items.value = [];
    lastFetched.value = null;
    error.value = null;
  }

  return {
    // State
    items,
    loading,
    error,
    lastFetched,
    // Getters
    count,
    hasItems,
    sortedItems,
    // Actions
    fetchPendingReviews,
    addPendingItem,
    removePendingItem,
    clear,
  };
});
