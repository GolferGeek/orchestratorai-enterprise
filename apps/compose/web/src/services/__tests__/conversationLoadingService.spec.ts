/**
 * Unit Tests for Conversation Loading Service
 *
 * Complex service that handles conversation loading from query parameters.
 * Tests cover:
 * - Loading conversations from query parameters
 * - Store coordination and updates
 * - ExecutionContext initialization
 * - Authentication checks
 * - Error handling
 * - Router query parameter cleanup
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useAuthStore } from '@/stores/rbacStore';

import type { Router } from 'vue-router';

// Mock service dependencies
const mockGetBackendConversation = vi.fn();
const mockLoadConversationMessages = vi.fn();
const mockCreateConversationObject = vi.fn();

vi.mock('@/services/conversation/conversationCrudService', () => ({
  conversationCrudService: {
    getBackendConversation: mockGetBackendConversation,
  },
}));

vi.mock('@/services/conversation/conversationMessageService', () => ({
  conversationMessageService: {
    loadConversationMessages: mockLoadConversationMessages,
  },
}));

vi.mock('@/services/conversation/conversationFactoryService', () => ({
  conversationFactoryService: {
    createConversationObject: mockCreateConversationObject,
  },
}));

// Import after mocks are defined
const { conversationLoadingService } = await import('../conversationLoadingService');

describe('ConversationLoadingService', () => {
  let mockRouter: Router;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Mock router
    mockRouter = {
      replace: vi.fn(),
    } as unknown as Router;

    // Clear execution context store
    const executionContextStore = useExecutionContextStore();
    executionContextStore.clear();
  });

  describe('loadConversationFromQuery', () => {
    it('should reject if user is not authenticated', async () => {
      const authStore = useAuthStore();
      // Ensure user is not authenticated
      authStore.$patch({
        token: null,
        user: null,
      });

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not authenticated');
    });

    it('should return existing conversation if already loaded', async () => {
      const authStore = useAuthStore();
      const conversationsStore = useConversationsStore();
      const chatUiStore = useChatUiStore();

      // Set up authenticated user with organization (required for setActiveConversation)
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      // Add existing conversation with messages
      conversationsStore.setConversation({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Existing Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      conversationsStore.setMessages('conv-1', [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
      ]);

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-1');
      expect(chatUiStore.activeConversationId).toBe('conv-1');

      // Should clean up query parameter
      expect(mockRouter.replace).toHaveBeenCalledWith({
        name: 'home',
        params: {},
        query: { conversationId: undefined },
      });

      // Should NOT call backend APIs
      expect(mockGetBackendConversation).not.toHaveBeenCalled();
    });

    it('should load conversation from backend if not in store', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();
      const conversationsStore = useConversationsStore();
      const chatUiStore = useChatUiStore();
      const executionContextStore = useExecutionContextStore();

      // Set up authenticated user
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      // Mock agent
      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate'],
        description: 'Test agent description',
      };
      // @ts-expect-error - Mock data may not match exact type requirements
      agentsStore.setAvailableAgents([mockAgent]);

      // Mock backend conversation
      const mockBackendConversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Backend Conversation',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockGetBackendConversation.mockResolvedValue(mockBackendConversation);

      // Mock messages
      const mockMessages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      mockLoadConversationMessages.mockResolvedValue(mockMessages);

      // Mock conversation factory
      const mockConversationObject = {
        id: 'temp-id',
        userId: 'user-1',
        title: 'New Conversation',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date(),
        agentName: 'test-agent',
        agentType: 'context',
      };
      mockCreateConversationObject.mockReturnValue(mockConversationObject);

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-1');

      // Verify backend APIs were called
      expect(mockGetBackendConversation).toHaveBeenCalledWith('conv-1');
      expect(mockLoadConversationMessages).toHaveBeenCalledWith('conv-1');

      // Verify conversation was added to store with correct ID
      const conversation = conversationsStore.conversationById('conv-1');
      expect(conversation).toBeTruthy();
      // Title is auto-generated by conversationFactoryService, not taken from backend
      expect(conversation?.title).toBe('New Conversation');

      // Verify messages were set
      const messages = conversationsStore.messagesByConversation('conv-1');
      expect(messages).toEqual(mockMessages);

      // Verify active conversation was set
      expect(chatUiStore.activeConversationId).toBe('conv-1');

      // Verify ExecutionContext was initialized
      expect(executionContextStore.contextOrNull).toBeTruthy();
      expect(executionContextStore.contextOrNull?.conversationId).toBe('conv-1');
      expect(executionContextStore.contextOrNull?.agentSlug).toBe('test-agent');
    });

    it('should load agents if not already loaded', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();

      // Set up authenticated user with organization (required for setActiveConversation)
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      // Initially no agents - set empty array instead of null
      agentsStore.setAvailableAgents([]);

      const mockBackendConversation = {
        id: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockGetBackendConversation.mockResolvedValue(mockBackendConversation);
      mockLoadConversationMessages.mockResolvedValue([]);

      // Set up agents before the service loads them
      agentsStore.setAvailableAgents([
        { id: 'agent-1', name: 'test-agent', type: 'context', execution_modes: ['immediate'], description: 'Test agent description' },
      ]);

      mockCreateConversationObject.mockReturnValue({
        id: 'temp-id',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery('conv-1', mockRouter, currentRoute);

      // Should succeed since agents are now available
      expect(result.success).toBe(true);
    });

    it('should return error if agent not found', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();

      // Set up authenticated user
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
      });

      // No matching agent
      agentsStore.setAvailableAgents([
        { id: 'other-agent', name: 'other-agent', type: 'context', execution_modes: ['immediate'], description: 'Test agent description' },
      ]);

      const mockBackendConversation = {
        id: 'conv-1',
        userId: 'user-1',
        agentName: 'missing-agent',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockGetBackendConversation.mockResolvedValue(mockBackendConversation);
      mockLoadConversationMessages.mockResolvedValue([]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found: missing-agent');

      consoleErrorSpy.mockRestore();
    });

    it('should update existing conversation instead of creating new one', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();
      const conversationsStore = useConversationsStore();

      // Set up authenticated user
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
      });

      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate'],
        description: 'Test agent description',
      };
      // @ts-expect-error - Mock data may not match exact type requirements
      agentsStore.setAvailableAgents([mockAgent]);

      // Add existing conversation (without messages)
      conversationsStore.setConversation({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Old Title',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const mockBackendConversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Updated Title',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockGetBackendConversation.mockResolvedValue(mockBackendConversation);
      mockLoadConversationMessages.mockResolvedValue([]);

      mockCreateConversationObject.mockReturnValue({
        id: 'temp-id',
        userId: 'user-1',
        title: 'Updated Title',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date(),
      });

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      await conversationLoadingService.loadConversationFromQuery('conv-1', mockRouter, currentRoute);

      // Should update existing conversation
      const conversation = conversationsStore.conversationById('conv-1');
      expect(conversation?.title).toBe('Updated Title');
    });

    it('should initialize ExecutionContext with correct values', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();
      const executionContextStore = useExecutionContextStore();

      // Set up authenticated user
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-123', email: 'test@example.com', roles: [] },
        currentOrganization: 'my-org',
      });

      const mockAgent = {
        id: 'agent-1',
        name: 'my-agent',
        type: 'workflow',
        execution_modes: ['immediate'],
        description: 'Test agent description',
      };
      // @ts-expect-error - Mock data may not match exact type requirements
      agentsStore.setAvailableAgents([mockAgent]);

      // Mock ensureAgentsLoaded if it exists (it was removed in Phase 4.2 but service might still call it)
      if ('ensureAgentsLoaded' in agentsStore) {
        vi.spyOn(agentsStore, 'ensureAgentsLoaded' as never).mockResolvedValue(undefined);
      }

      const mockBackendConversation = {
        id: 'conv-1',
        userId: 'user-123',
        agentName: 'my-agent', // This must match agent.name in availableAgents
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockGetBackendConversation.mockResolvedValue(mockBackendConversation);
      mockLoadConversationMessages.mockResolvedValue([]);

      mockCreateConversationObject.mockReturnValue({
        id: 'temp-id',
        userId: 'user-123',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
        agent: mockAgent, // Include the agent object so chatUiStore can extract it
        agentName: 'my-agent', // Also set agentName for backward compatibility
        agentType: 'workflow', // Also set agentType
      } as never);

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      await conversationLoadingService.loadConversationFromQuery('conv-1', mockRouter, currentRoute);

      // Verify ExecutionContext
      expect(executionContextStore.contextOrNull).toBeTruthy();
      expect(executionContextStore.contextOrNull?.orgSlug).toBe('my-org');
      expect(executionContextStore.contextOrNull?.userId).toBe('user-123');
      expect(executionContextStore.contextOrNull?.conversationId).toBe('conv-1');
      expect(executionContextStore.contextOrNull?.agentSlug).toBe('my-agent');
      expect(executionContextStore.contextOrNull?.agentType).toBe('workflow');
      expect(executionContextStore.contextOrNull?.provider).toBeDefined();
      expect(executionContextStore.contextOrNull?.model).toBeDefined();
    });

    it('should clean up query parameter after loading', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();

      // Set up authenticated user with organization (required for setActiveConversation)
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate'],
        description: 'Test agent description',
      };
      // @ts-expect-error - Mock data may not match exact type requirements
      agentsStore.setAvailableAgents([mockAgent]);

      mockGetBackendConversation.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
      });
      mockLoadConversationMessages.mockResolvedValue([]);

      mockCreateConversationObject.mockReturnValue({
        id: 'temp-id',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const currentRoute = {
        name: 'chat',
        params: { id: '123' },
        query: { conversationId: 'conv-1', otherParam: 'value' },
      };

      await conversationLoadingService.loadConversationFromQuery('conv-1', mockRouter, currentRoute);

      // Should preserve other query params
      expect(mockRouter.replace).toHaveBeenCalledWith({
        name: 'chat',
        params: { id: '123' },
        query: { conversationId: undefined, otherParam: 'value' },
      });
    });

    it('should handle router errors gracefully', async () => {
      const authStore = useAuthStore();
      const conversationsStore = useConversationsStore();

      // Set up authenticated user with organization (required for setActiveConversation)
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      conversationsStore.setConversation({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      conversationsStore.setMessages('conv-1', [
        { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Test', timestamp: new Date().toISOString() },
      ]);

      // Mock router to throw error
      mockRouter.replace = vi.fn().mockRejectedValue(new Error('Navigation failed'));

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      // Should still succeed even if router cleanup fails
      expect(result.success).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('should handle loading errors', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();

      // Set up authenticated user
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
      });
      agentsStore.setAvailableAgents([]);

      mockGetBackendConversation.mockRejectedValue(new Error('Network error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      const result = await conversationLoadingService.loadConversationFromQuery(
        'conv-1',
        mockRouter,
        currentRoute
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Service Layer Coordination', () => {
    it('should coordinate multiple stores correctly', async () => {
      const authStore = useAuthStore();
      const agentsStore = useAgentsStore();
      const conversationsStore = useConversationsStore();
      const chatUiStore = useChatUiStore();
      const executionContextStore = useExecutionContextStore();

      // Set up authenticated user with organization (required for setActiveConversation)
      authStore.$patch({
        token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com', roles: [] },
        currentOrganization: 'test-org',
      });

      const mockAgent = {
        id: 'agent-1',
        name: 'test-agent',
        type: 'context',
        execution_modes: ['immediate'],
        description: 'Test agent description',
      };
      // @ts-expect-error - Mock data may not match exact type requirements
      agentsStore.setAvailableAgents([mockAgent]);

      mockGetBackendConversation.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
      });
      mockLoadConversationMessages.mockResolvedValue([]);
      mockCreateConversationObject.mockReturnValue({
        id: 'temp-id',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const currentRoute = {
        name: 'home',
        params: {},
        query: { conversationId: 'conv-1' },
      };

      await conversationLoadingService.loadConversationFromQuery('conv-1', mockRouter, currentRoute);

      // Verify all stores were updated
      expect(conversationsStore.conversationById('conv-1')).toBeTruthy();
      expect(chatUiStore.activeConversationId).toBe('conv-1');
      expect(executionContextStore.contextOrNull).toBeTruthy();
    });
  });
});
