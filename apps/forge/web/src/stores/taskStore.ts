/**
 * Task Store
 * Manages task lifecycle and execution state
 * Pure state management - handlers call actions, Vue reactivity updates UI
 */

import { defineStore } from 'pinia';
import { ref, shallowRef, computed, readonly } from 'vue';
import type { AgentTaskMode } from '@orchestrator-ai/transport-types';
import type { TaskStatus, TaskMetadata, TaskData } from '@/types/task';

// Re-export types
export type { TaskStatus, TaskMetadata, TaskData };

// Store-specific types
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

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: TaskData;
  error?: string;
  completedAt: string;
}

export const useTaskStore = defineStore('task', () => {
  // State - using shallowRef to avoid infinite type instantiation
  const tasks = shallowRef<Map<string, Task>>(new Map());
  const taskResults = shallowRef<Map<string, TaskResult>>(new Map());
  const activeTaskId = ref<string | null>(null);
  const tasksByConversation = ref<Map<string, string[]>>(new Map());

  // Getters
  const activeTask = computed(() => {
    if (!activeTaskId.value) return null;
    return tasks.value.get(activeTaskId.value) || null;
  });

  const taskById = (id: string): Task | undefined => {
    return tasks.value.get(id);
  };

  const resultByTaskId = (id: string): TaskResult | undefined => {
    return taskResults.value.get(id);
  };

  const tasksByConversationId = (conversationId: string): Task[] => {
    const taskIds = tasksByConversation.value.get(conversationId) || [];
    return taskIds
      .map(id => tasks.value.get(id))
      .filter((task): task is Task => task !== undefined)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const runningTasks = computed(() => {
    return Array.from(tasks.value.values())
      .filter(task => task.status === 'running')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  const completedTasks = computed(() => {
    return Array.from(tasks.value.values())
      .filter(task => task.status === 'completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  const failedTasks = computed(() => {
    return Array.from(tasks.value.values())
      .filter(task => task.status === 'failed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  // Actions - ONLY way to mutate state

  /**
   * Create a new task
   */
  function createTask(
    id: string,
    conversationId: string,
    mode: AgentTaskMode,
    action: string,
    metadata?: TaskMetadata
  ): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id,
      conversationId,
      mode,
      action,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    tasks.value.set(id, task);

    // Track task by conversation
    const conversationTasks = tasksByConversation.value.get(conversationId) || [];
    tasksByConversation.value.set(conversationId, [...conversationTasks, id]);

    return task;
  }

  /**
   * Update task status
   */
  function updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = tasks.value.get(taskId);
    if (task) {
      tasks.value.set(taskId, {
        ...task,
        status,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Update task metadata
   */
  function updateTaskMetadata(taskId: string, metadata: TaskMetadata): void {
    const task = tasks.value.get(taskId);
    if (task) {
      tasks.value.set(taskId, {
        ...task,
        metadata: { ...task.metadata, ...metadata },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Set task result
   * Called by handlers after successful response
   */
  function setTaskResult(taskId: string, result: Omit<TaskResult, 'taskId'>): void {
    const taskResult: TaskResult = {
      taskId,
      ...result,
    };

    taskResults.value.set(taskId, taskResult);

    // Update task status based on result
    updateTaskStatus(taskId, result.success ? 'completed' : 'failed');
  }

  /**
   * Set active task
   */
  function setActiveTask(taskId: string | null): void {
    if (taskId === null || tasks.value.has(taskId)) {
      activeTaskId.value = taskId;
    }
  }

  /**
   * Cancel a task
   */
  function cancelTask(taskId: string): void {
    updateTaskStatus(taskId, 'cancelled');
  }

  /**
   * Clear tasks by conversation
   */
  function clearTasksByConversation(conversationId: string): void {
    const taskIds = tasksByConversation.value.get(conversationId) || [];

    // Remove tasks and their results
    taskIds.forEach(taskId => {
      tasks.value.delete(taskId);
      taskResults.value.delete(taskId);
    });

    tasksByConversation.value.delete(conversationId);

    // Clear active task if it was in this conversation
    if (activeTaskId.value && taskIds.includes(activeTaskId.value)) {
      activeTaskId.value = null;
    }
  }

  /**
   * Clear all tasks (logout)
   */
  function clearAll(): void {
    tasks.value.clear();
    taskResults.value.clear();
    tasksByConversation.value.clear();
    activeTaskId.value = null;
  }

  // Return public API
  return {
    // State (read-only exposure)
    tasks: readonly(tasks),
    activeTaskId: readonly(activeTaskId),

    // Getters
    activeTask,
    taskById,
    resultByTaskId,
    tasksByConversationId,
    runningTasks,
    completedTasks,
    failedTasks,

    // Actions
    createTask,
    updateTaskStatus,
    updateTaskMetadata,
    setTaskResult,
    setActiveTask,
    cancelTask,
    clearTasksByConversation,
    clearAll,
  };
});
