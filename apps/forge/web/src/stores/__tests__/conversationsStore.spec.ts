/**
 * Unit Tests for ConversationsStore
 *
 * Tests pure state management for conversations, messages, and tasks.
 *
 * Key Testing Areas:
 * - Store initialization (empty state)
 * - Conversation CRUD (setConversation, updateConversation, removeConversation)
 * - Active conversation management
 * - Message mutations (addMessage, setMessages, updateMessage, clearMessages)
 * - Task mutations (addTask, updateTaskStatus, setTaskResult)
 * - Computed getters (allConversations, activeMessages, runningTasks, etc.)
 * - conversationsByAgent filtering and sorting
 * - Loading state management
 * - clearAll reset
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useConversationsStore, type Conversation, type Message, type Task } from '../conversationsStore';
import { AgentTaskMode } from '@/types/forge-types';

// Mock crypto.randomUUID so generated IDs are predictable
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `generated-uuid-${++uuidCounter}`),
});

// ============================================================================
// Helpers
// ============================================================================

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    title: 'Test Conversation',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    lastActiveAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message & { conversationId?: string }> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'Hello',
    timestamp: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    conversationId: 'conv-1',
    mode: AgentTaskMode.CONVERSE,
    action: 'send',
    status: 'running',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  setActivePinia(createPinia());
  uuidCounter = 0;
  vi.clearAllMocks();
});

// ============================================================================
// Store Initialization
// ============================================================================

describe('Store Initialization', () => {
  it('should start with no conversations', () => {
    const store = useConversationsStore();
    expect(store.allConversations).toEqual([]);
    expect(store.activeConversation).toBeNull();
    expect(store.activeConversationId).toBeNull();
  });

  it('should start with no active conversation', () => {
    const store = useConversationsStore();
    expect(store.activeConversation).toBeNull();
    expect(store.activeMessages).toEqual([]);
  });

  it('should start with no errors', () => {
    const store = useConversationsStore();
    expect(store.error).toBeNull();
  });

  it('should start with no running/completed/failed tasks', () => {
    const store = useConversationsStore();
    expect(store.runningTasks).toEqual([]);
    expect(store.completedTasks).toEqual([]);
    expect(store.failedTasks).toEqual([]);
  });
});

// ============================================================================
// Conversation CRUD
// ============================================================================

describe('Conversation Mutations', () => {
  it('should add a conversation via setConversation', () => {
    const store = useConversationsStore();
    const conv = makeConversation();

    store.setConversation(conv);

    expect(store.allConversations).toHaveLength(1);
    expect(store.conversationById('conv-1')).toEqual(conv);
  });

  it('should initialize empty messages and tasks when adding a conversation', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    expect(store.messagesByConversation('conv-1')).toEqual([]);
    expect(store.tasksByConversationId('conv-1')).toEqual([]);
  });

  it('should update a conversation via setConversations (batch)', () => {
    const store = useConversationsStore();
    const convs = [
      makeConversation({ id: 'conv-a', title: 'A' }),
      makeConversation({ id: 'conv-b', title: 'B' }),
    ];

    store.setConversations(convs);

    expect(store.allConversations).toHaveLength(2);
    expect(store.conversationById('conv-a')?.title).toBe('A');
    expect(store.conversationById('conv-b')?.title).toBe('B');
  });

  it('should update a conversation via updateConversation', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ title: 'Original Title' }));

    store.updateConversation('conv-1', { title: 'Updated Title' });

    expect(store.conversationById('conv-1')?.title).toBe('Updated Title');
  });

  it('should set updatedAt when updating a conversation', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ updatedAt: '2025-01-01T10:00:00Z' }));

    store.updateConversation('conv-1', { title: 'Changed' });

    const updated = store.conversationById('conv-1');
    // updatedAt should now be a more recent ISO string
    expect(updated?.updatedAt).not.toBe('2025-01-01T10:00:00Z');
  });

  it('should silently ignore updateConversation for unknown ID', () => {
    const store = useConversationsStore();

    // Should not throw
    expect(() => store.updateConversation('unknown-id', { title: 'X' })).not.toThrow();
  });

  it('should remove a conversation and its messages/tasks', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addMessage('conv-1', { conversationId: 'conv-1', role: 'user', content: 'hi', timestamp: '2025-01-01T10:00:00Z' });
    store.addTask(makeTask());

    store.removeConversation('conv-1');

    expect(store.conversationById('conv-1')).toBeUndefined();
    expect(store.messagesByConversation('conv-1')).toEqual([]);
    expect(store.tasksByConversationId('conv-1')).toEqual([]);
  });

  it('should clear active conversation when it is removed', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.setActiveConversation('conv-1');

    expect(store.activeConversationId).toBe('conv-1');

    store.removeConversation('conv-1');

    expect(store.activeConversationId).toBeNull();
  });
});

// ============================================================================
// Active Conversation
// ============================================================================

describe('Active Conversation Management', () => {
  it('should set the active conversation', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    store.setActiveConversation('conv-1');

    expect(store.activeConversationId).toBe('conv-1');
    expect(store.activeConversation).toMatchObject({ id: 'conv-1' });
  });

  it('should not set active to an ID that does not exist in store', () => {
    const store = useConversationsStore();

    store.setActiveConversation('nonexistent');

    expect(store.activeConversationId).toBeNull();
  });

  it('should clear active conversation when set to null', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.setActiveConversation('conv-1');

    store.setActiveConversation(null);

    expect(store.activeConversationId).toBeNull();
    expect(store.activeConversation).toBeNull();
  });
});

// ============================================================================
// allConversations sorting
// ============================================================================

describe('allConversations sorting', () => {
  it('should sort conversations by lastActiveAt descending', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-old', lastActiveAt: '2025-01-01T00:00:00Z' }));
    store.setConversation(makeConversation({ id: 'conv-new', lastActiveAt: '2025-01-05T00:00:00Z' }));

    const sorted = store.allConversations;

    expect(sorted[0].id).toBe('conv-new');
    expect(sorted[1].id).toBe('conv-old');
  });

  it('should sort by updatedAt when lastActiveAt is absent', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-a', lastActiveAt: undefined, updatedAt: '2025-01-03T00:00:00Z' }));
    store.setConversation(makeConversation({ id: 'conv-b', lastActiveAt: undefined, updatedAt: '2025-01-10T00:00:00Z' }));

    const sorted = store.allConversations;
    expect(sorted[0].id).toBe('conv-b');
  });
});

// ============================================================================
// activeConversations filter
// ============================================================================

describe('activeConversations', () => {
  it('should exclude ended conversations', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'active', endedAt: undefined }));
    store.setConversation(makeConversation({ id: 'ended', endedAt: '2025-01-02T00:00:00Z' }));

    const active = store.activeConversations;

    expect(active.map((c) => c.id)).toEqual(['active']);
  });
});

// ============================================================================
// Message Mutations
// ============================================================================

describe('Message Mutations', () => {
  it('should add a message and assign a generated ID', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    const msg = store.addMessage('conv-1', {
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello world',
      timestamp: '2025-01-01T10:00:00Z',
    });

    expect(msg.id).toBe('generated-uuid-1');
    expect(msg.content).toBe('Hello world');
    expect(store.messagesByConversation('conv-1')).toHaveLength(1);
  });

  it('should update conversation lastActiveAt when a message is added', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ lastActiveAt: '2025-01-01T10:00:00Z' }));

    store.addMessage('conv-1', {
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hi',
      timestamp: '2025-01-10T15:00:00Z',
    });

    const conv = store.conversationById('conv-1');
    expect(conv?.lastActiveAt).toBe('2025-01-10T15:00:00Z');
  });

  it('should set messages for a conversation via setMessages', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    const messages = [
      makeMessage({ id: 'msg-a', content: 'Message A' }),
      makeMessage({ id: 'msg-b', content: 'Message B' }),
    ];
    store.setMessages('conv-1', messages);

    const stored = store.messagesByConversation('conv-1');
    expect(stored).toHaveLength(2);
    expect(stored[0].content).toBe('Message A');
    expect(stored[1].content).toBe('Message B');
  });

  it('should clear messages via clearMessages', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addMessage('conv-1', { conversationId: 'conv-1', role: 'user', content: 'hi', timestamp: '2025-01-01T10:00:00Z' });

    store.clearMessages('conv-1');

    expect(store.messagesByConversation('conv-1')).toEqual([]);
  });

  it('should update message metadata', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    const msg = store.addMessage('conv-1', {
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Response',
      timestamp: '2025-01-01T10:00:00Z',
    });

    store.updateMessageMetadata('conv-1', msg.id, { provider: 'anthropic' } as never);

    const updatedMessages = store.messagesByConversation('conv-1');
    expect(updatedMessages[0].metadata).toMatchObject({ provider: 'anthropic' });
  });

  it('should update message content via updateMessage', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    const msg = store.addMessage('conv-1', {
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Original',
      timestamp: '2025-01-01T10:00:00Z',
    });

    store.updateMessage('conv-1', msg.id, { content: 'Updated content' });

    const messages = store.messagesByConversation('conv-1');
    expect(messages[0].content).toBe('Updated content');
  });

  it('should add user message via addUserMessage helper', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    store.addUserMessage('conv-1', 'User says hello');

    const messages = store.messagesByConversation('conv-1');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('User says hello');
  });

  it('should add assistant message via addAssistantMessage helper', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());

    store.addAssistantMessage('conv-1', { message: 'AI responds' });

    const messages = store.messagesByConversation('conv-1');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toBe('AI responds');
  });

  it('should return activeMessages for the active conversation', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.setActiveConversation('conv-1');
    store.addUserMessage('conv-1', 'Hello');

    expect(store.activeMessages).toHaveLength(1);
    expect(store.activeMessages[0].content).toBe('Hello');
  });
});

// ============================================================================
// Task Mutations
// ============================================================================

describe('Task Mutations', () => {
  it('should add a task', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addTask(makeTask());

    expect(store.runningTasks).toHaveLength(1);
    expect(store.taskById('task-1')).toBeDefined();
  });

  it('should update task status', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addTask(makeTask({ id: 'task-2', status: 'running' }));

    store.updateTaskStatus('task-2', 'completed');

    expect(store.taskById('task-2')?.status).toBe('completed');
    expect(store.runningTasks).toHaveLength(0);
    expect(store.completedTasks).toHaveLength(1);
  });

  it('should set task result and update status to completed on success', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addTask(makeTask({ id: 'task-3', status: 'running' }));

    store.setTaskResult('task-3', {
      success: true,
      data: undefined,
      completedAt: '2025-01-01T11:00:00Z',
    });

    expect(store.resultByTaskId('task-3')?.success).toBe(true);
    expect(store.taskById('task-3')?.status).toBe('completed');
  });

  it('should set task result and update status to failed on failure', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation());
    store.addTask(makeTask({ id: 'task-4', status: 'running' }));

    store.setTaskResult('task-4', {
      success: false,
      error: 'Something went wrong',
      completedAt: '2025-01-01T11:00:00Z',
    });

    expect(store.taskById('task-4')?.status).toBe('failed');
    expect(store.failedTasks).toHaveLength(1);
    expect(store.resultByTaskId('task-4')?.error).toBe('Something went wrong');
  });

  it('should retrieve tasks by conversation ID', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-a' }));
    store.setConversation(makeConversation({ id: 'conv-b' }));

    store.addTask(makeTask({ id: 'task-conv-a', conversationId: 'conv-a' }));
    store.addTask(makeTask({ id: 'task-conv-b', conversationId: 'conv-b' }));

    expect(store.tasksByConversationId('conv-a')).toHaveLength(1);
    expect(store.tasksByConversationId('conv-a')[0].id).toBe('task-conv-a');
  });
});

// ============================================================================
// conversationsByAgent
// ============================================================================

describe('conversationsByAgent', () => {
  it('should return conversations matching the agent name', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-blog', agentName: 'blog-post-writer', organizationSlug: 'test-org' }));
    store.setConversation(makeConversation({ id: 'conv-legal', agentName: 'legal-department', organizationSlug: 'test-org' }));

    const blogConvs = store.conversationsByAgent('blog-post-writer', 'test-org');

    expect(blogConvs).toHaveLength(1);
    expect(blogConvs[0].id).toBe('conv-blog');
  });

  it('should filter by organization slug when provided', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-org1', agentName: 'writer', organizationSlug: 'org-1' }));
    store.setConversation(makeConversation({ id: 'conv-org2', agentName: 'writer', organizationSlug: 'org-2' }));

    const org1Convs = store.conversationsByAgent('writer', 'org-1');

    expect(org1Convs).toHaveLength(1);
    expect(org1Convs[0].id).toBe('conv-org1');
  });

  it('should return conversations from all orgs when organizationSlug is undefined', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-a', agentName: 'assistant', organizationSlug: 'org-1' }));
    store.setConversation(makeConversation({ id: 'conv-b', agentName: 'assistant', organizationSlug: 'org-2' }));

    const allConvs = store.conversationsByAgent('assistant');

    expect(allConvs).toHaveLength(2);
  });

  it('should place dashboard agent conversations first', () => {
    const store = useConversationsStore();
    const baseDate = '2025-01-01T12:00:00Z';
    store.setConversation(makeConversation({ id: 'regular', agentName: 'assistant', lastActiveAt: baseDate }));
    store.setConversation(makeConversation({ id: 'legal', agentName: 'legal-department', lastActiveAt: baseDate }));

    // Searching for all conversations matching "assistant" vs "legal-department"
    // The sort puts dashboard agents first when mixing — here we just check
    // that conversations with dashboard agent names appear first in agent's own list
    const legalConvs = store.conversationsByAgent('legal-department');
    expect(legalConvs[0].id).toBe('legal');
  });

  it('should normalize agent name with underscores/hyphens', () => {
    const store = useConversationsStore();
    store.setConversation(makeConversation({ id: 'conv-1', agentName: 'blog_post_writer', organizationSlug: 'org' }));

    const result = store.conversationsByAgent('blog-post-writer', 'org');
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// Loading State
// ============================================================================

describe('Loading State', () => {
  it('should track loading state per conversation', () => {
    const store = useConversationsStore();

    store.setLoading('conv-1', true);

    expect(store.isLoading('conv-1')).toBe(true);
    expect(store.isLoading('conv-2')).toBe(false);
  });

  it('should clear loading state', () => {
    const store = useConversationsStore();
    store.setLoading('conv-1', true);

    store.setLoading('conv-1', false);

    expect(store.isLoading('conv-1')).toBe(false);
  });
});

// ============================================================================
// Error State
// ============================================================================

describe('Error State', () => {
  it('should set error message', () => {
    const store = useConversationsStore();

    store.setError('Something failed');

    expect(store.error).toBe('Something failed');
  });

  it('should clear error message', () => {
    const store = useConversationsStore();
    store.setError('Some error');

    store.clearError();

    expect(store.error).toBeNull();
  });
});

// ============================================================================
// clearAll
// ============================================================================

describe('clearAll', () => {
  it('should clear all conversations, messages, tasks, and active state', () => {
    const store = useConversationsStore();

    store.setConversation(makeConversation());
    store.setActiveConversation('conv-1');
    store.addUserMessage('conv-1', 'Hello');
    store.addTask(makeTask());
    store.setError('Some error');

    store.clearAll();

    expect(store.allConversations).toEqual([]);
    expect(store.activeConversationId).toBeNull();
    expect(store.activeMessages).toEqual([]);
    expect(store.runningTasks).toEqual([]);
    expect(store.error).toBeNull();
  });
});
