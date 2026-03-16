/**
 * Unit Tests for Unified Conversations Store
 * Tests all mutations, getters, and computed properties
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useConversationsStore,
  type Conversation,
  type Message,
  type Task,
  type TaskResult,
} from '../conversationsStore';
import { AgentTaskMode } from '@orchestrator-ai/transport-types';

describe('ConversationsStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('1.1.T9: should initialize with empty state', () => {
      const store = useConversationsStore();

      expect(store.allConversations).toEqual([]);
      expect(store.activeConversation).toBeNull();
      expect(store.activeConversationId).toBeNull();
      expect(store.activeMessages).toEqual([]);
      expect(store.runningTasks).toEqual([]);
      expect(store.completedTasks).toEqual([]);
      expect(store.failedTasks).toEqual([]);
    });
  });

  describe('Conversation Mutations', () => {
    it('1.1.T1: should add conversation mutation (setConversation)', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentName: 'test-agent',
        agentType: 'context',
      };

      store.setConversation(conversation);

      expect(store.conversationById('conv-1')).toEqual(conversation);
      expect(store.allConversations).toHaveLength(1);
      expect(store.allConversations[0]).toEqual(conversation);
    });

    it('should update conversation', () => {
      const store = useConversationsStore();

      const originalUpdatedAt = '2024-01-01T00:00:00.000Z';
      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Original Title',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: originalUpdatedAt,
      };

      store.setConversation(conversation);
      store.updateConversation('conv-1', { title: 'Updated Title' });

      const updated = store.conversationById('conv-1');
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should update conversation task counts', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);
      // Note: updateConversationTaskCounts signature changed - it no longer accepts taskCount
      // This test is checking legacy behavior
      store.updateConversation('conv-1', {
        taskCount: 5,
        completedTasks: 2,
        failedTasks: 1,
        activeTasks: 2,
      });

      const updated = store.conversationById('conv-1');
      expect(updated?.taskCount).toBe(5);
      expect(updated?.completedTasks).toBe(2);
      expect(updated?.failedTasks).toBe(1);
      expect(updated?.activeTasks).toBe(2);
    });

    it('1.1.T4: should remove conversation and cascade delete messages/tasks', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      // Add messages
      store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      // Add task
      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test-action',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.addTask(task);

      // Verify data exists
      expect(store.conversationById('conv-1')).toBeTruthy();
      expect(store.messagesByConversation('conv-1')).toHaveLength(1);
      expect(store.tasksByConversationId('conv-1')).toHaveLength(1);

      // Remove conversation
      store.removeConversation('conv-1');

      // Verify cascade delete
      expect(store.conversationById('conv-1')).toBeUndefined();
      expect(store.messagesByConversation('conv-1')).toHaveLength(0);
      expect(store.tasksByConversationId('conv-1')).toHaveLength(0);
      expect(store.taskById('task-1')).toBeUndefined();
    });

    it('should set active conversation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);
      store.setActiveConversation('conv-1');

      expect(store.activeConversationId).toBe('conv-1');
      expect(store.activeConversation).toEqual(conversation);
    });

    it('should clear active conversation when removed', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);
      store.setActiveConversation('conv-1');

      expect(store.activeConversationId).toBe('conv-1');

      store.removeConversation('conv-1');

      expect(store.activeConversationId).toBeNull();
      expect(store.activeConversation).toBeNull();
    });
  });

  describe('Message Mutations', () => {
    it('1.1.T2: should add message mutation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      const message = store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello, world!',
        timestamp: new Date().toISOString(),
      });

      expect(message.id).toBeTruthy();
      expect(message.content).toBe('Hello, world!');
      expect(message.role).toBe('user');

      const messages = store.messagesByConversation('conv-1');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should set messages for conversation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Message 1',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Message 2',
          timestamp: new Date().toISOString(),
        },
      ];

      store.setMessages('conv-1', messages);

      expect(store.messagesByConversation('conv-1')).toEqual(messages);
    });

    it('should clear messages for conversation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      expect(store.messagesByConversation('conv-1')).toHaveLength(1);

      store.clearMessages('conv-1');

      expect(store.messagesByConversation('conv-1')).toHaveLength(0);
    });
  });

  describe('Task Mutations', () => {
    it('1.1.T3: should add task mutation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'send-message',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task);

      expect(store.taskById('task-1')).toEqual(task);
      expect(store.tasksByConversationId('conv-1')).toHaveLength(1);
      expect(store.tasksByConversationId('conv-1')[0]).toEqual(task);
    });

    it('should update task status', () => {
      const store = useConversationsStore();

      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task);
      store.updateTaskStatus('task-1', 'running');

      const updated = store.taskById('task-1');
      expect(updated?.status).toBe('running');
    });

    it('should update task metadata', () => {
      const store = useConversationsStore();

      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { priority: 'low' },
      };

      store.addTask(task);
      store.updateTaskMetadata('task-1', { priority: 'high', tags: ['test'] });

      const updated = store.taskById('task-1');
      expect(updated?.metadata?.priority).toBe('high');
      expect(updated?.metadata?.tags).toEqual(['test']);
    });

    it('should set task result and update status', () => {
      const store = useConversationsStore();

      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task);

      const result: Omit<TaskResult, 'taskId'> = {
        success: true,
        data: { output: { data: { result: 'success' } } },
        completedAt: new Date().toISOString(),
      };

      store.setTaskResult('task-1', result);

      const taskResult = store.resultByTaskId('task-1');
      expect(taskResult?.success).toBe(true);
      expect(taskResult?.data?.output?.data).toEqual({ result: 'success' });

      const updatedTask = store.taskById('task-1');
      expect(updatedTask?.status).toBe('completed');
    });

    it('should clear tasks by conversation', () => {
      const store = useConversationsStore();

      const task1: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const task2: Task = {
        id: 'task-2',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task1);
      store.addTask(task2);

      expect(store.tasksByConversationId('conv-1')).toHaveLength(2);

      store.clearTasksByConversation('conv-1');

      expect(store.tasksByConversationId('conv-1')).toHaveLength(0);
      expect(store.taskById('task-1')).toBeUndefined();
      expect(store.taskById('task-2')).toBeUndefined();
    });
  });

  describe('Getters', () => {
    it('1.1.T5: should get conversation by ID', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      expect(store.conversationById('conv-1')).toEqual(conversation);
      expect(store.conversationById('non-existent')).toBeUndefined();
    });

    it('1.1.T6: should get messages by conversation', () => {
      const store = useConversationsStore();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);

      store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'user',
        content: 'Message 1',
        timestamp: new Date().toISOString(),
      });

      store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Message 2',
        timestamp: new Date().toISOString(),
      });

      const messages = store.messagesByConversation('conv-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
    });

    it('1.1.T7: should get tasks by conversation', () => {
      const store = useConversationsStore();

      const task1: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const task2: Task = {
        id: 'task-2',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'completed',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      store.addTask(task1);
      store.addTask(task2);

      const tasks = store.tasksByConversationId('conv-1');
      expect(tasks).toHaveLength(2);
      // Should be sorted by createdAt descending
      expect(tasks[0].id).toBe('task-2');
      expect(tasks[1].id).toBe('task-1');
    });

    it('1.1.T8: should get active conversation computed', () => {
      const store = useConversationsStore();

      expect(store.activeConversation).toBeNull();

      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);
      store.setActiveConversation('conv-1');

      expect(store.activeConversation).toEqual(conversation);
    });

    it('should get conversations by agent name', () => {
      const store = useConversationsStore();

      const conv1: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test 1',
        agentName: 'agent-a',
        agentType: 'context',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const conv2: Conversation = {
        id: 'conv-2',
        userId: 'user-1',
        title: 'Test 2',
        agentName: 'agent-b',
        agentType: 'context',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conv1);
      store.setConversation(conv2);

      const agentAConvs = store.conversationsByAgent('agent-a');
      expect(agentAConvs).toHaveLength(1);
      expect(agentAConvs[0].id).toBe('conv-1');
    });

    it('should get conversations by agent type', () => {
      const store = useConversationsStore();

      const conv1: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test 1',
        agentType: 'context',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const conv2: Conversation = {
        id: 'conv-2',
        userId: 'user-1',
        title: 'Test 2',
        agentType: 'api',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conv1);
      store.setConversation(conv2);

      const contextConvs = store.conversationsByAgentType('context');
      expect(contextConvs).toHaveLength(1);
      expect(contextConvs[0].id).toBe('conv-1');
    });

    it('should get active conversations (not ended)', () => {
      const store = useConversationsStore();

      const conv1: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const conv2: Conversation = {
        id: 'conv-2',
        userId: 'user-1',
        title: 'Ended',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      store.setConversation(conv1);
      store.setConversation(conv2);

      const active = store.activeConversations;
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('conv-1');
    });

    it('should get running tasks', () => {
      const store = useConversationsStore();

      const task1: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const task2: Task = {
        id: 'task-2',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task1);
      store.addTask(task2);

      const running = store.runningTasks;
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe('task-1');
    });

    it('should get completed tasks', () => {
      const store = useConversationsStore();

      const task1: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const task2: Task = {
        id: 'task-2',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task1);
      store.addTask(task2);

      const completed = store.completedTasks;
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('task-1');
    });

    it('should get failed tasks', () => {
      const store = useConversationsStore();

      const task1: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'failed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const task2: Task = {
        id: 'task-2',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addTask(task1);
      store.addTask(task2);

      const failed = store.failedTasks;
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('task-1');
    });
  });

  describe('Clear Operations', () => {
    it('should clear all data', () => {
      const store = useConversationsStore();

      // Add some data
      const conversation: Conversation = {
        id: 'conv-1',
        userId: 'user-1',
        title: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.setConversation(conversation);
      store.addMessage('conv-1', {
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      const task: Task = {
        id: 'task-1',
        conversationId: 'conv-1',
        mode: AgentTaskMode.CONVERSE,
        action: 'test',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.addTask(task);

      store.setActiveConversation('conv-1');
      store.setError('Test error');

      // Clear all
      store.clearAll();

      // Verify everything is cleared
      expect(store.allConversations).toHaveLength(0);
      expect(store.activeConversation).toBeNull();
      expect(store.activeConversationId).toBeNull();
      expect(store.runningTasks).toHaveLength(0);
      expect(store.error).toBeNull();
    });
  });

  describe('Error Management', () => {
    it('should set and clear error', () => {
      const store = useConversationsStore();

      expect(store.error).toBeNull();

      store.setError('Test error message');
      expect(store.error).toBe('Test error message');

      store.clearError();
      expect(store.error).toBeNull();
    });
  });

  describe('Loading States', () => {
    it('should track loading state per conversation', () => {
      const store = useConversationsStore();

      expect(store.isLoading('conv-1')).toBe(false);

      store.setLoading('conv-1', true);
      expect(store.isLoading('conv-1')).toBe(true);

      store.setLoading('conv-1', false);
      expect(store.isLoading('conv-1')).toBe(false);
    });
  });
});
