/**
 * Conversation Helpers - Backwards Compatibility Re-exports
 *
 * This file has been decomposed into focused service modules:
 * - conversationMessageService.ts - Message loading and reconstruction
 * - conversationCrudService.ts - Backend CRUD operations
 * - conversationFactoryService.ts - Object creation and initialization
 * - conversationMetadataService.ts - Metadata and capabilities management
 * - conversationUtilsService.ts - Utility functions (filtering, sorting, validation)
 * - utils.ts - Shared utilities (UUID generation)
 *
 * This file re-exports all services for backwards compatibility.
 * New code should import directly from the specific service modules.
 */

import { conversationMessageService } from '@/services/conversation/conversationMessageService';
import { conversationCrudService } from '@/services/conversation/conversationCrudService';
import { conversationFactoryService } from '@/services/conversation/conversationFactoryService';
import { conversationMetadataService } from '@/services/conversation/conversationMetadataService';
import { conversationUtilsService } from '@/services/conversation/conversationUtilsService';
import type { Agent, AgentConversation, ExecutionMode } from '@/types/conversation';
import type agentConversationsService from '@/services/agentConversationsService';

// Backend conversation type from the API (different from frontend AgentConversation type)
type BackendAgentConversation = Awaited<ReturnType<typeof agentConversationsService.getConversation>>;

/**
 * Service for managing conversations and backend persistence
 * @deprecated Use individual services instead (conversationCrudService, conversationMessageService, etc.)
 */
export class ConversationService {
  /**
   * Create a new conversation in the backend
   * @deprecated Use conversationCrudService.createConversation()
   */
  async createConversation(agent: Agent): Promise<string> {
    return conversationCrudService.createConversation(agent);
  }

  /**
   * Load conversation messages from backend by reconstructing from tasks
   * @deprecated Use conversationMessageService.loadConversationMessages()
   */
  async loadConversationMessages(conversationId: string) {
    return conversationMessageService.loadConversationMessages(conversationId);
  }

  /**
   * Get active tasks for a conversation that need WebSocket restoration
   * @deprecated Use conversationMessageService.getActiveTasksForConversation()
   */
  async getActiveTasksForConversation(conversationId: string) {
    return conversationMessageService.getActiveTasksForConversation(conversationId);
  }

  /**
   * Update execution modes for a conversation based on agent capabilities
   * @deprecated Use conversationMetadataService.updateConversationExecutionModes()
   */
  async updateConversationExecutionModes(conversation: AgentConversation): Promise<void> {
    return conversationMetadataService.updateConversationExecutionModes(conversation);
  }

  /**
   * Create conversation title based on agent and timestamp
   * @deprecated Use conversationFactoryService.createConversationTitle()
   */
  createConversationTitle(agent: Agent, createdAt: Date): string {
    return conversationFactoryService.createConversationTitle(agent, createdAt);
  }

  /**
   * Create a new conversation object
   * @deprecated Use conversationFactoryService.createConversationObject()
   */
  createConversationObject(agent: Agent, createdAt: Date = new Date()): AgentConversation {
    return conversationFactoryService.createConversationObject(agent, createdAt);
  }

  /**
   * Check if conversation exists in backend
   * @deprecated Use conversationCrudService.conversationExists()
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    return conversationCrudService.conversationExists(conversationId);
  }

  /**
   * Get conversation from backend
   * @deprecated Use conversationCrudService.getBackendConversation()
   */
  async getBackendConversation(conversationId: string): Promise<BackendAgentConversation> {
    return conversationCrudService.getBackendConversation(conversationId);
  }

  /**
   * Persist conversation state to backend
   * @deprecated Use conversationCrudService.persistConversationState()
   */
  async persistConversationState(conversation: AgentConversation): Promise<void> {
    return conversationCrudService.persistConversationState(conversation);
  }

  /**
   * Archive or delete conversation
   * @deprecated Use conversationCrudService.archiveConversation()
   */
  async archiveConversation(conversationId: string): Promise<void> {
    return conversationCrudService.archiveConversation(conversationId);
  }

  /**
   * Get all conversations for current user
   * @deprecated Use useAgentConversationsStore().fetchConversations() instead for reactive updates
   */
  async getUserConversations(): Promise<BackendAgentConversation[]> {
    return conversationCrudService.getUserConversations();
  }

  /**
   * Update conversation metadata
   * @deprecated Use conversationMetadataService.updateConversationMetadata()
   */
  updateConversationMetadata(
    conversation: AgentConversation,
    metadata: Partial<{
      executionMode: ExecutionMode;
      isExecutionModeOverride: boolean;
      lastActiveAt: Date;
      error?: string;
    }>
  ): void {
    return conversationMetadataService.updateConversationMetadata(conversation, metadata);
  }

  /**
   * Find conversation by ID
   * @deprecated Use conversationUtilsService.findConversationById()
   */
  findConversationById(conversations: AgentConversation[], conversationId: string): AgentConversation | undefined {
    return conversationUtilsService.findConversationById(conversations, conversationId);
  }

  /**
   * Filter conversations by agent
   * @deprecated Use conversationUtilsService.filterConversationsByAgent()
   */
  filterConversationsByAgent(conversations: AgentConversation[], agentName: string): AgentConversation[] {
    return conversationUtilsService.filterConversationsByAgent(conversations, agentName);
  }

  /**
   * Sort conversations by last active time
   * @deprecated Use conversationUtilsService.sortConversationsByActivity()
   */
  sortConversationsByActivity(conversations: AgentConversation[]): AgentConversation[] {
    return conversationUtilsService.sortConversationsByActivity(conversations);
  }

  /**
   * Get conversation statistics
   * @deprecated Use conversationUtilsService.getConversationStats()
   */
  getConversationStats(conversation: AgentConversation) {
    return conversationUtilsService.getConversationStats(conversation);
  }

  /**
   * Clean up conversation resources
   * @deprecated Use conversationUtilsService.cleanupConversation()
   */
  cleanupConversation(conversation: AgentConversation): void {
    return conversationUtilsService.cleanupConversation(conversation);
  }

  /**
   * Validate conversation object
   * @deprecated Use conversationUtilsService.validateConversation()
   */
  validateConversation(conversation: unknown): conversation is AgentConversation {
    return conversationUtilsService.validateConversation(conversation);
  }
}

// Export singleton instance for backwards compatibility
export const conversation = new ConversationService();

// Re-export individual services for new code
export { conversationMessageService } from '@/services/conversation/conversationMessageService';
export { conversationCrudService } from '@/services/conversation/conversationCrudService';
export { conversationFactoryService } from '@/services/conversation/conversationFactoryService';
export { conversationMetadataService } from '@/services/conversation/conversationMetadataService';
export { conversationUtilsService } from '@/services/conversation/conversationUtilsService';
export { generateUUID } from '@/services/conversation/utils';
