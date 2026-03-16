/**
 * Unified Conversations Store
 * Consolidates: conversationStore.ts + agentConversationsStore.ts
 *
 * Manages ALL conversation data (messages, tasks, metadata) in a single domain store.
 *
 * Architecture:
 * - State ONLY (no async, no API calls, no business logic)
 * - Uses Maps for O(1) lookups
 * - Synchronous mutations only
 * - Services call mutations after API success
 * - Vue reactivity updates UI automatically
 */

import { defineStore } from 'pinia';
import { ref, shallowRef, computed, readonly } from 'vue';
import type { AgentTaskMode } from '@/types/forge-types';
import type {
  MessageMetadata,
  ConversationMetadata,
} from '@/types/message';
import type {
  TaskStatus,
  TaskMetadata,
  TaskData,
} from '@/types/task';
import type { AgentConversation, Agent } from '@/types/conversation';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent types supported in the system
 */
export type AgentType =
  | 'context'
  | 'function'
  | 'api'
  | 'orchestrator'
  | 'custom';

/**
 * Store Conversation type - simplified for storage
 * Can be extended with AgentConversation properties
 * Omits conflicting date types from AgentConversation to support both Date and string
 */
export interface Conversation extends Omit<Partial<AgentConversation>, 'createdAt' | 'lastActiveAt'> {
  // Required fields
  id: string;
  title: string;

  // Optional backend fields
  userId?: string;
  agentName?: string;
  agentType?: AgentType;
  organizationSlug?: string | null;

  // Timestamps (override AgentConversation's Date types to support string)
  createdAt: Date | string;
  updatedAt?: Date | string;
  startedAt?: Date | string;
  lastActiveAt?: Date | string;
  endedAt?: Date | string;

  // Task counts
  taskCount?: number;
  completedTasks?: number;
  failedTasks?: number;
  activeTasks?: number;

  // Agent reference
  agent?: Agent;

  // Metadata
  metadata?: Record<string, unknown>;

  // Execution modes
  executionMode?: 'immediate' | 'polling' | 'real-time' | 'auto';
  supportedExecutionModes?: ('immediate' | 'polling' | 'real-time' | 'auto')[];
  isExecutionModeOverride?: boolean;
}

/**
 * Message in a conversation
 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: MessageMetadata;
}

/**
 * Task associated with a conversation
 */
export interface Task {
  id: string;
  conversationId: string;
  mode: AgentTaskMode;
  action: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: TaskMetadata;
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: TaskData;
  error?: string;
  completedAt: string;
}

// Re-export types
export type { TaskStatus, MessageMetadata, ConversationMetadata, TaskMetadata, TaskData };

// ============================================================================
// Store Definition
// ============================================================================

export const useConversationsStore = defineStore('conversations', () => {
  // ============================================================================
  // STATE - Pure reactive data using Maps for O(1) lookups
  // ============================================================================

  const conversations = ref<Map<string, Conversation>>(new Map());
  const messages = ref<Map<string, Message[]>>(new Map()); // conversationId -> messages[]
  const tasks = shallowRef<Map<string, Task>>(new Map()); // taskId -> task
  const taskResults = shallowRef<Map<string, TaskResult>>(new Map()); // taskId -> result
  const tasksByConversation = ref<Map<string, string[]>>(new Map()); // conversationId -> taskIds[]

  const activeConversationId = ref<string | null>(null);
  const loadingStates = ref<Map<string, boolean>>(new Map());
  const error = ref<string | null>(null);

  // ============================================================================
  // GETTERS - Computed properties for data access
  // ============================================================================

  /**
   * Get active conversation
   */
  const activeConversation = computed((): Conversation | null => {
    if (!activeConversationId.value) return null;
    return conversations.value.get(activeConversationId.value) || null;
  });

  /**
   * Get messages for active conversation
   */
  const activeMessages = computed(() => {
    if (!activeConversationId.value) return [];
    return messages.value.get(activeConversationId.value) || [];
  });

  /**
   * Get all conversations as sorted array
   */
  const allConversations = computed(() => {
    return Array.from(conversations.value.values())
      .sort((a, b) => {
        const dateA = a.lastActiveAt || a.updatedAt || a.createdAt;
        const dateB = b.lastActiveAt || b.updatedAt || b.createdAt;
        return new Date(dateB as string | Date).getTime() - new Date(dateA as string | Date).getTime();
      });
  });

  /**
   * Get active conversations (not ended)
   */
  const activeConversations = computed(() => {
    return Array.from(conversations.value.values())
      .filter(conv => !conv.endedAt)
      .sort((a, b) => {
        const dateA = a.lastActiveAt || a.updatedAt || a.createdAt;
        const dateB = b.lastActiveAt || b.updatedAt || b.createdAt;
        return new Date(dateB as string | Date).getTime() - new Date(dateA as string | Date).getTime();
      });
  });

  /**
   * Get running tasks
   */
  const runningTasks = computed((): Task[] => {
    const taskMap = tasks.value as Map<string, Task>;
    const taskArray: Task[] = Array.from(taskMap.values());
    return taskArray
      .filter(task => task.status === 'running')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  /**
   * Get completed tasks
   */
  const completedTasks = computed((): Task[] => {
    const taskMap = tasks.value as Map<string, Task>;
    const taskArray: Task[] = Array.from(taskMap.values());
    return taskArray
      .filter(task => task.status === 'completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  /**
   * Get failed tasks
   */
  const failedTasks = computed((): Task[] => {
    const taskMap = tasks.value as Map<string, Task>;
    const taskArray: Task[] = Array.from(taskMap.values());
    return taskArray
      .filter(task => task.status === 'failed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  // ============================================================================
  // GETTER FUNCTIONS - Functions that return computed data
  // ============================================================================

  /**
   * Get conversation by ID
   */
  const conversationById = (id: string): Conversation | undefined => {
    return conversations.value.get(id);
  };

  /**
   * Get messages by conversation ID
   * Note: This function returns a reference to the messages array.
   * Vue reactivity should track changes when the map is replaced.
   */
  const messagesByConversation = (conversationId: string): Message[] => {
    // Access the map to ensure Vue tracks this dependency
    const msgMap = messages.value;
    const result = msgMap.get(conversationId) || [];
    return result;
  };

  /**
   * Get tasks by conversation ID
   */
  const tasksByConversationId = (conversationId: string): Task[] => {
    const taskIds = tasksByConversation.value.get(conversationId) || [];
    const taskMap = tasks.value as Map<string, Task>;
    return taskIds
      .map(id => taskMap.get(id))
      .filter((task): task is Task => task !== undefined)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  /**
   * Get conversations by agent name
   */
  const conversationsByAgent = (agentName: string, organizationSlug?: string | null): Conversation[] => {
    // Normalize agent name for comparison (handle different formats: blog-post-writer, blog_post_writer, Blog Post Writer)
    const normalizeAgentName = (name: string): string => {
      if (!name) return '';
      return name.toLowerCase().replace(/[-_\s]/g, '-');
    };
    
    // Dashboard agents that should appear first in the list
    const DASHBOARD_AGENTS = ['legal-department', 'marketing-swarm'];
    
    const normalizedSearchName = normalizeAgentName(agentName);
    
    const matched = Array.from(conversations.value.values())
      .filter(conv => {
        // Check both agentName field and agent.name, with normalization
        const convAgentName = conv.agentName || conv.agent?.name || '';
        const normalizedConvName = normalizeAgentName(convAgentName);
        const matchesName = normalizedConvName === normalizedSearchName || conv.agentName === agentName || conv.agent?.name === agentName;
        
        if (!matchesName) return false;
        
        // Handle organizationSlug matching
        // If organizationSlug is explicitly provided (including null), match it exactly
        // If undefined, match any organizationSlug (including null)
        if (organizationSlug !== undefined) {
          const convOrg = conv.organizationSlug || conv.agent?.organizationSlug || null;
          // Normalize both to null if they're falsy for comparison
          const normalizedConvOrg = convOrg || null;
          const normalizedFilterOrg = organizationSlug || null;
          const orgMatches = normalizedConvOrg === normalizedFilterOrg;
          return orgMatches;
        }
        return true;
      })
      .sort((a, b) => {
        // Check if conversations are from dashboard agents
        const aAgentName = normalizeAgentName(a.agentName || a.agent?.name || '');
        const bAgentName = normalizeAgentName(b.agentName || b.agent?.name || '');
        
        const aIsDashboard = DASHBOARD_AGENTS.includes(aAgentName);
        const bIsDashboard = DASHBOARD_AGENTS.includes(bAgentName);
        
        // Put dashboard conversations first
        if (aIsDashboard && !bIsDashboard) return -1;
        if (!aIsDashboard && bIsDashboard) return 1;
        
        // Within same group (both dashboard or both regular), sort by date (most recent first)
        const dateA = new Date(a.lastActiveAt || a.updatedAt || a.createdAt);
        const dateB = new Date(b.lastActiveAt || b.updatedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

    return matched;
  };

  /**
   * Get conversations by agent type
   */
  const conversationsByAgentType = (agentType: AgentType): Conversation[] => {
    return Array.from(conversations.value.values())
      .filter(conv => conv.agentType === agentType || conv.agent?.type === agentType)
      .sort((a, b) => {
        const dateA = new Date(a.lastActiveAt || a.updatedAt || a.createdAt);
        const dateB = new Date(b.lastActiveAt || b.updatedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
  };

  /**
   * Get task by ID
   */
  const taskById = (id: string): Task | undefined => {
    return tasks.value.get(id);
  };

  /**
   * Get task result by task ID
   */
  const resultByTaskId = (id: string): TaskResult | undefined => {
    return taskResults.value.get(id);
  };

  /**
   * Check if conversation is loading
   */
  const isLoading = (conversationId: string): boolean => {
    return loadingStates.value.get(conversationId) || false;
  };

  // ============================================================================
  // MUTATIONS - ONLY way to mutate state (synchronous only)
  // ============================================================================

  // --------------------------------------------------------------------------
  // Conversation Mutations
  // --------------------------------------------------------------------------

  /**
   * Add or update a conversation
   * Called by services after API success
   */
  function setConversation(conversation: Conversation): void {
    conversations.value.set(conversation.id, conversation);

    // Initialize messages and tasks arrays if not exists
    if (!messages.value.has(conversation.id)) {
      messages.value.set(conversation.id, []);
    }
    if (!tasksByConversation.value.has(conversation.id)) {
      tasksByConversation.value.set(conversation.id, []);
    }
  }

  /**
   * Add multiple conversations at once
   * Used when loading conversations from API
   */
  function setConversations(conversationList: Conversation[]): void {
    conversationList.forEach(conv => setConversation(conv));
  }

  /**
   * Update conversation data
   */
  function updateConversation(conversationId: string, updates: Partial<Conversation>): void {
    const existing = conversations.value.get(conversationId);
    if (existing) {
      conversations.value.set(conversationId, {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Update conversation task counts
   */
  function updateConversationTaskCounts(
    conversationId: string,
    taskCounts: { activeTaskId?: string | null }
  ): void {
    const existing = conversations.value.get(conversationId);
    if (existing) {
      conversations.value.set(conversationId, {
        ...existing,
        ...taskCounts,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Delete a conversation
   * Also removes associated messages and tasks
   */
  function removeConversation(conversationId: string): void {
    conversations.value.delete(conversationId);
    messages.value.delete(conversationId);
    loadingStates.value.delete(conversationId);

    // Remove all tasks for this conversation
    const taskIds = tasksByConversation.value.get(conversationId) || [];
    taskIds.forEach(taskId => {
      tasks.value.delete(taskId);
      taskResults.value.delete(taskId);
    });
    tasksByConversation.value.delete(conversationId);

    // Clear active conversation if it was deleted
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null;
    }
  }

  /**
   * Set active conversation
   */
  function setActiveConversation(conversationId: string | null): void {
    if (conversationId === null || conversations.value.has(conversationId)) {
      activeConversationId.value = conversationId;
    }
  }

  /**
   * Set loading state for a conversation
   */
  function setLoading(conversationId: string, loading: boolean): void {
    loadingStates.value.set(conversationId, loading);
  }

  // --------------------------------------------------------------------------
  // Message Mutations
  // --------------------------------------------------------------------------

  /**
   * Add a message to a conversation
   */
  function addMessage(conversationId: string, message: Omit<Message, 'id'>): Message {
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      conversationId,
    };

    const conversationMessages = messages.value.get(conversationId) || [];

    // Create a new Map to trigger Vue reactivity
    const newMessages = new Map(messages.value);
    newMessages.set(conversationId, [...conversationMessages, newMessage]);
    messages.value = newMessages;

    // Update conversation's updatedAt and lastActiveAt
    updateConversation(conversationId, {
      updatedAt: newMessage.timestamp,
      lastActiveAt: newMessage.timestamp,
    });

    return newMessage;
  }

  /**
   * Add assistant message from handler result
   * Helper for converse handler
   */
  function addAssistantMessage(
    conversationId: string,
    result: { message: string; sources?: MessageMetadata['sources']; metadata?: MessageMetadata }
  ): Message {
    // Include sources in metadata if present
    const metadata: MessageMetadata = {
      ...result.metadata,
      ...(result.sources && { sources: result.sources }),
    };
    return addMessage(conversationId, {
      conversationId,
      role: 'assistant',
      content: result.message,
      timestamp: result.metadata?.generation?.duration
        ? new Date().toISOString()
        : new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Add user message
   * Helper for creating user messages
   */
  function addUserMessage(
    conversationId: string,
    content: string,
    metadata?: MessageMetadata
  ): Message {
    return addMessage(conversationId, {
      conversationId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Set all messages for a conversation
   * Used when loading messages from API
   */
  function setMessages(conversationId: string, messageList: Message[]): void {
    // Create a new Map to trigger Vue reactivity
    const newMessages = new Map(messages.value);
    newMessages.set(conversationId, messageList);
    messages.value = newMessages;
  }

  /**
   * Clear all messages for a conversation
   */
  function clearMessages(conversationId: string): void {
    // Create a new Map to trigger Vue reactivity
    const newMessages = new Map(messages.value);
    newMessages.set(conversationId, []);
    messages.value = newMessages;
  }

  /**
   * Update message metadata
   * Useful for updating workflow progress in real-time
   */
  function updateMessageMetadata(
    conversationId: string,
    messageId: string,
    metadataUpdates: Partial<MessageMetadata>
  ): void {
    const conversationMessages = messages.value.get(conversationId);
    if (!conversationMessages) return;

    const messageIndex = conversationMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    const message = conversationMessages[messageIndex];
    
    // Create a new message object with updated metadata
    // IMPORTANT: Deep clone metadata to ensure Vue detects nested changes
    const updatedMessage = {
      ...message,
      metadata: {
        ...message.metadata,
        ...metadataUpdates,
      },
    };

    // Create a completely new array with the updated message
    // This ensures Vue reactivity detects the change
    const newConversationMessages = [
      ...conversationMessages.slice(0, messageIndex),
      updatedMessage,
      ...conversationMessages.slice(messageIndex + 1),
    ];

    // Create a new Map to trigger Vue reactivity
    const newMessages = new Map(messages.value);
    newMessages.set(conversationId, newConversationMessages);
    messages.value = newMessages;
  }

  /**
   * Update entire message (content, deliverableId, metadata, etc.)
   */
  function updateMessage(
    conversationId: string,
    messageId: string,
    updates: Partial<Omit<Message, 'id' | 'conversationId'>>
  ): void {
    const conversationMessages = messages.value.get(conversationId);
    if (!conversationMessages) return;

    const messageIndex = conversationMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    const message = conversationMessages[messageIndex];
    const updatedMessage = {
      ...message,
      ...updates,
      metadata: updates.metadata ? {
        ...message.metadata,
        ...updates.metadata,
      } : message.metadata,
    };

    // Create a completely new array with the updated message
    // This ensures Vue reactivity detects the change
    const newConversationMessages = [
      ...conversationMessages.slice(0, messageIndex),
      updatedMessage,
      ...conversationMessages.slice(messageIndex + 1),
    ];

    // Create a new Map to trigger Vue reactivity
    const newMessages = new Map(messages.value);
    newMessages.set(conversationId, newConversationMessages);
    messages.value = newMessages;
  }

  // --------------------------------------------------------------------------
  // Task Mutations
  // --------------------------------------------------------------------------

  /**
   * Add a task
   */
  function addTask(task: Task): void {
    (tasks.value as Map<string, Task>).set(task.id, task);

    // Track task by conversation
    const conversationTasks = tasksByConversation.value.get(task.conversationId) || [];
    if (!conversationTasks.includes(task.id)) {
      tasksByConversation.value.set(task.conversationId, [...conversationTasks, task.id]);
    }
  }

  /**
   * Update task status
   */
  function updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = tasks.value.get(taskId) as Task | undefined;
    if (task) {
      const updatedTask: Task = {
        id: task.id,
        conversationId: task.conversationId,
        mode: task.mode,
        action: task.action,
        status,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString(),
        metadata: task.metadata,
      };
      (tasks.value as Map<string, Task>).set(taskId, updatedTask);
    }
  }

  /**
   * Update task metadata
   */
  function updateTaskMetadata(taskId: string, metadata: TaskMetadata): void {
    const task = tasks.value.get(taskId) as Task | undefined;
    if (task) {
      const updatedTask: Task = {
        id: task.id,
        conversationId: task.conversationId,
        mode: task.mode,
        action: task.action,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: new Date().toISOString(),
        metadata: { ...task.metadata, ...metadata },
      };
      (tasks.value as Map<string, Task>).set(taskId, updatedTask);
    }
  }

  /**
   * Set task result
   */
  function setTaskResult(taskId: string, result: Omit<TaskResult, 'taskId'>): void {
    const taskResult: TaskResult = {
      taskId,
      success: result.success,
      data: result.data,
      error: result.error,
      completedAt: result.completedAt,
    };

    (taskResults.value as Map<string, TaskResult>).set(taskId, taskResult);

    // Update task status based on result
    updateTaskStatus(taskId, result.success ? 'completed' : 'failed');
  }

  /**
   * Clear tasks for a conversation
   */
  function clearTasksByConversation(conversationId: string): void {
    const taskIds = tasksByConversation.value.get(conversationId) || [];

    taskIds.forEach(taskId => {
      (tasks.value as Map<string, Task>).delete(taskId);
      (taskResults.value as Map<string, TaskResult>).delete(taskId);
    });

    tasksByConversation.value.delete(conversationId);
  }

  // --------------------------------------------------------------------------
  // Error Mutations
  // --------------------------------------------------------------------------

  /**
   * Set global error
   */
  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  /**
   * Clear global error
   */
  function clearError(): void {
    error.value = null;
  }

  // --------------------------------------------------------------------------
  // Clear All
  // --------------------------------------------------------------------------

  /**
   * Clear all data (used on logout)
   */
  function clearAll(): void {
    conversations.value.clear();
    messages.value.clear();
    tasks.value.clear();
    taskResults.value.clear();
    tasksByConversation.value.clear();
    loadingStates.value.clear();
    activeConversationId.value = null;
    error.value = null;
  }

  // ============================================================================
  // DEPRECATED ASYNC METHODS - REMOVED
  // All async operations have been moved to conversationsService.ts
  // Use conversationsService.fetchConversations() and conversationsService.deleteConversation()
  // ============================================================================

  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================

  return {
    // State (read-only exposure)
    conversations: readonly(conversations),
    activeConversationId: readonly(activeConversationId),
    error: readonly(error),
    // Expose messages Map for direct reactive access
    // Components can use: store.messagesMap.get(conversationId)
    messagesMap: readonly(messages),

    // Computed getters
    activeConversation,
    activeMessages,
    allConversations,
    activeConversations,
    runningTasks,
    completedTasks,
    failedTasks,

    // Getter functions (prefer messagesMap for reactivity)
    conversationById,
    messagesByConversation,
    tasksByConversationId,
    conversationsByAgent,
    conversationsByAgentType,
    taskById,
    resultByTaskId,
    isLoading,

    // Conversation mutations
    setConversation,
    setConversations,
    updateConversation,
    updateConversationTaskCounts,
    removeConversation,
    setActiveConversation,
    setLoading,

    // Message mutations
    addMessage,
    addAssistantMessage,
    addUserMessage,
    setMessages,
    clearMessages,
    updateMessageMetadata,
    updateMessage,

    // Task mutations
    addTask,
    updateTaskStatus,
    updateTaskMetadata,
    setTaskResult,
    clearTasksByConversation,

    // Error mutations
    setError,
    clearError,

    // Clear all
    clearAll,
  };
});
