import type { AgentConversation } from '@/types/conversation';

/**
 * Service for conversation utility functions
 * Handles filtering, sorting, searching, validation, and statistics
 */
export class ConversationUtilsService {
  /**
   * Find conversation by ID
   */
  findConversationById(conversations: AgentConversation[], conversationId: string): AgentConversation | undefined {
    return conversations.find(conv => conv.id === conversationId);
  }

  /**
   * Filter conversations by agent
   */
  filterConversationsByAgent(conversations: AgentConversation[], agentName: string): AgentConversation[] {
    return conversations.filter(conv => conv.agent.name === agentName);
  }

  /**
   * Sort conversations by last active time
   */
  sortConversationsByActivity(conversations: AgentConversation[]): AgentConversation[] {
    return conversations.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  }

  /**
   * Get conversation statistics
   */
  getConversationStats(conversation: AgentConversation): {
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    hasActiveTask: boolean;
    lastActivity: string;
  } {
    const messages = conversation.messages;
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    const hasActiveTask = messages.some(m => m.metadata?.isPlaceholder);

    return {
      messageCount: messages.length,
      userMessages,
      assistantMessages,
      hasActiveTask,
      lastActivity: conversation.lastActiveAt.toISOString()
    };
  }

  /**
   * Clean up conversation resources
   */
  cleanupConversation(conversation: AgentConversation): void {
    // Clean up any active tasks
    const activeTasks = conversation.messages
      .filter(m => m.metadata?.isPlaceholder)
      .map(m => m.taskId)
      .filter(Boolean);

    activeTasks.forEach(_taskId => {
      // This could unsubscribe from WebSocket events, etc.
    });
  }

  /**
   * Validate conversation object
   */
  validateConversation(conversation: unknown): conversation is AgentConversation {
    if (!conversation || typeof conversation !== 'object') {
      return false;
    }

    const conv = conversation as Record<string, unknown>;

    return (
      typeof conv.id === 'string' &&
      conv.agent !== undefined &&
      Array.isArray(conv.messages) &&
      conv.createdAt instanceof Date &&
      conv.lastActiveAt instanceof Date &&
      typeof conv.executionMode === 'string' &&
      Array.isArray(conv.supportedExecutionModes)
    );
  }
}

// Export singleton instance
export const conversationUtilsService = new ConversationUtilsService();
