/**
 * Conversations Service
 *
 * Service layer for conversation operations.
 * Handles async operations, API calls, and business logic.
 * Updates stores after successful API operations.
 *
 * Three-Layer Architecture:
 * - Store: State ONLY (no async, no API calls)
 * - Service: All async operations, API calls (THIS FILE)
 * - Component: Uses stores for state, services for operations
 */

import agent2AgentConversationsService from '@/services/agent2AgentConversationsService';
import agentConversationsService from '@/services/agentConversationsService';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import type { Conversation, AgentType } from '@/stores/conversationsStore';
import type { Agent } from '@/types/conversation';

/**
 * Fetch conversations from API and update store
 *
 * @param _force - Force refresh even if already loaded (reserved for future use)
 */
export async function fetchConversations(_force = false): Promise<void> {
  const conversationsStore = useConversationsStore();
  const agentsStore = useAgentsStore();

  conversationsStore.setLoading('_global', true);
  conversationsStore.setError(null);

  try {
    const response = await agent2AgentConversationsService.listConversations({
      limit: 1000,
    });

    // Map API response to our Conversation interface
    const mappedConversations = response.conversations.map(conv => {
      // Look up the agent to get execution modes (agents should already be loaded)
      const agent = agentsStore.availableAgents?.find(a => a.name === conv.agentName);

      const normalizeMode = (mode: string): 'immediate' | 'polling' | 'real-time' | 'auto' | null => {
        switch (mode) {
          case 'immediate':
          case 'polling':
          case 'real-time':
          case 'auto':
            return mode;
          case 'websocket':
            return 'real-time';
          default:
            return null;
        }
      };

      // Extract execution modes from agent (check both formats)
      const agentWithContext = agent as typeof agent & { context?: { execution_modes?: string[] } };
      const rawModes = agent?.execution_modes ||
                       agentWithContext?.context?.execution_modes ||
                       ['immediate'];

      const supportedModes = rawModes
        .map((mode: string) => normalizeMode(mode))
        .filter((mode): mode is 'immediate' | 'polling' | 'real-time' | 'auto' => mode !== null) as (
          | 'immediate'
          | 'polling'
          | 'real-time'
          | 'auto'
        )[];

      const validModes: ('immediate' | 'polling' | 'real-time' | 'auto')[] =
        supportedModes.length > 0 ? supportedModes : ['immediate'];
      const defaultMode: ('immediate' | 'polling' | 'real-time' | 'auto') =
        (['auto', 'real-time', 'polling', 'immediate'] as const).find((mode) =>
          validModes.includes(mode),
        ) ?? validModes[0] ?? 'immediate';

      const mappedConv: Conversation = {
        id: conv.id,
        userId: '', // userId not provided by Agent2AgentConversation API
        title: (typeof conv.metadata?.title === 'string' ? conv.metadata.title : conv.title) || 'Untitled',
        agentName: conv.agentName,
        agentType: conv.agentType as AgentType,
        organizationSlug: conv.organizationSlug,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        startedAt: conv.startedAt,
        endedAt: conv.endedAt,
        lastActiveAt: conv.lastActiveAt,
        taskCount: conv.taskCount || 0,
        completedTasks: conv.completedTasks || 0,
        failedTasks: conv.failedTasks || 0,
        activeTasks: conv.activeTasks || 0,
        metadata: conv.metadata,
        // Add agent and execution mode fields
        agent: agent as Agent | undefined,
        executionMode: defaultMode,
        supportedExecutionModes: validModes,
        isExecutionModeOverride: false,
      };

      return mappedConv;
    });

    conversationsStore.setConversations(mappedConversations);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversations';
    conversationsStore.setError(errorMessage);
    throw err;
  } finally {
    conversationsStore.setLoading('_global', false);
  }
}

/**
 * Delete conversation via API and update store
 *
 * @param conversationId - ID of conversation to delete
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const conversationsStore = useConversationsStore();
  const chatUiStore = useChatUiStore();
  const deliverablesStore = useDeliverablesStore();

  try {
    // Optimistically remove from store
    conversationsStore.removeConversation(conversationId);

    // Make API call
    await agentConversationsService.deleteConversation(conversationId);

    // Close tabs and clean up deliverables
    chatUiStore.closeConversationTab(conversationId);

    if (deliverablesStore.handleConversationDeleted) {
      deliverablesStore.handleConversationDeleted(conversationId);
    }
  } catch (err) {
    // Rollback by fetching fresh data
    await fetchConversations(true);
    const errorMessage = err instanceof Error ? err.message : 'Failed to delete conversation';
    conversationsStore.setError(errorMessage);
    throw err;
  }
}

/**
 * Conversations Service
 *
 * Provides service-level operations for conversations.
 */
export const conversationsService = {
  fetchConversations,
  deleteConversation,
};

export default conversationsService;
