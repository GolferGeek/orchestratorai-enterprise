import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { IonicVue } from '@ionic/vue';
import { createPinia, setActivePinia } from 'pinia';
import ConversationTabs from '../ConversationTabs.vue';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useAgentsStore } from '@/stores/agentsStore';

// Mock child components
vi.mock('../AgentChatView.vue', () => ({
  default: {
    name: 'AgentChatView',
    template: '<div class="mock-agent-chat-view">AgentChatView</div>',
    props: ['conversation'],
  },
}));

vi.mock('../ConversationView.vue', () => ({
  default: {
    name: 'ConversationView',
    template: '<div class="mock-conversation-view">ConversationView</div>',
    props: ['conversation'],
  },
}));

// Mock services
vi.mock('@/services/agent2agent/actions', () => ({
  sendMessage: vi.fn(),
  createPlan: vi.fn(),
  createDeliverable: vi.fn(),
}));

vi.mock('@/services/conversationHelpers', () => ({
  conversation: {
    getBackendConversation: vi.fn(),
    loadConversationMessages: vi.fn(),
    createConversationObject: vi.fn(),
  },
}));

// Type helper for accessing internal component properties in tests
type ConversationTabsInstance = {
  switchToConversation: (conversationId: string) => Promise<void>;
  closeConversation: (conversationId: string) => void;
  shouldUseTwoPaneView: boolean;
  handleSendMessage: (message: string) => Promise<void>;
  activeConversation: unknown;
  openTabs: Array<{ id: string; title: string }>;
  $nextTick: () => Promise<void>;
};

// Create wrapper helper - uses the active Pinia instance
const createWrapper = (pinia: ReturnType<typeof createPinia>) => {
  return mount(ConversationTabs, {
    global: {
      plugins: [IonicVue, pinia],
      stubs: {
        'ion-icon': { template: '<div class="ion-icon-stub"></div>' },
      },
    },
  });
};

// Helper to create mock conversation
const createMockConversation = (id: string, title: string) => ({
  id,
  title,
  agentName: 'test-agent',
  agentType: 'context' as const,
  organizationSlug: 'test-org',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
});

describe('ConversationTabs', () => {
  let conversationsStore: ReturnType<typeof useConversationsStore>;
  let chatUiStore: ReturnType<typeof useChatUiStore>;
  let agentsStore: ReturnType<typeof useAgentsStore>;
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);

    conversationsStore = useConversationsStore();
    chatUiStore = useChatUiStore();
    agentsStore = useAgentsStore();

    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders without crashing', () => {
      const wrapper = createWrapper(pinia);
      expect(wrapper.exists()).toBe(true);
    });

    it('renders tab bar container', () => {
      const wrapper = createWrapper(pinia);
      const container = wrapper.find('.conversation-tabs-container');
      expect(container.exists()).toBe(true);
    });

    it('renders empty state when no conversations are open', () => {
      const wrapper = createWrapper(pinia);
      const emptyState = wrapper.find('.empty-state');
      expect(emptyState.exists()).toBe(true);
      expect(emptyState.text()).toContain('No conversations open');
    });

    it('hides tab bar when no tabs are open', () => {
      const wrapper = createWrapper(pinia);
      const tabBar = wrapper.find('.conversation-tab-bar');
      expect(tabBar.exists()).toBe(false);
    });

    it('shows tab bar when tabs are open', async () => {
      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.openConversationTab('conv-1');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      const tabBar = wrapper.find('.conversation-tab-bar');
      expect(tabBar.exists()).toBe(true);
    });
  });

  describe('Open Tabs Management', () => {
    it('displays open conversation tabs', async () => {
      const conv1 = createMockConversation('conv-1', 'Conversation 1');
      const conv2 = createMockConversation('conv-2', 'Conversation 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      expect(tabs.length).toBe(2);
    });

    it('displays correct tab titles', async () => {
      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.openConversationTab('conv-1');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      const tabTitle = wrapper.find('.tab-title');
      expect(tabTitle.text()).toBe('Test Conversation');
    });

    it('marks active tab with active class', async () => {
      const conv1 = createMockConversation('conv-1', 'Conversation 1');
      const conv2 = createMockConversation('conv-2', 'Conversation 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');
      chatUiStore.setActiveConversation('conv-2');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      expect(tabs[0].classes()).not.toContain('active');
      expect(tabs[1].classes()).toContain('active');
    });
  });

  describe('Tab Switching', () => {
    it('switches to conversation when tab is clicked', async () => {
      const wrapper = createWrapper(pinia);

      const conv1 = createMockConversation('conv-1', 'Conversation 1');
      const conv2 = createMockConversation('conv-2', 'Conversation 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      conversationsStore.setMessages('conv-1', [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
      ]);
      conversationsStore.setMessages('conv-2', [
        {
          id: 'msg-2',
          conversationId: 'conv-2',
          role: 'user',
          content: 'Hi',
          timestamp: new Date().toISOString(),
        },
      ]);

      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      await tabs[1].trigger('click');
      await wrapper.vm.$nextTick();

      expect(chatUiStore.activeConversationId).toBe('conv-2');
    });

    it('loads conversation from backend if not in store', async () => {
      const { conversation: conversationHelpers } = await import('@/services/conversationHelpers');
      const mockGetBackendConversation = conversationHelpers.getBackendConversation as ReturnType<typeof vi.fn>;
      const mockLoadConversationMessages = conversationHelpers.loadConversationMessages as ReturnType<typeof vi.fn>;
      const mockCreateConversationObject = conversationHelpers.createConversationObject as ReturnType<typeof vi.fn>;

      const wrapper = createWrapper(pinia);

      const backendConv = {
        id: 'conv-1',
        title: 'Backend Conversation',
        agentName: 'test-agent',
        agentType: 'context',
        organizationSlug: 'test-org',
        createdAt: new Date().toISOString(),
      };

      mockGetBackendConversation.mockResolvedValue(backendConv);
      mockLoadConversationMessages.mockResolvedValue([]);
      mockCreateConversationObject.mockReturnValue(createMockConversation('conv-1', 'Backend Conversation'));

      agentsStore.setAvailableAgents([
        {
          id: 'agent-1',
          name: 'test-agent',
          description: 'Test agent',
        },
      ]);

      await (wrapper.vm as unknown as ConversationTabsInstance).switchToConversation('conv-1');
      await wrapper.vm.$nextTick();

      expect(mockGetBackendConversation).toHaveBeenCalledWith('conv-1');
      expect(mockLoadConversationMessages).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('Tab Closing', () => {
    it('closes tab when close button is clicked', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.openConversationTab('conv-1');
      await wrapper.vm.$nextTick();

      const closeButton = wrapper.find('.tab-close-button');
      await closeButton.trigger('click');
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      expect(tabs.length).toBe(0);
    });

    it('does not switch conversation when clicking close button', async () => {
      const wrapper = createWrapper(pinia);

      const conv1 = createMockConversation('conv-1', 'Conversation 1');
      const conv2 = createMockConversation('conv-2', 'Conversation 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      const closeButton = tabs[1].find('.tab-close-button');
      await closeButton.trigger('click');
      await wrapper.vm.$nextTick();

      // Should still be on conv-1
      expect(chatUiStore.activeConversationId).toBe('conv-1');
    });

    it('keeps conversation data in store after closing tab', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.openConversationTab('conv-1');
      await wrapper.vm.$nextTick();

      (wrapper.vm as unknown as ConversationTabsInstance).closeConversation('conv-1');
      await wrapper.vm.$nextTick();

      // Conversation should still exist in store
      expect(conversationsStore.conversationById('conv-1')).toBeTruthy();
    });
  });

  describe('Active Conversation Display', () => {
    it('displays active conversation content', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      const activeConversation = wrapper.find('.active-conversation');
      expect(activeConversation.exists()).toBe(true);
    });

    it('uses two-pane view by default', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as unknown as ConversationTabsInstance).shouldUseTwoPaneView).toBe(true);
    });

    it('renders ConversationView for two-pane mode', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      const conversationView = wrapper.find('.mock-conversation-view');
      expect(conversationView.exists()).toBe(true);
    });
  });

  describe('Message Sending', () => {
    it('sends message in conversational mode', async () => {
      const actionsModule = await import('@/services/agent2agent/actions');
      const mockSendMessage = actionsModule.sendMessage as ReturnType<typeof vi.fn>;
      mockSendMessage.mockClear();

      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      chatUiStore.setChatMode('converse');
      await wrapper.vm.$nextTick();

      await (wrapper.vm as unknown as ConversationTabsInstance).handleSendMessage('Hello, world!');

      expect(mockSendMessage).toHaveBeenCalledWith('Hello, world!');
    });

    it('creates plan in plan mode', async () => {
      const actionsModule = await import('@/services/agent2agent/actions');
      const mockCreatePlan = actionsModule.createPlan as ReturnType<typeof vi.fn>;
      mockCreatePlan.mockClear();

      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      chatUiStore.setChatMode('plan');
      await wrapper.vm.$nextTick();

      await (wrapper.vm as unknown as ConversationTabsInstance).handleSendMessage('Create a plan');

      expect(mockCreatePlan).toHaveBeenCalledWith('Create a plan');
    });

    it('creates deliverable in build mode', async () => {
      const actionsModule = await import('@/services/agent2agent/actions');
      const mockCreateDeliverable = actionsModule.createDeliverable as ReturnType<typeof vi.fn>;
      mockCreateDeliverable.mockClear();

      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');
      chatUiStore.setChatMode('build');
      await wrapper.vm.$nextTick();

      await (wrapper.vm as unknown as ConversationTabsInstance).handleSendMessage('Build something');

      expect(mockCreateDeliverable).toHaveBeenCalledWith('Build something');
    });

    it('does not send message when no active conversation', async () => {
      const { sendMessage } = await import('@/services/agent2agent/actions');
      const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;

      const wrapper = createWrapper(pinia);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await (wrapper.vm as unknown as ConversationTabsInstance).handleSendMessage('Hello');

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Cannot send message: no active conversation');

      consoleSpy.mockRestore();
    });
  });

  describe('Computed Properties', () => {
    it('computes activeConversation from chatUiStore', async () => {
      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.setActiveConversation('conv-1');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as unknown as ConversationTabsInstance).activeConversation).toEqual(conv);
    });

    it('computes openTabs from chatUiStore', async () => {
      const conv1 = createMockConversation('conv-1', 'Conversation 1');
      const conv2 = createMockConversation('conv-2', 'Conversation 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as unknown as ConversationTabsInstance).openTabs.length).toBe(2);
      expect((wrapper.vm as unknown as ConversationTabsInstance).openTabs[0].id).toBe('conv-1');
      expect((wrapper.vm as unknown as ConversationTabsInstance).openTabs[1].id).toBe('conv-2');
    });

    it('filters out undefined conversations from openTabs', async () => {
      const wrapper = createWrapper(pinia);

      chatUiStore.openConversationTab('non-existent-conv');
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as unknown as ConversationTabsInstance).openTabs.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles switching to same conversation', async () => {
      const wrapper = createWrapper(pinia);

      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      conversationsStore.setMessages('conv-1', [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
      ]);
      chatUiStore.setActiveConversation('conv-1');
      await wrapper.vm.$nextTick();

      // Switch to same conversation
      await (wrapper.vm as unknown as ConversationTabsInstance).switchToConversation('conv-1');

      expect(chatUiStore.activeConversationId).toBe('conv-1');
    });

    it('handles closing last tab', async () => {
      const conv = createMockConversation('conv-1', 'Test Conversation');
      conversationsStore.setConversation(conv);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.setActiveConversation('conv-1');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      // Before closing, should have active conversation
      expect(chatUiStore.activeConversationId).toBe('conv-1');

      (wrapper.vm as unknown as ConversationTabsInstance).closeConversation('conv-1');
      await wrapper.vm.$nextTick();

      // After closing last tab, active conversation should be null
      expect(chatUiStore.activeConversationId).toBeNull();
    });

    it('handles multiple tabs with same agent', async () => {
      const conv1 = createMockConversation('conv-1', 'Session 1');
      const conv2 = createMockConversation('conv-2', 'Session 2');

      conversationsStore.setConversation(conv1);
      conversationsStore.setConversation(conv2);
      chatUiStore.openConversationTab('conv-1');
      chatUiStore.openConversationTab('conv-2');

      const wrapper = createWrapper(pinia);
      await wrapper.vm.$nextTick();

      const tabs = wrapper.findAll('.conversation-tab');
      expect(tabs.length).toBe(2);
      expect(tabs[0].find('.tab-title').text()).toBe('Session 1');
      expect(tabs[1].find('.tab-title').text()).toBe('Session 2');
    });
  });
});
