/**
 * Unit Tests for Conversations Service
 *
 * Service layer for conversation operations.
 * Tests cover:
 * - Fetching conversations from API
 * - Deleting conversations
 * - Store updates after API operations
 * - Error handling and rollback
 * - Execution mode mapping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { conversationsService } from '../conversationsService';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import type { AgentInfo } from '@/types/chat';

// Mock the service dependencies
vi.mock('@/services/agent2AgentConversationsService', () => ({
  default: {
    listConversations: vi.fn(),
  },
}));

vi.mock('@/services/agentConversationsService', () => ({
  default: {
    deleteConversation: vi.fn(),
  },
}));

import agent2AgentConversationsService from '@/services/agent2AgentConversationsService';
import type { AgentType as A2AAgentType } from '@/services/agent2AgentConversationsService';
import agentConversationsService from '@/services/agentConversationsService';

describe('ConversationsService', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('fetchConversations', () => {
    it('should fetch conversations from API and update store', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();

      // Mock agent data
      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate', 'polling'] as ('immediate' | 'polling' | 'real-time' | 'auto')[],
        description: 'Test agent description',
      };
      agentsStore.availableAgents = [mockAgent];

      // Mock API response
      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            agentName: 'test-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
            taskCount: 5,
            completedTasks: 3,
            failedTasks: 1,
            activeTasks: 1,
            metadata: { title: 'Test Conversation' },
          },
        ],
        total: 1,
      };

      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      // Execute
      await conversationsService.fetchConversations();

      // Verify API was called
      expect(agent2AgentConversationsService.listConversations).toHaveBeenCalledWith({ limit: 1000 });

      // Verify store was updated
      const conversations = conversationsStore.allConversations;
      expect(conversations).toHaveLength(1);
      expect(conversations[0].id).toBe('conv-1');
      expect(conversations[0].title).toBe('Test Conversation');
      expect(conversations[0].agentName).toBe('test-agent');
      expect(conversations[0].taskCount).toBe(5);
      expect(conversations[0].completedTasks).toBe(3);

      // Verify execution mode mapping
      expect(conversations[0].executionMode).toBeDefined();
      expect(conversations[0].supportedExecutionModes).toEqual(['immediate', 'polling']);
    });

    it('should map execution modes correctly (immediate, polling, real-time, auto)', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();

      // Mock agent with all execution modes
      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate', 'polling', 'real-time', 'auto'] as ('immediate' | 'polling' | 'real-time' | 'auto')[],
        description: 'Test agent description',
      };
      agentsStore.availableAgents = [mockAgent];

      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            agentName: 'test-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      await conversationsService.fetchConversations();

      const conversations = conversationsStore.allConversations;
      expect(conversations[0].supportedExecutionModes).toEqual(['immediate', 'polling', 'real-time', 'auto']);
      // Default should prioritize auto > real-time > polling > immediate
      expect(conversations[0].executionMode).toBe('auto');
    });

    it('should normalize websocket to real-time', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();

      // Mock agent with websocket mode (legacy)
      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['websocket', 'immediate'] as string[],
        description: 'Test agent description',
      } as unknown as AgentInfo;
      agentsStore.availableAgents = [mockAgent];

      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            agentName: 'test-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      await conversationsService.fetchConversations();

      const conversations = conversationsStore.allConversations;
      // websocket should be normalized to real-time
      expect(conversations[0].supportedExecutionModes).toEqual(['real-time', 'immediate']);
    });

    it('should default to immediate mode if no execution modes', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();

      // Mock agent without execution modes
      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        description: 'Test agent description',
      };
      agentsStore.availableAgents = [mockAgent];

      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            agentName: 'test-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      await conversationsService.fetchConversations();

      const conversations = conversationsStore.allConversations;
      expect(conversations[0].supportedExecutionModes).toEqual(['immediate']);
      expect(conversations[0].executionMode).toBe('immediate');
    });

    it('should handle conversations without matching agent', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();

      // No agents available
      agentsStore.availableAgents = [];

      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            agentName: 'unknown-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      await conversationsService.fetchConversations();

      const conversations = conversationsStore.allConversations;
      expect(conversations[0].agent).toBeUndefined();
      // Should still default to immediate mode
      expect(conversations[0].supportedExecutionModes).toEqual(['immediate']);
    });

    it('should set loading states correctly', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();
      agentsStore.availableAgents = [];

      const mockApiResponse = { conversations: [], total: 0 };
      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      const loadingPromise = conversationsService.fetchConversations();

      // Should be loading during API call
      expect(conversationsStore.isLoading('_global')).toBe(true);

      await loadingPromise;

      // Should not be loading after completion
      expect(conversationsStore.isLoading('_global')).toBe(false);
    });

    it('should handle API errors and set error state', async () => {
      const conversationsStore = useConversationsStore();

      const error = new Error('Network error');
      vi.mocked(agent2AgentConversationsService.listConversations).mockRejectedValue(error);

      await expect(conversationsService.fetchConversations()).rejects.toThrow('Network error');

      // Verify error was set in store
      expect(conversationsStore.error).toBe('Network error');
      expect(conversationsStore.isLoading('_global')).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      const conversationsStore = useConversationsStore();

      vi.mocked(agent2AgentConversationsService.listConversations).mockRejectedValue('String error');

      await expect(conversationsService.fetchConversations()).rejects.toBe('String error');

      expect(conversationsStore.error).toBe('Failed to fetch conversations');
      expect(conversationsStore.isLoading('_global')).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation via API and update store', async () => {
      const conversationsStore = useConversationsStore();

      // Add a conversation to the store
      conversationsStore.setConversation({
        id: 'conv-1',
        agentName: 'test-agent',
        title: 'Test Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      vi.mocked(agentConversationsService.deleteConversation).mockResolvedValue({ success: true });

      // Execute
      await conversationsService.deleteConversation('conv-1');

      // Verify API was called
      expect(agentConversationsService.deleteConversation).toHaveBeenCalledWith('conv-1');

      // Verify conversation was removed from store
      expect(conversationsStore.conversationById('conv-1')).toBeUndefined();
    });

    it('should close conversation tabs when deleted', async () => {
      const conversationsStore = useConversationsStore();
      const chatUiStore = useChatUiStore();

      conversationsStore.setConversation({
        id: 'conv-1',
        agentName: 'test-agent',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      const closeTabSpy = vi.spyOn(chatUiStore, 'closeConversationTab');

      vi.mocked(agentConversationsService.deleteConversation).mockResolvedValue({ success: true });

      await conversationsService.deleteConversation('conv-1');

      expect(closeTabSpy).toHaveBeenCalledWith('conv-1');
    });

    it('should clean up deliverables when conversation deleted', async () => {
      const conversationsStore = useConversationsStore();
      const deliverablesStore = useDeliverablesStore();

      conversationsStore.setConversation({
        id: 'conv-1',
        agentName: 'test-agent',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      // Mock handleConversationDeleted method
      deliverablesStore.handleConversationDeleted = vi.fn();

      vi.mocked(agentConversationsService.deleteConversation).mockResolvedValue({ success: true });

      await conversationsService.deleteConversation('conv-1');

      expect(deliverablesStore.handleConversationDeleted).toHaveBeenCalledWith('conv-1');
    });

    it('should rollback on API error', async () => {
      const conversationsStore = useConversationsStore();

      // Add conversation
      conversationsStore.setConversation({
        id: 'conv-1',
        agentName: 'test-agent',
        title: 'Test Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      // Mock API error
      const error = new Error('Delete failed');
      vi.mocked(agentConversationsService.deleteConversation).mockRejectedValue(error);

      // Mock fetchConversations for rollback
      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            agentName: 'test-agent',
            agentType: 'context' as A2AAgentType,
            organizationSlug: 'test-org',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            startedAt: '2024-01-01T00:00:00Z',
            lastActiveAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      });

      // Attempt delete
      await expect(conversationsService.deleteConversation('conv-1')).rejects.toThrow('Delete failed');

      // Verify error was set
      expect(conversationsStore.error).toBe('Delete failed');
    });

    it('should handle non-Error exceptions during delete', async () => {
      const conversationsStore = useConversationsStore();

      conversationsStore.setConversation({
        id: 'conv-1',
        agentName: 'test-agent',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      vi.mocked(agentConversationsService.deleteConversation).mockRejectedValue('String error');

      // Mock rollback
      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue({ conversations: [], total: 0 });

      await expect(conversationsService.deleteConversation('conv-1')).rejects.toBe('String error');

      expect(conversationsStore.error).toBe('Failed to delete conversation');
    });
  });

  describe('Service Layer Architecture', () => {
    it('should update store after successful API operations', async () => {
      const conversationsStore = useConversationsStore();
      const agentsStore = useAgentsStore();
      agentsStore.availableAgents = [];

      const mockApiResponse = { conversations: [], total: 0 };
      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      // Store should be updated after fetch
      await conversationsService.fetchConversations();
      expect(conversationsStore.allConversations).toEqual([]);
    });

    it('should handle async operations properly', async () => {
      const agentsStore = useAgentsStore();
      agentsStore.availableAgents = [];

      const mockApiResponse = { conversations: [], total: 0 };
      vi.mocked(agent2AgentConversationsService.listConversations).mockResolvedValue(mockApiResponse);

      // Should return a promise
      const result = conversationsService.fetchConversations();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should not make API calls from store directly', () => {
      // This test verifies the architecture: stores should not make API calls
      const conversationsStore = useConversationsStore();

      // Verify store methods don't make API calls (they're synchronous)
      conversationsStore.setConversations([]);
      conversationsStore.removeConversation('test-id');

      // Service should be the only one making API calls
      expect(agent2AgentConversationsService.listConversations).not.toHaveBeenCalled();
      expect(agentConversationsService.deleteConversation).not.toHaveBeenCalled();
    });
  });
});
