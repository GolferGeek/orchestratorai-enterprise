// Re-export types from the service for consistent usage across the app
export {
  DeliverableType,
  DeliverableFormat,
  DeliverableVersionCreationType,
  type Deliverable,
  type DeliverableVersion,
  type CreateDeliverableDto,
  type CreateVersionDto,
  type DeliverableFilters,
  type DeliverableSearchResult,
  type DeliverableSearchResponse
} from '@/services/deliverablesService';
// Import types for use in interfaces
import type { Deliverable, DeliverableVersion, DeliverableSearchResult } from '@/services/deliverablesService';
import type { JsonObject } from '@orchestrator-ai/transport-types';
import type { ConversationHistoryEntry } from './conversation';
// Additional frontend-specific types
export interface DeliverableUIState {
  isViewing: boolean;
  isEditing: boolean;
  isCreating: boolean;
  showVersionHistory: boolean;
  showVersionComparison: boolean;
  selectedVersion?: DeliverableVersion;
  compareVersion?: DeliverableVersion;
  isCreatingVersion: boolean;
}
export interface DeliverableAction {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  disabled?: boolean;
  destructive?: boolean;
}
export interface ConversationDeliverableContext {
  conversationId: string;
  taskId?: string;
  deliverables: Deliverable[];
  canEnhance: boolean;
  enhancementSource?: string;
}
export interface VersionHistoryItem {
  version: DeliverableVersion;
  isActive: boolean;
  isCurrent: boolean;
  canRevert: boolean;
  canDelete: boolean;
}
// Agent response interfaces that include deliverable information
export interface AgentResponseWithDeliverable {
  success: boolean;
  message?: string;
  response?: string;
  deliverableId?: string;
  enhancedFrom?: string;
  metadata?: (JsonObject & {
    agentName?: string;
    agentType?: string;
  });
}
// Task request interfaces that include deliverable context
export type TaskRequestWithDeliverable = JsonObject & {
  method: string;
  prompt: string;
  params?: (JsonObject & {
    deliverableId?: string;
    enhanceDeliverableId?: string;
    versionId?: string;
  });
  conversationId?: string;
  conversationHistory?: ConversationHistoryEntry[];
};
// Legacy type aliases for backward compatibility
export type DeliverableSearchItem = DeliverableSearchResult;
