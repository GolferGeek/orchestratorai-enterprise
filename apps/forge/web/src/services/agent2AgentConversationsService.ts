/**
 * Agent-to-Agent Conversations Service
 *
 * Creates and manages conversation records for complex agent dashboards.
 * These records allow agent interactions to be tracked and retrieved later.
 *
 * Used by: CadAgentView, LegalDepartmentView, MarketingSwarmPage, etc.
 */
import { authenticatedFetch } from './utils/authenticatedFetch';

// API base URL for Forge API — empty in dev (Vite proxy handles it),
// set to /api/forge or full URL in gateway mode
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface Agent2AgentConversation {
  id: string;
  agentName: string;
  agentType: string;
  organizationSlug: string;
  conversationId: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  taskId?: string;
  status?: string;
}

interface CreateConversationOptions {
  agentName: string;
  agentType: string;
  organizationSlug: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

type ConversationRecord = Agent2AgentConversation;

class Agent2AgentConversationsService {
  async createConversation(options: CreateConversationOptions): Promise<ConversationRecord> {
    const response = await authenticatedFetch(`${API_BASE}/agent-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName: options.agentName,
        agentType: options.agentType,
        organizationSlug: options.organizationSlug,
        conversationId: options.conversationId,
        metadata: options.metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getConversation(conversationId: string): Promise<ConversationRecord> {
    const response = await authenticatedFetch(`${API_BASE}/agent-conversations/${conversationId}`);

    if (!response.ok) {
      throw new Error(`Failed to get conversation: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async listConversations(agentName: string, organizationSlug: string): Promise<ConversationRecord[]> {
    const params = new URLSearchParams({ agentName, organizationSlug });
    const response = await authenticatedFetch(`${API_BASE}/agent-conversations?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to list conversations: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

const agent2AgentConversationsService = new Agent2AgentConversationsService();
export default agent2AgentConversationsService;
export { agent2AgentConversationsService };
