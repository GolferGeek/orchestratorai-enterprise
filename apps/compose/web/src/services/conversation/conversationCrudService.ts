import agentConversationsService, { type AgentType } from '@/services/agentConversationsService';
import agent2AgentConversationsService from '@/services/agent2AgentConversationsService';
import { useAuthStore } from '@/stores/rbacStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
// llmPreferencesStore removed in Compose — provider/model from agent config or env defaults
import type { Agent, AgentConversation } from '@/types/conversation';
import { formatAgentName } from '@/utils/caseConverter';
import { generateUUID } from '@/services/conversation/utils';

// Import backend conversation type with alias to avoid confusion
type BackendAgentConversation = Awaited<ReturnType<typeof agentConversationsService.getConversation>>;

/**
 * Service for conversation CRUD operations
 * Handles creating, reading, updating, and deleting conversations in the backend
 */
export class ConversationCrudService {
  /**
   * Create a new conversation in the backend
   */
  async createConversation(agent: Agent): Promise<string> {
    // Use agent's specific organization if available, otherwise fall back to user's current org
    // 'global' and '*' mean the agent is not org-specific — use the user's current org instead
    const authStore = useAuthStore();
    const agentOrg = agent.organizationSlug;
    const isGlobalAgent = !agentOrg || agentOrg === 'global' || agentOrg === '*';
    const orgSlug = isGlobalAgent
      ? (authStore.currentOrganization || 'finance')
      : agentOrg;

    // All agents now use the Agent2Agent conversation service
    // Use dedicated Agent2Agent conversation service for all agents
    const conversationId = generateUUID(); // Generate ID upfront
    const createdAt = new Date();
    const title = this.createConversationTitle(agent, createdAt);

    const backendConversation = await agent2AgentConversationsService.createConversation({
      agentName: agent.name,
      agentType: agent.type as AgentType, // Required for backend validation
      organizationSlug: orgSlug, // Use authStore.currentOrganization as canonical source
      conversationId: conversationId, // Pass the generated ID
      metadata: {
        source: 'frontend',
        title: title, // Include the formatted title
      },
    });

    // Initialize ExecutionContext immediately for the new conversation
    const executionContextStore = useExecutionContextStore();

    // Priority for LLM selection:
    // 1. Agent's llm_config (from database) - if agent specifies a required model
    // 2. Environment defaults configured for Compose
    const agentLlmConfig = agent.llm_config;
    const provider = agentLlmConfig?.provider
      || import.meta.env.VITE_DEFAULT_PROVIDER
      || 'anthropic';
    const model = agentLlmConfig?.model
      || import.meta.env.VITE_DEFAULT_MODEL
      || 'claude-3-5-sonnet-20241022';

    executionContextStore.initialize({
      orgSlug,
      userId: authStore.user?.id || 'anonymous',
      conversationId: backendConversation.id,
      agentSlug: agent.name,
      agentType: agent.type || 'context',
      provider,
      model,
    });

    return backendConversation.id;
  }

  /**
   * Check if conversation exists in backend
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    try {
      const conversation = await agentConversationsService.getConversation(conversationId);
      return !!conversation;
    } catch {
      return false;
    }
  }

  /**
   * Get conversation from backend
   */
  async getBackendConversation(conversationId: string): Promise<BackendAgentConversation> {
    try {
      return await agentConversationsService.getConversation(conversationId);
    } catch (error) {
      console.error(`Failed to get conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Persist conversation state to backend
   */
  async persistConversationState(_conversation: AgentConversation): Promise<void> {
    try {
      // This could be extended to save conversation metadata
      // For now, we don't need to persist the entire state
      // The messages are persisted separately when created

    } catch {
      // Failed to persist conversation state
    }
  }

  /**
   * Archive or delete conversation
   */
  async archiveConversation(_conversationId: string): Promise<void> {
    try {
      // Implementation depends on backend support for archiving
      // For now, we just log it
    } catch {
      // Failed to archive conversation
    }
  }

  /**
   * Get all conversations for current user
   * @deprecated Use useAgentConversationsStore().fetchConversations() instead for reactive updates
   */
  async getUserConversations(): Promise<BackendAgentConversation[]> {
    try {
      const response = await agentConversationsService.listConversations();
      return response.conversations;
    } catch {
      return [];
    }
  }

  /**
   * Create conversation title based on agent and timestamp
   */
  createConversationTitle(agent: Agent, createdAt: Date): string {
    const agentDisplayName = formatAgentName(agent.name);
    const now = new Date();

    // If it's today, show time only
    if (createdAt.toDateString() === now.toDateString()) {
      const time = createdAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${agentDisplayName} ${time}`;
    }

    // If it's this week, show day and time
    const daysDiff = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      const dayName = createdAt.toLocaleDateString([], { weekday: 'short' });
      const time = createdAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${agentDisplayName} ${dayName} ${time}`;
    }

    // For older conversations, show full date and time
    const dateTime = createdAt.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${agentDisplayName} ${dateTime}`;
  }
}

// Export singleton instance
export const conversationCrudService = new ConversationCrudService();
