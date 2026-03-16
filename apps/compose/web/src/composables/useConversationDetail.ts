import { ref, computed } from 'vue';
import axios from 'axios';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
export interface ObservabilityEvent {
  id?: string;
  hook_event_type: string;
  created_at?: string;
  timestamp?: number;
  context: {
    taskId?: string;
    conversationId?: string;
    userId?: string;
    agentSlug?: string;
  };
  message?: string;
  metadata?: Record<string, unknown>;
  payload?: {
    data?: { metadata?: Record<string, unknown> };
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  user_id: string;
  agent_slug: string;
  organization_slug: string | null;
  mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  messages?: ConversationMessage[];
}

export interface TaskDetail {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DeliverableDetail {
  id: string;
  title: string;
  content: string;
  format: string;
  created_at: string;
}

/**
 * Composable for fetching and managing conversation details
 */
export function useConversationDetail() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  
  const conversation = ref<ConversationDetail | null>(null);
  const events = ref<ObservabilityEvent[]>([]);
  const tasks = ref<TaskDetail[]>([]);
  const deliverables = ref<DeliverableDetail[]>([]);
  
  const apiUrl = getSecureApiBaseUrl();
  
  // Computed
  const hasData = computed(() => conversation.value !== null);
  
  const eventsByType = computed(() => {
    const grouped: Record<string, ObservabilityEvent[]> = {};
    for (const event of events.value) {
      const type = event.hook_event_type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(event);
    }
    return grouped;
  });
  
  const eventTimeline = computed(() => {
    return [...events.value].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.timestamp ?? 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.timestamp ?? 0);
      return timeA - timeB;
    });
  });
  
  /**
   * Fetch conversation details and related data
   */
  async function fetchConversationDetail(conversationId: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    
    try {
      // Fetch conversation
      const conversationResponse = await axios.get<ConversationDetail>(
        `${apiUrl}/agent2agent/conversations/${conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
        }
      );
      conversation.value = conversationResponse.data;
      
      // Fetch observability events for this conversation
      const eventsResponse = await axios.get<ObservabilityEvent[]>(
        `${apiUrl}/observability/events`,
        {
          params: { conversation_id: conversationId },
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
        }
      );
      events.value = eventsResponse.data;
      
      // Fetch related tasks
      try {
        const tasksResponse = await axios.get<TaskDetail[]>(
          `${apiUrl}/agent2agent/tasks`,
          {
            params: { conversation_id: conversationId },
            headers: {
              Authorization: `Bearer ${localStorage.getItem('access_token')}`,
            },
          }
        );
        tasks.value = tasksResponse.data;
      } catch {
        // Tasks endpoint might not exist or have no results
        tasks.value = [];
      }
      
      // Fetch deliverables
      try {
        const deliverablesResponse = await axios.get<DeliverableDetail[]>(
          `${apiUrl}/agent2agent/deliverables`,
          {
            params: { conversation_id: conversationId },
            headers: {
              Authorization: `Bearer ${localStorage.getItem('access_token')}`,
            },
          }
        );
        deliverables.value = deliverablesResponse.data;
      } catch {
        // Deliverables might not exist
        deliverables.value = [];
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch conversation details';
      console.error('Error fetching conversation detail:', err);
    } finally {
      isLoading.value = false;
    }
  }
  
  /**
   * Clear all data
   */
  function clear(): void {
    conversation.value = null;
    events.value = [];
    tasks.value = [];
    deliverables.value = [];
    error.value = null;
  }
  
  return {
    // State
    isLoading,
    error,
    conversation,
    events,
    tasks,
    deliverables,
    
    // Computed
    hasData,
    eventsByType,
    eventTimeline,
    
    // Actions
    fetchConversationDetail,
    clear,
  };
}

