import { useAgentsStore } from '@/stores/agentsStore';
import type { AgentConversation, ExecutionMode, AgentChatMode } from '@/types/conversation';
import { DEFAULT_CHAT_MODES } from '@/types/conversation';

/**
 * Service for managing conversation metadata
 * Handles execution modes, capabilities, and conversation-level metadata updates
 */
export class ConversationMetadataService {
  /**
   * Update execution modes for a conversation based on agent capabilities
   */
  async updateConversationExecutionModes(conversation: AgentConversation): Promise<void> {
    if (!conversation.agent) return;

    try {
      // Use the existing agents store instead of making a separate API call
      const agentsStore = useAgentsStore();

      // Find agent info from the store
      const agentInfo = agentsStore.availableAgents.find(agent => agent.name === conversation.agent?.name);

      const normalizeMode = (mode: string): ExecutionMode | null => {
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

      if (agentInfo?.execution_modes && Array.isArray(agentInfo.execution_modes)) {
        // Use execution modes directly from agent data
        const rawModes = agentInfo.execution_modes;

        const supportedModes = rawModes
          .map((mode: string) => normalizeMode(mode))
          .filter((mode): mode is ExecutionMode => mode !== null);

        conversation.supportedExecutionModes = supportedModes.length > 0 ? supportedModes : ['immediate'];
      } else {
        // Default to immediate mode if no execution modes specified
        conversation.supportedExecutionModes = ['immediate'];
      }

      const defaultAllowed: AgentChatMode[] = [...DEFAULT_CHAT_MODES];
      let allowedChatModes = [...defaultAllowed];

      // Always use execution fields from the original agent object (from hierarchy)
      // The agentsStore.availableAgents may have stale data
      const profile = conversation.agent.execution_profile;
      const capabilities = conversation.agent.execution_capabilities;

      conversation.executionProfile = profile;
      conversation.executionCapabilities = capabilities;

      if (profile === 'conversation_only') {
        allowedChatModes = ['converse'];
      } else {
        if (capabilities?.can_plan === false) {
          allowedChatModes = allowedChatModes.filter(mode => mode !== 'plan');
        }

        if (capabilities?.can_build === false) {
          allowedChatModes = allowedChatModes.filter(mode => mode !== 'build');
        }
      }

      conversation.allowedChatModes = allowedChatModes;
      if (!allowedChatModes.includes(conversation.chatMode)) {
        // Prefer 'converse' mode if available, otherwise use first allowed mode
        conversation.chatMode = allowedChatModes.includes('converse') ? 'converse' : (allowedChatModes[0] || DEFAULT_CHAT_MODES[0]);
      }
    } catch {
      conversation.supportedExecutionModes = ['immediate'];
      if (!conversation.allowedChatModes || conversation.allowedChatModes.length === 0) {
        conversation.allowedChatModes = [...DEFAULT_CHAT_MODES];
      }
    }
  }

  /**
   * Update conversation metadata
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
    // Update the conversation object with the provided metadata
    if (metadata.executionMode !== undefined) {
      conversation.executionMode = metadata.executionMode;
    }
    if (metadata.isExecutionModeOverride !== undefined) {
      conversation.isExecutionModeOverride = metadata.isExecutionModeOverride;
    }
    if (metadata.lastActiveAt !== undefined) {
      conversation.lastActiveAt = metadata.lastActiveAt;
    }
    if (metadata.error !== undefined) {
      // Could store error in conversation metadata
      // For now, this is a placeholder
    }
  }
}

// Export singleton instance
export const conversationMetadataService = new ConversationMetadataService();
