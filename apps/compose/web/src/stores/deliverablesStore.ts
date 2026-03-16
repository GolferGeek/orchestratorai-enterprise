/**
 * Deliverables Store - State + Synchronous Mutations Only
 *
 * Architecture: Stores contain ONLY state and synchronous mutations
 * For async operations, use deliverablesService or deliverablesActions helpers
 *
 * Phase 4.1 Refactoring: Removed all async methods
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Deliverable,
  DeliverableVersion,
} from '@/services/deliverablesService.types';

interface DeliverablesState {
  deliverables: Map<string, Deliverable>;
  deliverableVersions: Record<string, DeliverableVersion[]>;
  conversationDeliverables: Map<string, string[]>;
  currentVersions: Map<string, DeliverableVersion>;
  isLoading: boolean;
  error: string | null;
}

export const useDeliverablesStore = defineStore('deliverables', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<DeliverablesState>({
    deliverables: new Map(),
    deliverableVersions: {},
    conversationDeliverables: new Map(),
    currentVersions: new Map(),
    isLoading: false,
    error: null,
  });

  const versionsUpdateCounter = ref(0);

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const deliverables = computed(() => Array.from(state.value.deliverables.values()));
  const isLoading = computed(() => state.value.isLoading);
  const error = computed(() => state.value.error);

  const hasDeliverables = computed(() => deliverables.value.length > 0);

  const recentDeliverables = computed(() =>
    deliverables.value
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
  );

  const deliverablesByType = computed(() => {
    const grouped: Record<string, Deliverable[]> = {
      'document': [],
      'analysis': [],
      'report': [],
      'plan': [],
      'requirements': [],
      'image': [],
      'video': [],
    };
    deliverables.value.forEach(deliverable => {
      const type = (deliverable.type || 'document').toLowerCase();
      if (grouped[type]) {
        grouped[type].push(deliverable);
      } else {
        grouped['document'].push(deliverable);
      }
    });
    return grouped;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  const getDeliverableById = (id: string): Deliverable | null => {
    return state.value.deliverables.get(id) || null;
  };

  const getDeliverablesByConversation = (conversationId: string): Deliverable[] => {
    const deliverableIds = state.value.conversationDeliverables.get(conversationId) || [];
    return deliverableIds
      .map(id => state.value.deliverables.get(id))
      .filter(Boolean) as Deliverable[];
  };

  const getCurrentVersion = (deliverableId: string): DeliverableVersion | null => {
    return state.value.currentVersions.get(deliverableId) || null;
  };

  const getDeliverableVersionsSync = (deliverableId: string): DeliverableVersion[] => {
    return state.value.deliverableVersions[deliverableId] || [];
  };

  const getConversationDeliverableIds = (conversationId: string): string[] => {
    return state.value.conversationDeliverables.get(conversationId) || [];
  };

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  function addDeliverable(deliverable: Deliverable) {
    state.value.deliverables.set(deliverable.id, deliverable);

    // Add to conversation mapping if conversationId exists
    if (deliverable.conversationId) {
      const existing = state.value.conversationDeliverables.get(deliverable.conversationId) || [];
      if (!existing.includes(deliverable.id)) {
        state.value.conversationDeliverables.set(
          deliverable.conversationId,
          [...existing, deliverable.id]
        );
      }
    }

    // Store current version if provided
    if (deliverable.currentVersion) {
      state.value.currentVersions.set(deliverable.id, deliverable.currentVersion);
    }
  }

  function removeDeliverable(deliverableId: string) {
    const deliverable = state.value.deliverables.get(deliverableId);

    // Remove from deliverables map
    state.value.deliverables.delete(deliverableId);

    // Remove from conversation mapping
    if (deliverable?.conversationId) {
      const ids = state.value.conversationDeliverables.get(deliverable.conversationId) || [];
      state.value.conversationDeliverables.set(
        deliverable.conversationId,
        ids.filter(id => id !== deliverableId)
      );
    }

    // Remove versions
    delete state.value.deliverableVersions[deliverableId];

    // Remove current version
    state.value.currentVersions.delete(deliverableId);
  }

  function addVersion(deliverableId: string, version: DeliverableVersion) {
    const existing = state.value.deliverableVersions[deliverableId] || [];

    // Remove existing version with same ID if present, then add new one
    const filtered = existing.filter(v => v.id !== version.id);
    const newVersions = [...filtered, version].sort((a, b) => b.versionNumber - a.versionNumber);

    state.value.deliverableVersions[deliverableId] = newVersions;
    versionsUpdateCounter.value++;

    // Update current version if this is marked as current
    if (version.isCurrentVersion) {
      state.value.currentVersions.set(deliverableId, version);

      // Update the deliverable's currentVersion if it exists in store
      const deliverable = state.value.deliverables.get(deliverableId);
      if (deliverable) {
        deliverable.currentVersion = version;
      }
    }
  }

  function removeVersion(deliverableId: string, versionId: string) {
    const versions = state.value.deliverableVersions[deliverableId] || [];
    state.value.deliverableVersions[deliverableId] = versions.filter(v => v.id !== versionId);
    versionsUpdateCounter.value++;
  }

  function clearAll() {
    state.value.deliverables.clear();
    state.value.conversationDeliverables.clear();
    state.value.currentVersions.clear();
    state.value.deliverableVersions = {};
    versionsUpdateCounter.value++;
  }

  function handleConversationDeleted(conversationId: string) {
    // Update deliverables that were linked to this conversation
    state.value.deliverables.forEach((deliverable, id) => {
      if (deliverable.conversationId === conversationId) {
        deliverable.conversationId = undefined;
        state.value.deliverables.set(id, deliverable);
      }
    });

    // Remove from conversation deliverables mapping
    state.value.conversationDeliverables.delete(conversationId);
  }

  function setCurrentVersion(deliverableId: string, versionId: string) {
    // Find the version and mark it as current
    const versions = state.value.deliverableVersions[deliverableId] || [];
    const version = versions.find(v => v.id === versionId);

    if (version) {
      // Mark all versions as not current
      versions.forEach(v => {
        v.isCurrentVersion = false;
      });

      // Mark this version as current
      version.isCurrentVersion = true;
      state.value.currentVersions.set(deliverableId, version);

      // Update the deliverable's currentVersion if it exists
      const deliverable = state.value.deliverables.get(deliverableId);
      if (deliverable) {
        deliverable.currentVersion = version;
      }

      versionsUpdateCounter.value++;
    }
  }

  function associateDeliverableWithConversation(deliverableId: string, conversationId: string) {
    const existing = state.value.conversationDeliverables.get(conversationId) || [];
    if (!existing.includes(deliverableId)) {
      state.value.conversationDeliverables.set(conversationId, [...existing, deliverableId]);
    }
  }

  function deliverablesByConversation(conversationId: string): Deliverable[] {
    return getDeliverablesByConversation(conversationId);
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    deliverables,
    isLoading,
    error,
    hasDeliverables,
    recentDeliverables,
    deliverablesByType,

    // Getters
    getDeliverableById,
    getDeliverablesByConversation,
    getCurrentVersion,
    getDeliverableVersionsSync,
    getConversationDeliverableIds,

    // Mutations
    setLoading,
    setError,
    clearError,
    addDeliverable,
    removeDeliverable,
    addVersion,
    removeVersion,
    clearAll,
    handleConversationDeleted,
    setCurrentVersion,
    associateDeliverableWithConversation,
    deliverablesByConversation,

    // Reactivity trigger for version updates
    versionsUpdateCounter,
  };
});
