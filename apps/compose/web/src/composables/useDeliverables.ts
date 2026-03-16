import { ref, computed } from 'vue';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import {
  DeliverableType,
  DeliverableFormat,
  DeliverableVersionCreationType,
  type Deliverable,
  type DeliverableSearchResult,
  type CreateDeliverableDto,
  type CreateVersionDto,
  type DeliverableFilters
} from '@/services/deliverablesService';
import {
  loadDeliverables,
  loadDeliverablesByConversation,
  loadDeliverableVersions,
  deleteDeliverable as deleteDeliverableAction
} from '@/stores/helpers/deliverablesActions';
/**
 * Composable for deliverable management with chat integration
 * Provides a convenient interface for working with deliverables in components
 */
export function useDeliverables() {
  const store = useDeliverablesStore();
  // UI state
  const showDeliverableModal = ref(false);
  const selectedDeliverable = ref<Deliverable | null>(null);
  const isCreatingDeliverable = ref(false);
  // Computed properties
  const hasDeliverables = computed(() => store.hasDeliverables);
  const recentDeliverables = computed(() => store.recentDeliverables);
  const isLoading = computed(() => store.isLoading);
  const error = computed(() => store.error);
  const deliverablesByType = computed(() => store.deliverables);
  const isEnhancing = computed(() => false); // Enhancement context disabled for now
  const enhancementSource = computed(() => null as string | null);
  // Actions
  /**
   * Initialize deliverables (load recent deliverables)
   */
  async function initialize(): Promise<void> {
    await loadDeliverables();
  }
  /**
   * Process agent response for deliverable information
   * Call this when agents return responses with deliverable IDs
   */
  async function processAgentResponse(
    response: Record<string, unknown>,
    _conversationId: string,
    _messageId?: string
  ): Promise<void> {
    if (!response || typeof response !== 'object') {
      return;
    }
    // Check if response contains deliverable ID
    if (response.deliverableId) {
      // Process agent deliverable - simplified for now
    }
  }
  /**
   * Prepare enhancement context for agent request
   * Call this before sending enhancement requests to agents
   */
  async function prepareEnhancementContext(
    conversationId: string,
    messageId?: string
  ): Promise<{ deliverableId?: string }> {
    // Find existing deliverable for this conversation/message
    // Find existing deliverable for enhancement
    const conversationDeliverables = store.getDeliverablesByConversation(conversationId);
    const existingDeliverable = messageId 
      ? conversationDeliverables.find(d => d.currentVersion?.metadata?.messageId === messageId)
      : conversationDeliverables[0];
    if (existingDeliverable) {
      // Enhancement functionality disabled for now
      return { deliverableId: existingDeliverable.id };
    }
    return {};
  }
  /**
   * Get enhancement parameters for agent requests
   * Returns parameters to include in agent task requests
   */
  function getEnhancementParams(): Record<string, unknown> {
    // Enhancement context disabled for now
    // if (store.enhancementContext?.isEnhancing && store.enhancementContext?.sourceDeliverableId) {
    //   return {
    //     deliverableId: store.enhancementContext.sourceDeliverableId,
    //     enhanceDeliverableId: store.enhancementContext.sourceDeliverableId
    //   };
    // }
    return {};
  }
  /**
   * Create a new deliverable manually
   */
  async function createDeliverable(
    title: string,
    content: string,
    options: {
      type?: DeliverableType;
      format?: DeliverableFormat;
      description?: string;
      conversationId?: string;
      messageId?: string;
      agentName?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<Deliverable | null> {
    const _data: CreateDeliverableDto = {
      title,
      description: options.description,
      type: options.type || DeliverableType.DOCUMENT,
      conversationId: options.conversationId,
      projectStepId: typeof options.metadata?.projectStepId === 'string' ? options.metadata.projectStepId : undefined,
      // Initial version data
      initialContent: content,
      initialFormat: options.format || DeliverableFormat.MARKDOWN,
      initialCreationType: DeliverableVersionCreationType.MANUAL_EDIT,
      initialMetadata: {
        manuallyCreated: true,
        createdAt: new Date().toISOString(),
        createdByAgent: options.agentName,
        tags: options.tags || [],
        ...options.metadata
      }
    };
    // Create via service - store mutations happen in service layer
    // For now, return null as createDeliverable action needs to be implemented
    console.warn('createDeliverable not yet implemented in deliverablesActions');
    return null;
  }
  /**
   * Enhance an existing deliverable
   */
  async function enhanceDeliverable(
    sourceId: string,
    newTitle: string,
    newContent: string,
    options: {
      agentName?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<Deliverable | null> {
    const _versionData: CreateVersionDto = {
      content: newContent,
      format: DeliverableFormat.MARKDOWN,
      createdByType: DeliverableVersionCreationType.AI_ENHANCEMENT,
      metadata: {
        enhancementReason: 'manual_enhancement',
        enhancedAt: new Date().toISOString(),
        createdByAgent: options.agentName,
        ...options.metadata
      }
    };
    // Create version via service - store mutations happen in service layer
    // For now, return null as createVersion action needs to be implemented
    console.warn('createVersion not yet implemented in deliverablesActions');
    return null;
  }
  /**
   * Search deliverables
   */
  async function search(_query: string, _filters?: DeliverableFilters): Promise<void> {
    // Search functionality to be implemented
  }
  /**
   * Get deliverables for a conversation
   */
  async function getConversationDeliverables(conversationId: string): Promise<DeliverableSearchResult[]> {
    const deliverables = await loadDeliverablesByConversation(conversationId);
    return deliverables.map((d: Deliverable) => ({
      id: d.id,
      userId: d.userId,
      conversationId: d.conversationId,
      title: d.title,
      description: d.description,
      type: d.type,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // Current version information  
      format: d.currentVersion?.format,
      content: d.currentVersion?.content,
      metadata: d.currentVersion?.metadata,
      versionNumber: d.currentVersion?.versionNumber,
      isCurrentVersion: d.currentVersion?.isCurrentVersion,
      versionId: d.currentVersion?.id
    } as DeliverableSearchResult));
  }
  /**
   * Show deliverable in modal
   */
  function showDeliverable(deliverable: Deliverable): void {
    selectedDeliverable.value = deliverable;
    // Set current deliverable - to be implemented
    showDeliverableModal.value = true;
  }
  /**
   * Hide deliverable modal
   */
  function hideDeliverable(): void {
    showDeliverableModal.value = false;
    selectedDeliverable.value = null;
    // Clear current deliverable
  }
  /**
   * Start creating a new deliverable
   */
  function startCreating(): void {
    isCreatingDeliverable.value = true;
    showDeliverableModal.value = true;
  }
  /**
   * Cancel creating deliverable
   */
  function cancelCreating(): void {
    isCreatingDeliverable.value = false;
    showDeliverableModal.value = false;
  }
  /**
   * Delete a deliverable with confirmation
   */
  async function deleteDeliverable(deliverable: Deliverable): Promise<boolean> {
    if (confirm(`Are you sure you want to delete "${deliverable.title}"?`)) {
      try {
        await deleteDeliverableAction(deliverable.id);
        if (selectedDeliverable.value?.id === deliverable.id) {
          hideDeliverable();
        }
        return true;
      } catch {
        // Error loading deliverable
        return false;
      }
    }
    return false;
  }
  /**
   * Get display icon for deliverable type
   */
  function getTypeIcon(type: DeliverableType): string {
    const icons: Record<DeliverableType, string> = {
      [DeliverableType.DOCUMENT]: '📄',
      [DeliverableType.ANALYSIS]: '📊',
      [DeliverableType.REPORT]: '📋',
      [DeliverableType.PLAN]: '📝',
      [DeliverableType.REQUIREMENTS]: '📋',
      [DeliverableType.IMAGE]: '🖼️',
      [DeliverableType.VIDEO]: '🎥'
    };
    return icons[type] || '📄';
  }
  /**
   * Get display name for deliverable type
   */
  function getTypeName(type: DeliverableType): string {
    const names: Record<DeliverableType, string> = {
      [DeliverableType.DOCUMENT]: 'Document',
      [DeliverableType.ANALYSIS]: 'Analysis',
      [DeliverableType.REPORT]: 'Report',
      [DeliverableType.PLAN]: 'Plan',
      [DeliverableType.REQUIREMENTS]: 'Requirements',
      [DeliverableType.IMAGE]: 'Image',
      [DeliverableType.VIDEO]: 'Video'
    };
    return names[type] || 'Document';
  }
  /**
   * Format deliverable date for display
   */
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
  /**
   * Get versions for a deliverable
   */
  async function getVersions(deliverableId: string) {
    return await loadDeliverableVersions(deliverableId);
  }
  return {
    // State
    showDeliverableModal,
    selectedDeliverable,
    isCreatingDeliverable,
    // Computed
    hasDeliverables,
    recentDeliverables,
    isLoading,
    error,
    deliverablesByType,
    isEnhancing,
    enhancementSource,
    // Actions
    initialize,
    processAgentResponse,
    prepareEnhancementContext,
    getEnhancementParams,
    createDeliverable,
    enhanceDeliverable,
    search,
    getConversationDeliverables,
    showDeliverable,
    hideDeliverable,
    startCreating,
    cancelCreating,
    deleteDeliverable,
    getVersions,
    // Utilities
    getTypeIcon,
    getTypeName,
    formatDate,
    // Store access (for advanced usage)
    store
  };
}