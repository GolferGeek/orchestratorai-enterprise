import { defineStore } from 'pinia';

// =====================================
// TYPES
// =====================================

export type ContextType = 'conversation' | 'deliverable';

export interface ContextState {
  activeContext: ContextType;
  activeDeliverableId: string | null;
  // Track which pane should show the prompt input
  promptInputLocation: 'conversation' | 'deliverable';
}

/**
 * Context metadata for task creation
 * Base metadata structure with type-safe extensions
 */
export interface ContextMetadata {
  context: ContextType;
  deliverableId?: string;
  method?: 'create' | 'delete' | 'newVersion' | 'merge' | 'update' | string;

  // Operation-specific fields
  versionIds?: string[];
  baseVersionId?: string;
  agentType?: string;
  agentName?: string;

  // Additional typed metadata fields
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  notes?: string;
}
/**
 * Context Store - Manages active UI context for metadata-driven operations
 *
 * This store tracks whether the user is currently working in:
 * - Conversation context (general agent chat)
 * - Deliverable context (working on a specific deliverable)
 *
 * It also determines where the prompt input should appear and what metadata
 * should be sent with tasks to enable proper backend routing.
 */
export const useContextStore = defineStore('context', {
  state: (): ContextState => ({
    activeContext: 'conversation',
    activeDeliverableId: null,
    promptInputLocation: 'conversation',
  }),
  getters: {
    /**
     * Get the current context metadata for task creation
     */
    contextMetadata(): ContextMetadata {
      switch (this.activeContext) {
        case 'deliverable':
          return {
            context: 'deliverable',
            deliverableId: this.activeDeliverableId || undefined
          };
        case 'conversation':
        default:
          return { context: 'conversation' };
      }
    },
    /**
     * Check if we're in deliverable context
     */
    isDeliverableContext(): boolean {
      return this.activeContext === 'deliverable' && !!this.activeDeliverableId;
    },
    /**
     * Check if we're in conversation context
     */
    isConversationContext(): boolean {
      return this.activeContext === 'conversation';
    },
    /**
     * Get context display name for UI
     */
    contextDisplayName(): string {
      switch (this.activeContext) {
        case 'deliverable':
          return this.activeDeliverableId ? `Deliverable ${this.activeDeliverableId.slice(0, 8)}...` : 'Deliverable';
        case 'conversation':
        default:
          return 'Conversation';
      }
    },
  },
  actions: {
    /**
     * Switch to conversation context
     */
    setConversationContext() {
      this.activeContext = 'conversation';
      this.activeDeliverableId = null;
      this.promptInputLocation = 'conversation';
    },
    /**
     * Switch to deliverable context
     */
    setDeliverableContext(deliverableId: string) {
      this.activeContext = 'deliverable';
      this.activeDeliverableId = deliverableId;
      this.promptInputLocation = 'deliverable';
    },
    /**
     * Clear all context (return to conversation)
     */
    clearContext() {
      this.setConversationContext();
    },
    /**
     * Create task metadata for version deletion
     */
    createDeleteMetadata(versionIds: string[]): ContextMetadata {
      if (!this.isDeliverableContext) {
        throw new Error('Delete operation requires deliverable context');
      }
      return {
        ...this.contextMetadata,
        method: 'delete',
        versionIds,
      };
    },
    /**
     * Create task metadata for new version creation
     */
    createNewVersionMetadata(baseVersionId?: string): ContextMetadata {
      if (!this.isDeliverableContext) {
        throw new Error('New version operation requires deliverable context');
      }
      const metadata: ContextMetadata = {
        ...this.contextMetadata,
        method: 'newVersion',
      };
      if (baseVersionId) {
        metadata.baseVersionId = baseVersionId;
      }
      return metadata;
    },
    /**
     * Create task metadata for version merging
     */
    createMergeMetadata(versionIds: string[]): ContextMetadata {
      if (!this.isDeliverableContext) {
        throw new Error('Merge operation requires deliverable context');
      }
      if (versionIds.length < 2) {
        throw new Error('Merge operation requires at least 2 versions');
      }
      return {
        ...this.contextMetadata,
        method: 'merge',
        versionIds,
      };
    },
    /**
     * Create task metadata for new deliverable creation
     */
    createNewDeliverableMetadata(agentType: string, agentName: string): ContextMetadata {
      return {
        context: 'deliverable',
        method: 'create',
        agentType,
        agentName,
      };
    },
    /**
     * Get metadata for regular conversation
     */
    createConversationMetadata(): ContextMetadata {
      return { context: 'conversation' };
    },
  },
});
