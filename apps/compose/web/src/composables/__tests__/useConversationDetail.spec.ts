import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConversationDetail } from '../useConversationDetail';
import type {
  ConversationDetail,
  TaskDetail,
  DeliverableDetail,
} from '../useConversationDetail';
import type { ObservabilityEvent } from '../useConversationDetail';
import axios from 'axios';

// Mock axios
vi.mock('axios');

// Mock environment variable
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:6100',
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => 'mock-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useConversationDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with empty state', () => {
      const {
        isLoading,
        error,
        conversation,
        events,
        tasks,
        deliverables,
      } = useConversationDetail();

      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();
      expect(conversation.value).toBeNull();
      expect(events.value).toEqual([]);
      expect(tasks.value).toEqual([]);
      expect(deliverables.value).toEqual([]);
    });

    it('should initialize computed properties', () => {
      const { hasData, eventsByType, eventTimeline } = useConversationDetail();

      expect(hasData.value).toBe(false);
      expect(eventsByType.value).toEqual({});
      expect(eventTimeline.value).toEqual([]);
    });
  });

  describe('Fetching Conversation Details', () => {
    it('should fetch conversation details successfully', async () => {
      const mockConversation: ConversationDetail = {
        id: 'conv-123',
        user_id: 'user-1',
        agent_slug: 'test-agent',
        organization_slug: 'test-org',
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      const mockEvents: ObservabilityEvent[] = [
        {
          id: 'event-1',
          hook_event_type: 'conversation_start',
          timestamp: Date.now(),
          created_at: '2024-01-01T00:00:00Z',
        } as unknown as ObservabilityEvent,
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockConversation });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockEvents });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

      const { fetchConversationDetail, conversation, events, isLoading } =
        useConversationDetail();

      expect(isLoading.value).toBe(false);

      const promise = fetchConversationDetail('conv-123');
      expect(isLoading.value).toBe(true);

      await promise;

      expect(isLoading.value).toBe(false);
      expect(conversation.value).toEqual(mockConversation);
      expect(events.value).toEqual(mockEvents);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/conversations/conv-123'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer mock-token',
          },
        })
      );
    });

    it('should fetch related tasks', async () => {
      const mockTasks: TaskDetail[] = [
        {
          id: 'task-1',
          name: 'Test Task',
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockTasks });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

      const { fetchConversationDetail, tasks } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(tasks.value).toEqual(mockTasks);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/tasks'),
        expect.objectContaining({
          params: { conversation_id: 'conv-123' },
        })
      );
    });

    it('should fetch related deliverables', async () => {
      const mockDeliverables: DeliverableDetail[] = [
        {
          id: 'del-1',
          title: 'Test Deliverable',
          content: 'Content',
          format: 'markdown',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDeliverables });

      const { fetchConversationDetail, deliverables } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(deliverables.value).toEqual(mockDeliverables);
    });

    it('should handle tasks endpoint failure gracefully', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Tasks not found'));
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

      const { fetchConversationDetail, tasks, error } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(tasks.value).toEqual([]);
      expect(error.value).toBeNull();
    });

    it('should handle deliverables endpoint failure gracefully', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Deliverables not found'));

      const { fetchConversationDetail, deliverables, error } =
        useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(deliverables.value).toEqual([]);
      expect(error.value).toBeNull();
    });

    it('should handle conversation fetch error', async () => {
      const errorMessage = 'Conversation not found';
      vi.mocked(axios.get).mockRejectedValueOnce(new Error(errorMessage));

      const { fetchConversationDetail, error, isLoading } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(error.value).toBe(errorMessage);
      expect(isLoading.value).toBe(false);
    });

    it('should use authorization token from localStorage', async () => {
      localStorageMock.getItem.mockReturnValueOnce('custom-token');

      vi.mocked(axios.get).mockResolvedValue({ data: {} });

      const { fetchConversationDetail } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer custom-token',
          },
        })
      );
    });
  });

  describe('Computed Properties', () => {
    it('should compute hasData correctly', async () => {
      const mockConversation: ConversationDetail = {
        id: 'conv-123',
        user_id: 'user-1',
        agent_slug: 'test-agent',
        organization_slug: null,
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(axios.get).mockResolvedValue({ data: mockConversation });

      const { fetchConversationDetail, hasData } = useConversationDetail();

      expect(hasData.value).toBe(false);

      await fetchConversationDetail('conv-123');

      expect(hasData.value).toBe(true);
    });

    it('should group events by type', async () => {
      const mockEvents: ObservabilityEvent[] = [
        {
          id: 'event-1',
          hook_event_type: 'conversation_start',
          timestamp: 1000,
        } as unknown as ObservabilityEvent,
        {
          id: 'event-2',
          hook_event_type: 'message_sent',
          timestamp: 2000,
        } as unknown as ObservabilityEvent,
        {
          id: 'event-3',
          hook_event_type: 'message_sent',
          timestamp: 3000,
        } as unknown as ObservabilityEvent,
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockEvents });
      vi.mocked(axios.get).mockResolvedValue({ data: [] });

      const { fetchConversationDetail, eventsByType } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(eventsByType.value).toEqual({
        conversation_start: [mockEvents[0]],
        message_sent: [mockEvents[1], mockEvents[2]],
      });
    });

    it('should create sorted event timeline', async () => {
      const mockEvents: ObservabilityEvent[] = [
        {
          id: 'event-3',
          hook_event_type: 'event_3',
          timestamp: 3000,
          created_at: '2024-01-01T00:03:00Z',
        } as unknown as ObservabilityEvent,
        {
          id: 'event-1',
          hook_event_type: 'event_1',
          timestamp: 1000,
          created_at: '2024-01-01T00:01:00Z',
        } as unknown as ObservabilityEvent,
        {
          id: 'event-2',
          hook_event_type: 'event_2',
          timestamp: 2000,
          created_at: '2024-01-01T00:02:00Z',
        } as unknown as ObservabilityEvent,
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockEvents });
      vi.mocked(axios.get).mockResolvedValue({ data: [] });

      const { fetchConversationDetail, eventTimeline } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(eventTimeline.value).toHaveLength(3);
      expect(eventTimeline.value[0].id).toBe('event-1');
      expect(eventTimeline.value[1].id).toBe('event-2');
      expect(eventTimeline.value[2].id).toBe('event-3');
    });

    it('should handle events without created_at timestamp', async () => {
      const mockEvents: ObservabilityEvent[] = [
        {
          id: 'event-1',
          hook_event_type: 'event_1',
          timestamp: 2000,
        } as unknown as ObservabilityEvent,
        {
          id: 'event-2',
          hook_event_type: 'event_2',
          timestamp: 1000,
        } as unknown as ObservabilityEvent,
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockEvents });
      vi.mocked(axios.get).mockResolvedValue({ data: [] });

      const { fetchConversationDetail, eventTimeline } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(eventTimeline.value[0].id).toBe('event-2');
      expect(eventTimeline.value[1].id).toBe('event-1');
    });
  });

  describe('Clear Functionality', () => {
    it('should clear all data', async () => {
      const mockConversation: ConversationDetail = {
        id: 'conv-123',
        user_id: 'user-1',
        agent_slug: 'test-agent',
        organization_slug: null,
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(axios.get).mockResolvedValue({ data: mockConversation });

      const {
        fetchConversationDetail,
        clear,
        conversation,
        events,
        tasks,
        deliverables,
        error,
      } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(conversation.value).not.toBeNull();

      clear();

      expect(conversation.value).toBeNull();
      expect(events.value).toEqual([]);
      expect(tasks.value).toEqual([]);
      expect(deliverables.value).toEqual([]);
      expect(error.value).toBeNull();
    });
  });

  describe('Reactivity', () => {
    it('should update isLoading during fetch', async () => {
      let resolveAxios: (value: unknown) => void;
      const axiosPromise = new Promise((resolve) => {
        resolveAxios = resolve;
      });

      vi.mocked(axios.get).mockReturnValue(axiosPromise as Promise<{ data: unknown }>);

      const { fetchConversationDetail, isLoading } = useConversationDetail();

      const fetchPromise = fetchConversationDetail('conv-123');

      expect(isLoading.value).toBe(true);

      resolveAxios!({ data: {} });
      await fetchPromise;

      expect(isLoading.value).toBe(false);
    });

    it('should update conversation ref when data is fetched', async () => {
      const mockConversation: ConversationDetail = {
        id: 'conv-123',
        user_id: 'user-1',
        agent_slug: 'test-agent',
        organization_slug: null,
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(axios.get).mockResolvedValue({ data: mockConversation });

      const { fetchConversationDetail, conversation } = useConversationDetail();

      expect(conversation.value).toBeNull();

      await fetchConversationDetail('conv-123');

      expect(conversation.value).toEqual(mockConversation);
    });

    it('should update error ref on fetch failure', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

      const { fetchConversationDetail, error } = useConversationDetail();

      expect(error.value).toBeNull();

      await fetchConversationDetail('conv-123');

      expect(error.value).toBe('Network error');
    });

    it('should clear error on successful fetch', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('First error'));

      const { fetchConversationDetail, error } = useConversationDetail();

      await fetchConversationDetail('conv-123');
      expect(error.value).toBe('First error');

      vi.mocked(axios.get).mockResolvedValue({ data: {} });

      await fetchConversationDetail('conv-123');
      expect(error.value).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      vi.mocked(axios.get).mockRejectedValue('String error');

      const { fetchConversationDetail, error } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(error.value).toBe('Failed to fetch conversation details');
    });

    it('should handle empty responses', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: {} });

      const { fetchConversationDetail, conversation } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(conversation.value).toEqual({});
    });

    it('should handle multiple consecutive fetches', async () => {
      const mockConv1: ConversationDetail = {
        id: 'conv-1',
        user_id: 'user-1',
        agent_slug: 'agent-1',
        organization_slug: null,
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockConv2: ConversationDetail = {
        id: 'conv-2',
        user_id: 'user-2',
        agent_slug: 'agent-2',
        organization_slug: null,
        mode: 'chat',
        status: 'active',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      vi.mocked(axios.get)
        .mockResolvedValueOnce({ data: mockConv1 })
        .mockResolvedValue({ data: [] });

      const { fetchConversationDetail, conversation } = useConversationDetail();

      await fetchConversationDetail('conv-1');
      expect(conversation.value?.id).toBe('conv-1');

      vi.mocked(axios.get)
        .mockResolvedValueOnce({ data: mockConv2 })
        .mockResolvedValue({ data: [] });

      await fetchConversationDetail('conv-2');
      expect(conversation.value?.id).toBe('conv-2');
    });

    it('should use default API URL when env var not set', () => {
      vi.stubGlobal('import.meta', { env: {} });

      const { fetchConversationDetail } = useConversationDetail();

      vi.mocked(axios.get).mockResolvedValue({ data: {} });

      fetchConversationDetail('conv-123');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/conversations/conv-123'),
        expect.any(Object)
      );
    });
  });

  describe('API Integration', () => {
    it('should make correct API calls for all endpoints', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: [] });

      const { fetchConversationDetail } = useConversationDetail();

      await fetchConversationDetail('conv-123');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/conversations/conv-123'),
        expect.any(Object)
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/observability/events'),
        expect.objectContaining({
          params: { conversation_id: 'conv-123' },
        })
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/tasks'),
        expect.objectContaining({
          params: { conversation_id: 'conv-123' },
        })
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agent2agent/deliverables'),
        expect.objectContaining({
          params: { conversation_id: 'conv-123' },
        })
      );
    });
  });
});
