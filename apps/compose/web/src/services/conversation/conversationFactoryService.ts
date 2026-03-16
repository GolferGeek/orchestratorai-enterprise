import { useAuthStore } from '@/stores/rbacStore';
import type { Agent, AgentConversation, ExecutionMode } from '@/types/conversation';
import { DEFAULT_CHAT_MODES } from '@/types/conversation';
import { formatAgentName } from '@/utils/caseConverter';
import { generateUUID } from '@/services/conversation/utils';

/**
 * Service for creating and initializing conversation objects
 * Handles conversation object construction with proper defaults
 */
export class ConversationFactoryService {
  /**
   * Create a new conversation object
   */
  createConversationObject(agent: Agent, createdAt: Date = new Date()): AgentConversation {
    // Extract and map execution modes from agent
    // Check both root level and context.execution_modes (backend format)
    const agentWithContext = agent as Agent & { context?: { execution_modes?: string[] } };
    const rawModes = agent.execution_modes ||
                     agentWithContext.context?.execution_modes ||
                     ['immediate'];

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

    const mappedModes = rawModes
      .map((mode: string) => normalizeMode(mode))
      .filter((mode): mode is ExecutionMode => mode !== null) as ExecutionMode[];

    const supportedModes: ExecutionMode[] = mappedModes.length > 0 ? mappedModes : ['immediate'];

    // Default to preferred ordering: auto > real-time > polling > immediate
    const defaultExecutionMode: ExecutionMode =
      (['auto', 'real-time', 'polling', 'immediate'] as ExecutionMode[]).find((mode) =>
        supportedModes.includes(mode),
      ) ?? supportedModes[0];

    // Use agent's organization if available, otherwise fall back to current user org
    const authStore = useAuthStore();
    const organizationSlug = agent.organizationSlug || authStore.currentOrganization || null;

    return {
      id: generateUUID(),
      agent,
      organizationSlug,
      messages: [],
      createdAt,
      lastActiveAt: createdAt,
      chatMode: DEFAULT_CHAT_MODES[0],
      allowedChatModes: [...DEFAULT_CHAT_MODES],
      executionMode: defaultExecutionMode,
      supportedExecutionModes: supportedModes,
      executionProfile: agent.execution_profile,
      executionCapabilities: agent.execution_capabilities,
      title: this.createConversationTitle(agent, createdAt), // Use proper title with timestamp
      isLoading: false,
      isSendingMessage: false,
      isExecutionModeOverride: false,
      latestPlanId: null,
      latestPlan: null,
      plans: [],
      orchestrationRuns: [],
      savedOrchestrations: [],
      streamSubscriptions: {},
      activeTaskId: null,
    };
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
export const conversationFactoryService = new ConversationFactoryService();
